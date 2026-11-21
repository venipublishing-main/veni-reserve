-- Website candidate after M3.3. Read current M2 rows through the M3.2 executor.
begin;
grant reserve_schedule_executor to postgres;
grant select(public_visible,online_bookable,no_preference_eligible)
  on reserve_internal.staff_members to reserve_schedule_executor;
grant select(tenant_id,id,status,online_bookable,duration_minutes,buffer_before_minutes,
  buffer_after_minutes,min_notice_minutes,max_advance_days)
  on reserve_internal.services to reserve_schedule_executor;
grant select(tenant_id,kind,staff_id,service_id,location_id,enabled,duration_override_minutes,
  buffer_before_override_minutes,buffer_after_override_minutes,online_bookable_override)
  on reserve_internal.eligibility_links to reserve_schedule_executor;
create policy schedule_service_read on reserve_internal.services for select to reserve_schedule_executor
  using (reserve_internal.schedule_access(tenant_id,false));
create policy schedule_eligibility_read on reserve_internal.eligibility_links for select to reserve_schedule_executor
  using (reserve_internal.schedule_access(tenant_id,false));

create function reserve_internal.read_service_day(target uuid, service uuid, practitioner uuid,
  location uuid, on_date date, mode text)
returns jsonb language plpgsql stable security definer set search_path='' as $$
declare candidate record; identity jsonb;
begin
  if not reserve_internal.schedule_access(target,false) then
    raise insufficient_privilege using message='Service day unavailable';
  end if;
  if mode is null or mode not in ('NAMED','NO_PREFERENCE') or on_date is null
    or on_date not between date '0001-01-01' and date '9999-12-31' then
    raise exception using errcode='22023',message='Invalid service day';
  end if;

  select s.tenant_id,s.id as service_id,p.id as staff_id,l.id as location_id,
    case
      when s.status <> 'ACTIVE' then 'service_inactive'
      when p.status <> 'ACTIVE' then 'practitioner_inactive'
      when l.status <> 'ACTIVE' then 'location_inactive'
      when not s.online_bookable then 'service_offline'
      when not p.online_bookable then 'practitioner_offline'
      when mode='NAMED' and not p.public_visible then 'practitioner_hidden'
      when mode='NO_PREFERENCE' and not p.no_preference_eligible then 'no_preference_disabled'
      when ss.enabled is null then 'staff_service_unavailable'
      when sl.enabled is null then 'staff_location_unavailable'
      when vl.enabled is null then 'service_location_unavailable'
      when ss.online_bookable_override is false then 'staff_service_offline'
    end as reason,
    coalesce(ss.duration_override_minutes,s.duration_minutes) as duration_minutes,
    coalesce(ss.buffer_before_override_minutes,s.buffer_before_minutes) as buffer_before_minutes,
    coalesce(ss.buffer_after_override_minutes,s.buffer_after_minutes) as buffer_after_minutes,
    s.min_notice_minutes,s.max_advance_days
    into candidate
    from reserve_internal.services s
    join reserve_internal.staff_members p on p.tenant_id=s.tenant_id and p.id=practitioner
    join reserve_internal.locations l on l.tenant_id=s.tenant_id and l.id=location
    left join reserve_internal.eligibility_links ss on ss.tenant_id=s.tenant_id and ss.kind='STAFF_SERVICE'
      and ss.staff_id=p.id and ss.service_id=s.id and ss.enabled
    left join reserve_internal.eligibility_links sl on sl.tenant_id=s.tenant_id and sl.kind='STAFF_LOCATION'
      and sl.staff_id=p.id and sl.location_id=l.id and sl.enabled
    left join reserve_internal.eligibility_links vl on vl.tenant_id=s.tenant_id and vl.kind='SERVICE_LOCATION'
      and vl.service_id=s.id and vl.location_id=l.id and vl.enabled
    where s.tenant_id=target and s.id=service;
  if not found then raise insufficient_privilege using message='Service day unavailable'; end if;

  identity := jsonb_build_object('tenant_id',candidate.tenant_id,'service_id',candidate.service_id,
    'staff_id',candidate.staff_id,'location_id',candidate.location_id,'date',on_date,'mode',mode);
  if candidate.reason is not null then
    return identity || jsonb_build_object('eligible',false,'reason',candidate.reason);
  end if;
  return reserve_internal.read_availability_day(target,practitioner,location,on_date)
    || identity || jsonb_build_object('eligible',true,'online_bookable',true,
      'duration_minutes',candidate.duration_minutes,'buffer_before_minutes',candidate.buffer_before_minutes,
      'buffer_after_minutes',candidate.buffer_after_minutes,'min_notice_minutes',candidate.min_notice_minutes,
      'max_advance_days',candidate.max_advance_days);
end $$;
grant create on schema reserve_internal to reserve_schedule_executor;
alter function reserve_internal.read_service_day(uuid,uuid,uuid,uuid,date,text) owner to reserve_schedule_executor;
revoke create on schema reserve_internal from reserve_schedule_executor;
create function public.reserve_read_service_day(target uuid, service uuid, practitioner uuid,
  location uuid, on_date date, mode text)
returns jsonb language sql stable security invoker set search_path='' as $$
  select reserve_internal.read_service_day($1,$2,$3,$4,$5,$6)
$$;
revoke all on function public.reserve_read_service_day(uuid,uuid,uuid,uuid,date,text),
  reserve_internal.read_service_day(uuid,uuid,uuid,uuid,date,text) from public,anon,authenticated,service_role;
grant execute on function public.reserve_read_service_day(uuid,uuid,uuid,uuid,date,text),
  reserve_internal.read_service_day(uuid,uuid,uuid,uuid,date,text) to authenticated;
revoke reserve_schedule_executor from postgres;
notify pgrst,'reload schema';
commit;
