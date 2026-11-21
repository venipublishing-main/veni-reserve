-- Website ledger candidate after M3.2. All schedule authority is inherited from M3.2.
begin;
grant reserve_schedule_executor to postgres;
grant select(tenant_id,id,status,timezone_override) on reserve_internal.locations to reserve_schedule_executor;
create policy exception_location_read on reserve_internal.locations for select to reserve_schedule_executor
  using (reserve_internal.schedule_access(tenant_id,false));

-- Invert a local wall time using the IANA offsets surrounding this date. Round trips
-- discard nonexistent times; a repeated boundary has two distinct valid instants.
create function reserve_internal.wall_instants(wall timestamp, zone text) returns setof timestamptz
language sql stable strict set search_path = '' as $$
  with offsets as (
    select distinct (probe at time zone zone) - (probe at time zone 'UTC') as utc_offset
    from generate_series((wall at time zone 'UTC') - interval '48 hours',
      (wall at time zone 'UTC') + interval '48 hours', interval '6 hours') probe
  ), candidates as (select (wall - utc_offset) at time zone 'UTC' as instant from offsets)
  select instant from candidates where instant at time zone zone = wall
$$;

-- Local dates can be 23 or 25 hours. Outermost fold endpoints cover both
-- occurrences. A missing partial endpoint widens the exclusion to the civil day.
create function reserve_internal.exception_window(day date, zone text, opens integer, closes integer)
returns tstzrange language plpgsql stable set search_path = '' as $$
declare first_at timestamptz; last_at timestamptz;
begin
  if opens is not null then
    select min(t) into first_at from reserve_internal.wall_instants(day + opens * interval '1 minute',zone) t;
    select max(t) into last_at from reserve_internal.wall_instants(day + closes * interval '1 minute',zone) t;
    if first_at < last_at then return tstzrange(first_at,last_at,'[)'); end if;
  end if;
  select min(t) into first_at from reserve_internal.wall_instants(day::timestamp,zone) t;
  select max(t) into last_at from reserve_internal.wall_instants((day+1)::timestamp,zone) t;
  -- For a skipped midnight/date use a conservative UTC envelope at that edge.
  return tstzrange(coalesce(first_at,(day::timestamp at time zone 'UTC') - interval '24 hours'),
    coalesce(last_at,((day+1)::timestamp at time zone 'UTC') + interval '24 hours'),'[)');
end $$;

create table reserve_internal.availability_exception_revisions (
  tenant_id uuid not null, exception_id uuid not null,
  revision integer not null check (revision > 0),
  staff_id uuid, location_id uuid,
  local_date date not null check (local_date between date '0001-01-01' and date '9999-12-31'),
  timezone text not null, opens integer, closes integer,
  blocked tstzrange not null check (not isempty(blocked)),
  cancelled boolean not null,
  actor_user_id uuid not null references reserve.users(id),
  actor_membership_id uuid not null references reserve.memberships(id),
  changed_at timestamptz not null default statement_timestamp(),
  primary key(tenant_id,exception_id,revision),
  foreign key(tenant_id,staff_id) references reserve_internal.staff_members(tenant_id,id),
  foreign key(tenant_id,location_id) references reserve_internal.locations(tenant_id,id),
  check (num_nonnulls(staff_id,location_id)=1),
  check ((opens is null and closes is null) or
    (opens is not null and closes is not null and opens >= 0 and opens < closes and closes <= 1440))
);
create index exception_staff_day on reserve_internal.availability_exception_revisions(tenant_id,staff_id,local_date)
  where staff_id is not null;
create index exception_location_day on reserve_internal.availability_exception_revisions(tenant_id,location_id,local_date)
  where location_id is not null;
create index exception_blocked on reserve_internal.availability_exception_revisions using gist(blocked);
create trigger exception_history_immutable before update or delete or truncate on reserve_internal.availability_exception_revisions
  for each statement execute function reserve_internal.reject_mutation();
alter table reserve_internal.availability_exception_revisions enable row level security;
revoke all on reserve_internal.availability_exception_revisions from public,anon,authenticated,service_role;
grant select,insert on reserve_internal.availability_exception_revisions to reserve_schedule_executor;
create policy exception_read on reserve_internal.availability_exception_revisions for select to reserve_schedule_executor
  using (reserve_internal.schedule_access(tenant_id,false));
create policy exception_append on reserve_internal.availability_exception_revisions for insert to reserve_schedule_executor
  with check (reserve_internal.schedule_access(tenant_id,true) and actor_user_id=reserve_internal.schedule_actor()
    and actor_membership_id=reserve_internal.current_membership_id(tenant_id));

create function reserve_internal.save_dated_exception(target uuid, entry uuid, practitioner uuid, location uuid,
  on_date date, opens integer, closes integer, expected integer, cancel boolean)
returns jsonb language plpgsql volatile security definer set search_path='' as $$
declare prior reserve_internal.availability_exception_revisions; zone text; span tstzrange; next_revision integer;
begin
  if not reserve_internal.schedule_access(target,true) then raise insufficient_privilege using message='Exception unavailable'; end if;
  if entry is null or num_nonnulls(practitioner,location)<>1 or expected is null or expected not between 0 and 2147483646
    or cancel is null or on_date is null or on_date not between date '0001-01-01' and date '9999-12-31'
    or num_nonnulls(opens,closes)=1 or opens<0 or closes>1440 or opens>=closes
    or (cancel and (expected=0 or opens is not null)) then
    raise exception using errcode='22023',message='Invalid dated exception';
  end if;
  if practitioner is not null then
    zone := reserve_internal.read_practitioner_schedule(target,practitioner,on_date)->>'timezone';
  else
    select coalesce(l.timezone_override,b.timezone) into zone from reserve_internal.locations l
      join reserve_internal.tenant_business_settings b using(tenant_id)
      where l.tenant_id=target and l.id=location and l.status='ACTIVE';
  end if;
  if zone is null then raise insufficient_privilege using message='Exception unavailable'; end if;

  select * into prior from reserve_internal.availability_exception_revisions
    where tenant_id=target and exception_id=entry order by revision desc limit 1;
  if coalesce(prior.revision,0)<>expected or prior.cancelled then
    raise exception using errcode='PT409',message='Exception revision conflict';
  end if;
  if expected>0 then
    if prior.staff_id is distinct from practitioner or prior.location_id is distinct from location or prior.local_date<>on_date
      then raise exception using errcode='22023',message='Subject and date are immutable'; end if;
    zone := prior.timezone;
  end if;
  if cancel then
    opens := prior.opens; closes := prior.closes; span := prior.blocked;
  else
    span := reserve_internal.exception_window(on_date,zone,opens,closes);
  end if;
  insert into reserve_internal.availability_exception_revisions(tenant_id,exception_id,revision,staff_id,location_id,
    local_date,timezone,opens,closes,blocked,cancelled,actor_user_id,actor_membership_id)
  values(target,entry,expected+1,practitioner,location,on_date,zone,opens,closes,span,cancel,
    reserve_internal.schedule_actor(),reserve_internal.current_membership_id(target))
  on conflict (tenant_id,exception_id,revision) do nothing returning revision into next_revision;
  if next_revision is null then raise exception using errcode='PT409',message='Exception revision conflict'; end if;
  return jsonb_build_object('exception_id',entry,'revision',next_revision,'cancelled',cancel);
end $$;

create function reserve_internal.read_availability_day(target uuid, practitioner uuid, location uuid, on_date date)
returns jsonb language plpgsql stable security definer set search_path='' as $$
declare schedule jsonb; envelope tstzrange; exclusions jsonb;
begin
  if on_date is null or on_date not between date '0001-01-01' and date '9999-12-31' then
    raise exception using errcode='22023',message='Invalid local date';
  end if;
  if not exists(select from reserve_internal.locations where tenant_id=target and id=location and status='ACTIVE')
    then raise insufficient_privilege using message='Location unavailable'; end if;
  schedule := reserve_internal.read_practitioner_schedule(target,practitioner,on_date);
  envelope := reserve_internal.exception_window(on_date,schedule->>'timezone',null,null);
  select coalesce(jsonb_agg(jsonb_build_object('exception_id',e.exception_id,'revision',e.revision,
    'staff_id',e.staff_id,'location_id',e.location_id,'local_date',e.local_date,'timezone',e.timezone,
    'start',extract(epoch from lower(e.blocked))*1000,'end',extract(epoch from upper(e.blocked))*1000)
    order by e.exception_id),'[]'::jsonb) into exclusions
  from reserve_internal.availability_exception_revisions e
  where e.tenant_id=target and (e.staff_id=practitioner or e.location_id=location)
    and e.blocked && envelope and not e.cancelled
    and not exists(select from reserve_internal.availability_exception_revisions newer
      where newer.tenant_id=e.tenant_id and newer.exception_id=e.exception_id and newer.revision>e.revision);
  return schedule || jsonb_build_object('location_id',location,'exclusions',exclusions);
end $$;

grant create on schema reserve_internal to reserve_schedule_executor;
alter function reserve_internal.read_availability_day(uuid,uuid,uuid,date) owner to reserve_schedule_executor;
alter function reserve_internal.save_dated_exception(uuid,uuid,uuid,uuid,date,integer,integer,integer,boolean) owner to reserve_schedule_executor;
revoke create on schema reserve_internal from reserve_schedule_executor;
revoke all on function reserve_internal.wall_instants(timestamp,text),reserve_internal.exception_window(date,text,integer,integer)
  from public,anon,authenticated,service_role;
grant execute on function reserve_internal.wall_instants(timestamp,text),reserve_internal.exception_window(date,text,integer,integer)
  to reserve_schedule_executor;

create function public.reserve_read_availability_day(target uuid, practitioner uuid, location uuid, on_date date)
returns jsonb language sql stable security invoker set search_path='' as $$
  select reserve_internal.read_availability_day($1,$2,$3,$4)
$$;
create function public.reserve_save_dated_exception(target uuid, entry uuid, practitioner uuid, location uuid,
  on_date date, opens integer, closes integer, expected integer, cancel boolean)
returns jsonb language sql volatile security invoker set search_path='' as $$
  select reserve_internal.save_dated_exception($1,$2,$3,$4,$5,$6,$7,$8,$9)
$$;
revoke all on function public.reserve_read_availability_day(uuid,uuid,uuid,date),reserve_internal.read_availability_day(uuid,uuid,uuid,date),
  public.reserve_save_dated_exception(uuid,uuid,uuid,uuid,date,integer,integer,integer,boolean),
  reserve_internal.save_dated_exception(uuid,uuid,uuid,uuid,date,integer,integer,integer,boolean) from public,anon,authenticated,service_role;
grant execute on function public.reserve_read_availability_day(uuid,uuid,uuid,date),reserve_internal.read_availability_day(uuid,uuid,uuid,date),
  public.reserve_save_dated_exception(uuid,uuid,uuid,uuid,date,integer,integer,integer,boolean),
  reserve_internal.save_dated_exception(uuid,uuid,uuid,uuid,date,integer,integer,integer,boolean) to authenticated;
revoke reserve_schedule_executor from postgres;
notify pgrst,'reload schema';
commit;
