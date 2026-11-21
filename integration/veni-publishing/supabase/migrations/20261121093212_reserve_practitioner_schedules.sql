-- Candidate for the Website-owned ledger after the nine Reserve foundation migrations.
begin;

create role reserve_schedule_executor nologin noinherit nobypassrls;
grant reserve_schedule_executor to postgres;
grant usage on schema reserve_internal to reserve_schedule_executor;
grant execute on function reserve_internal.tenant_access_enabled(uuid),
  reserve_internal.current_membership_id(uuid), reserve_internal.has_capability(uuid,text)
  to reserve_schedule_executor;

-- Website owns the approved-client decision. The standalone candidate denies all
-- clients until an operator binds this private predicate to the environment's registry.
create function reserve_internal.schedule_client_approved(client uuid) returns boolean
language sql stable security invoker set search_path = '' as $$ select false $$;
revoke all on function reserve_internal.schedule_client_approved(uuid) from public,anon,authenticated,service_role;

create function reserve_internal.schedule_actor() returns uuid
language sql stable security definer set search_path = '' as $$
  select s.user_id from auth.sessions s
  join auth.oauth_clients c on c.id = s.oauth_client_id and c.client_type = 'confidential' and c.deleted_at is null
  join auth.oauth_consents g on g.user_id = s.user_id and g.client_id = c.id and g.revoked_at is null
  where s.user_id = reserve_internal.authenticated_session_user()
    and s.id::text = auth.jwt()->>'session_id' and c.id::text = auth.jwt()->>'client_id'
    and reserve_internal.schedule_client_approved(c.id)
$$;

create function reserve_internal.schedule_access(target uuid, editing boolean) returns boolean
language sql stable security invoker set search_path = '' as $$
  select reserve_internal.schedule_actor() is not null and reserve_internal.tenant_access_enabled(target)
    and (reserve_internal.has_capability(target,'availability.manage_all')
      or (not editing and reserve_internal.has_capability(target,'availability.read_all')))
$$;

-- Week is Sunday-first. Sorted, disjoint, non-touching periods are the canonical wire
-- and storage shape. Requiring touching intervals to be combined preserves the grid anchor.
create function reserve_internal.valid_schedule_week(week jsonb) returns boolean
language plpgsql immutable set search_path = '' as $$
declare day jsonb; period jsonb; previous_end integer; opening numeric; closing numeric;
begin
  if jsonb_typeof(week) is distinct from 'array' then return false; end if;
  if jsonb_array_length(week) <> 7 then return false; end if;
  for day in select value from jsonb_array_elements(week) loop
    if jsonb_typeof(day) <> 'array' then return false; end if;
    previous_end := -1;
    for period in select value from jsonb_array_elements(day) loop
      if jsonb_typeof(period) <> 'object' then return false; end if;
      if period - 'opens' - 'closes' <> '{}' or jsonb_typeof(period->'opens') is distinct from 'number'
        or jsonb_typeof(period->'closes') is distinct from 'number' then return false; end if;
      opening := (period->>'opens')::numeric;
      closing := (period->>'closes')::numeric;
      if opening <> trunc(opening) or closing <> trunc(closing) or opening <= previous_end
        or opening < 0 or closing <= opening or closing > 1440 then return false; end if;
      previous_end := closing::integer;
    end loop;
  end loop;
  return true;
end $$;

create table reserve_internal.practitioner_schedule_revisions (
  tenant_id uuid not null,
  staff_id uuid not null,
  revision integer not null check (revision > 0),
  week jsonb not null check (reserve_internal.valid_schedule_week(week)),
  timezone text not null,
  actor_user_id uuid not null references reserve.users(id),
  actor_membership_id uuid not null references reserve.memberships(id),
  changed_at timestamptz not null default statement_timestamp(),
  primary key (tenant_id,staff_id,revision),
  foreign key (tenant_id,staff_id) references reserve_internal.staff_members(tenant_id,id)
);
create trigger schedule_history_immutable before update or delete or truncate
on reserve_internal.practitioner_schedule_revisions for each statement execute function reserve_internal.reject_mutation();
alter table reserve_internal.practitioner_schedule_revisions enable row level security;
revoke all on reserve_internal.practitioner_schedule_revisions from public,anon,authenticated,service_role;
grant select,insert on reserve_internal.practitioner_schedule_revisions to reserve_schedule_executor;
create policy schedule_read on reserve_internal.practitioner_schedule_revisions for select to reserve_schedule_executor
  using (reserve_internal.schedule_access(tenant_id,false));
create policy schedule_append on reserve_internal.practitioner_schedule_revisions for insert to reserve_schedule_executor
  with check (reserve_internal.schedule_access(tenant_id,true)
    and actor_user_id = reserve_internal.schedule_actor()
    and actor_membership_id = reserve_internal.current_membership_id(tenant_id));

grant select(tenant_id,id,status) on reserve_internal.staff_members to reserve_schedule_executor;
create policy schedule_staff_read on reserve_internal.staff_members for select to reserve_schedule_executor
  using (reserve_internal.schedule_access(tenant_id,false));
grant select(tenant_id,timezone) on reserve_internal.tenant_business_settings to reserve_schedule_executor;
create policy schedule_timezone_read on reserve_internal.tenant_business_settings for select to reserve_schedule_executor
  using (reserve_internal.schedule_access(tenant_id,false));

create function reserve_internal.read_practitioner_schedule(target uuid, practitioner uuid, on_date date)
returns jsonb language plpgsql stable security definer set search_path = '' as $$
declare saved reserve_internal.practitioner_schedule_revisions; zone text; result jsonb; week jsonb;
begin
  if not exists(select from reserve_internal.staff_members
    where tenant_id = target and id = practitioner and status = 'ACTIVE')
    then raise insufficient_privilege using message = 'Schedule unavailable'; end if;
  select * into saved from reserve_internal.practitioner_schedule_revisions
    where tenant_id = target and staff_id = practitioner order by revision desc limit 1;
  select timezone into zone from reserve_internal.tenant_business_settings where tenant_id = target;
  if zone is null then raise exception using errcode = '22023', message = 'Configure the business timezone'; end if;
  week := coalesce(saved.week, '[[],[],[],[],[],[],[]]'::jsonb);
  result := jsonb_build_object('tenant_id',target,'staff_id',practitioner,'revision',coalesce(saved.revision,0),
    'timezone',coalesce(saved.timezone,zone));
  if on_date is null then return result || jsonb_build_object('week',week); end if;
  if not isfinite(on_date) then raise exception using errcode='22023', message='Invalid date'; end if;
  return result || jsonb_build_object('date',on_date,'periods',week->(extract(dow from on_date)::integer));
end $$;

create function reserve_internal.save_practitioner_schedule(target uuid, practitioner uuid, expected integer, week jsonb)
returns jsonb language plpgsql volatile security definer set search_path = '' as $$
declare current_schedule jsonb; zone text; saved integer;
begin
  if not reserve_internal.schedule_access(target,true) then raise insufficient_privilege using message='Schedule unavailable'; end if;
  current_schedule := reserve_internal.read_practitioner_schedule(target,practitioner,null);
  if expected is null or expected not between 0 and 2147483646 or not reserve_internal.valid_schedule_week(week)
    then raise exception using errcode='22023', message='Invalid schedule or revision'; end if;
  if expected = (current_schedule->>'revision')::integer then
    zone := current_schedule->>'timezone'; -- Preserve the schedule's wall-clock zone across revisions.
    insert into reserve_internal.practitioner_schedule_revisions(tenant_id,staff_id,revision,week,timezone,actor_user_id,actor_membership_id)
    values(target,practitioner,expected+1,week,zone,reserve_internal.schedule_actor(),reserve_internal.current_membership_id(target))
    on conflict (tenant_id,staff_id,revision) do nothing returning revision into saved;
  end if;
  if saved is null then raise exception using errcode='PT409', message='Schedule revision conflict'; end if;
  return jsonb_build_object('tenant_id',target,'staff_id',practitioner,'revision',saved,'timezone',zone,'week',week);
end $$;

grant create on schema reserve_internal to reserve_schedule_executor;
alter function reserve_internal.read_practitioner_schedule(uuid,uuid,date) owner to reserve_schedule_executor;
alter function reserve_internal.save_practitioner_schedule(uuid,uuid,integer,jsonb) owner to reserve_schedule_executor;
revoke create on schema reserve_internal from reserve_schedule_executor;
revoke all on function reserve_internal.schedule_actor(),reserve_internal.schedule_access(uuid,boolean),
  reserve_internal.valid_schedule_week(jsonb) from public,anon,authenticated,service_role;
grant execute on function reserve_internal.schedule_actor(),reserve_internal.schedule_access(uuid,boolean),
  reserve_internal.valid_schedule_week(jsonb) to reserve_schedule_executor;

create function public.reserve_read_practitioner_schedule(target uuid, practitioner uuid, on_date date default null)
returns jsonb language sql stable security invoker set search_path = '' as $$
  select reserve_internal.read_practitioner_schedule(target,practitioner,on_date)
$$;
create function public.reserve_save_practitioner_schedule(target uuid, practitioner uuid, expected integer, week jsonb)
returns jsonb language sql volatile security invoker set search_path = '' as $$
  select reserve_internal.save_practitioner_schedule(target,practitioner,expected,week)
$$;
revoke all on function reserve_internal.read_practitioner_schedule(uuid,uuid,date),
  reserve_internal.save_practitioner_schedule(uuid,uuid,integer,jsonb),public.reserve_read_practitioner_schedule(uuid,uuid,date),
  public.reserve_save_practitioner_schedule(uuid,uuid,integer,jsonb) from public,anon,authenticated,service_role;
grant execute on function reserve_internal.read_practitioner_schedule(uuid,uuid,date),
  reserve_internal.save_practitioner_schedule(uuid,uuid,integer,jsonb),public.reserve_read_practitioner_schedule(uuid,uuid,date),
  public.reserve_save_practitioner_schedule(uuid,uuid,integer,jsonb) to authenticated;
revoke reserve_schedule_executor from postgres;
notify pgrst,'reload schema';
commit;
