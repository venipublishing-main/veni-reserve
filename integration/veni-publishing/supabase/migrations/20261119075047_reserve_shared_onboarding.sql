-- Candidate for the Website-owned primary migration ledger, after the nine shared Reserve migrations.
begin;
create role reserve_onboarding_executor nologin noinherit nobypassrls;
grant reserve_onboarding_executor to postgres;
-- The catalogue functions belong to dedicated roles. Scope these grantor memberships to this transaction.
do $$
begin
  if exists(select from pg_auth_members m join pg_roles r on r.oid = m.roleid
    where m.member = 'postgres'::regrole and m.grantor = 'postgres'::regrole and r.rolname in
      ('reserve_settings_executor','reserve_service_executor','reserve_location_executor','reserve_staff_executor')) then
    raise exception 'Existing executor membership differs from the reviewed Website baseline';
  end if;
end $$;
grant reserve_settings_executor, reserve_service_executor, reserve_location_executor, reserve_staff_executor to postgres;
grant usage on schema reserve, reserve_internal to reserve_onboarding_executor;
grant execute on function reserve_internal.authenticated_session_user(),
  reserve_internal.current_membership_id(uuid), reserve_internal.tenant_access_enabled(uuid),
  reserve_internal.has_capability(uuid,text), reserve_internal.service_integer(jsonb,integer,integer),
  reserve_internal.read_tenant_business_settings(uuid), reserve_internal.list_tenant_locations(uuid),
  reserve_internal.list_tenant_staff(uuid), reserve_internal.list_tenant_services(uuid),
  reserve_internal.list_tenant_eligibility(uuid) to reserve_onboarding_executor;

-- Limit the existing deferred tenant-owner invariant to the caller's own membership.
grant select(id,status) on reserve.tenants to reserve_onboarding_executor;
grant update(status) on reserve.tenants to reserve_onboarding_executor;
grant select(id,tenant_id,status) on reserve.memberships to reserve_onboarding_executor;
grant select(membership_id,role_id) on reserve.membership_roles to reserve_onboarding_executor;
create policy onboarding_self_membership on reserve.memberships for select to reserve_onboarding_executor
  using (id = reserve_internal.current_membership_id(tenant_id));
create policy onboarding_self_roles on reserve.membership_roles for select to reserve_onboarding_executor
  using (exists(select from reserve.memberships m where m.id = membership_id));

create function reserve_internal.onboarding_owner(target uuid) returns boolean
language sql stable security invoker set search_path = '' as $$
  select reserve_internal.authenticated_session_user() is not null and reserve_internal.tenant_access_enabled(target)
    and exists(select from reserve.membership_roles where membership_id = reserve_internal.current_membership_id(target)
      and role_id = '10000000-0000-4000-8000-000000000001')
$$;
create policy onboarding_tenant_read on reserve.tenants for select to reserve_onboarding_executor
  using (reserve_internal.onboarding_owner(id));
create policy onboarding_tenant_activation on reserve.tenants for update to reserve_onboarding_executor
  using (status = 'SETUP' and reserve_internal.onboarding_owner(id))
  with check (status = 'ACTIVE' and reserve_internal.onboarding_owner(id));

create function reserve_internal.valid_onboarding_details(details jsonb) returns boolean
language plpgsql immutable security invoker set search_path = '' as $$
declare slot jsonb; notice integer; advance_days integer;
begin
  if jsonb_typeof(details) is distinct from 'object' then return false; end if;
  notice := reserve_internal.service_integer(details->'min_notice_minutes',0,43200);
  advance_days := reserve_internal.service_integer(details->'max_advance_days',1,730);
  if not (details ?& array['email','phone','hours','min_notice_minutes','max_advance_days'])
    or (select count(*) from jsonb_object_keys(details)) <> 5
    or jsonb_typeof(details->'email') <> 'string' or length(details->>'email') > 254
    or (details->>'email' <> '' and details->>'email' !~ '^[^[:space:]@<>]+@[^[:space:]@<>]+[.][^[:space:]@<>]+$')
    or jsonb_typeof(details->'phone') <> 'string' or details->>'phone' !~ '^[0-9+(). -]{0,40}$'
    or (details->>'phone' <> '' and details->>'phone' !~ '[0-9]')
    or notice is null or advance_days is null or notice >= 1440 * advance_days
    or jsonb_typeof(details->'hours') <> 'array' then return false; end if;
  if jsonb_array_length(details->'hours') <> 7 then return false; end if;
  for slot in select value from jsonb_array_elements(details->'hours') loop
    if slot = 'null'::jsonb then continue; end if;
    if jsonb_typeof(slot) <> 'array' then return false; end if;
    if jsonb_array_length(slot) <> 2 or jsonb_typeof(slot->0) <> 'string' or jsonb_typeof(slot->1) <> 'string'
      or slot->>0 !~ '^([01][0-9]|2[0-3]):[0-5][0-9]$' or slot->>1 !~ '^([01][0-9]|2[0-3]):[0-5][0-9]$'
      or (slot->>0) collate "C" >= (slot->>1) collate "C" then return false; end if;
  end loop;
  return true;
end $$;
create table reserve_internal.business_onboarding (
  tenant_id uuid primary key references reserve.tenants(id),
  details jsonb not null check (reserve_internal.valid_onboarding_details(details)),
  revision integer not null check (revision > 0),
  decision text not null check (decision in ('draft','pending_entitlement','activated')),
  updated_by uuid not null references reserve.users(id),
  updated_at timestamptz not null default now()
);
alter table reserve_internal.business_onboarding enable row level security;
revoke all on reserve_internal.business_onboarding from public, anon, authenticated, service_role;
grant select, insert on reserve_internal.business_onboarding to reserve_onboarding_executor;
grant update(details,revision,decision,updated_at,updated_by) on reserve_internal.business_onboarding to reserve_onboarding_executor;
create policy onboarding_owner_access on reserve_internal.business_onboarding to reserve_onboarding_executor
  using (reserve_internal.onboarding_owner(tenant_id))
  with check (reserve_internal.onboarding_owner(tenant_id) and updated_by = reserve_internal.authenticated_session_user());

-- Website replaces this empty adapter with its trusted current decision. No application role writes grants.
create function reserve_internal.account_publish_entitlement(target uuid)
returns table (business_id uuid, product text, capability text, basis text, valid_from timestamptz,
  expires_at timestamptz, revoked_at timestamptz)
language sql stable security invoker set search_path = '' as $$
  select null::uuid,null::text,null::text,null::text,null::timestamptz,null::timestamptz,null::timestamptz where false
$$;

create function reserve_internal.read_business_onboarding(target uuid) returns jsonb
language plpgsql stable security definer set search_path = '' as $$
declare
  saved reserve_internal.business_onboarding;
  profile jsonb; locations jsonb; services jsonb; staff jsonb; links jsonb;
  checks jsonb; linked boolean; entitled boolean; phase text;
begin
  if not reserve_internal.onboarding_owner(target) then return '{"error":"tenant_unavailable"}'; end if;
  select * into saved from reserve_internal.business_onboarding where tenant_id = target;
  profile := reserve_internal.read_tenant_business_settings(target);
  locations := reserve_internal.list_tenant_locations(target)->'locations';
  services := reserve_internal.list_tenant_services(target)->'services';
  staff := reserve_internal.list_tenant_staff(target)->'staff';
  links := reserve_internal.list_tenant_eligibility(target)->'eligibility';
  if profile->>'state' is null or locations is null or services is null or staff is null or links is null
    then return '{"error":"dependency_unavailable"}'; end if;
  -- Same three explicit links as the catalogue's structuralCandidates. Support named and no-preference staff.
  with enabled as (select value as link from jsonb_array_elements(links) where value->'enabled' = 'true')
  select exists(select from enabled ss
    join enabled sl on sl.link->>'staff_id' = ss.link->>'staff_id' and sl.link->>'kind' = 'STAFF_LOCATION'
    join enabled vl on vl.link->>'service_id' = ss.link->>'service_id' and vl.link->>'location_id' = sl.link->>'location_id'
      and vl.link->>'kind' = 'SERVICE_LOCATION'
    join jsonb_array_elements(staff) m on m->>'staff_id' = ss.link->>'staff_id'
    join jsonb_array_elements(services) s on s->>'service_id' = ss.link->>'service_id'
    join jsonb_array_elements(locations) l on l->>'location_id' = sl.link->>'location_id'
    where ss.link->>'kind' = 'STAFF_SERVICE' and m->>'status' = 'ACTIVE' and s->>'status' = 'ACTIVE'
      and l->>'status' = 'ACTIVE' and m->'online_bookable' = 'true'
      and (m->'public_visible' = 'true' or m->'no_preference_eligible' = 'true')
      and coalesce(ss.link->>'online_bookable_override',s->>'online_bookable') = 'true') into linked;
  checks := jsonb_build_object('identity',profile->>'state' = 'configured',
    'contact',coalesce(saved.details->>'email','') <> '' or coalesce(saved.details->>'phone','') <> '',
    'hours',exists(select from jsonb_array_elements(saved.details->'hours') h where h <> 'null'::jsonb),
    'location',jsonb_path_exists(locations,'$[*] ? (@.status == "ACTIVE")'),
    'service',jsonb_path_exists(services,'$[*] ? (@.status == "ACTIVE")'),
    'staff',jsonb_path_exists(staff,'$[*] ? (@.status == "ACTIVE")'), 'eligibility',linked);
  select exists(select from reserve_internal.account_publish_entitlement(target) e
    where e.business_id = target and e.product = 'reserve' and e.capability = 'publish'
      and e.basis in ('subscription','free_pilot') and e.revoked_at is null
      and e.valid_from <= statement_timestamp() and statement_timestamp() < e.expires_at) into entitled;
  phase := coalesce(saved.decision,'draft');
  if phase = 'activated' and not entitled then phase := 'pending_entitlement'; end if;
  if exists(select from jsonb_each(checks) where value = 'false') then phase := 'draft'; end if;
  return jsonb_build_object('details',saved.details,'revision',coalesce(saved.revision,0),
    'status',phase,'entitled',entitled,'checks',checks,
    'summary',jsonb_build_object('business',profile->'settings'->'display_name','timezone',profile->'settings'->'timezone',
      'locations',jsonb_path_query_array(locations,'$[*] ? (@.status == "ACTIVE").name'),
      'services',coalesce((select jsonb_agg(jsonb_build_object('name',v->'name','minutes',v->'duration_minutes') order by v->>'name',v->>'service_id')
        from jsonb_array_elements(services) v where v->>'status' = 'ACTIVE'),'[]'),
      'staff',jsonb_path_query_array(staff,'$[*] ? (@.status == "ACTIVE").name')),
    'review_key',md5(jsonb_build_array(profile,locations,services,staff,links,saved.revision)::text));
end $$;

create function reserve_internal.save_business_onboarding(target uuid, expected integer, details jsonb) returns jsonb
language plpgsql volatile security definer set search_path = '' as $$
declare actor uuid := reserve_internal.authenticated_session_user(); written integer; saved jsonb;
begin
  if not reserve_internal.onboarding_owner(target) then return '{"error":"tenant_unavailable"}'; end if;
  if expected is null or expected < 0 or not reserve_internal.valid_onboarding_details(details)
    then return '{"error":"invalid_input"}'; end if;
  if expected = 0 then
    insert into reserve_internal.business_onboarding values(target,details,1,'draft',actor,now())
      on conflict(tenant_id) do nothing returning revision into written;
  else
    update reserve_internal.business_onboarding b set details = save_business_onboarding.details, revision = b.revision+1,
      decision = 'draft', updated_by = actor, updated_at = now()
      where b.tenant_id = target and b.revision = expected returning revision into written;
  end if;
  if written is null then return '{"error":"revision_conflict"}'; end if;
  saved := reserve_internal.read_business_onboarding(target);
  if saved ? 'error' then raise exception 'Cannot verify saved onboarding'; end if;
  return saved;
end $$;
create function reserve_internal.activate_business_onboarding(target uuid, review_key text) returns jsonb
language plpgsql volatile security definer set search_path = '' as $$
declare review jsonb; next_decision text;
begin
  review := reserve_internal.read_business_onboarding(target);
  if review ? 'error' then return review; end if;
  if review->>'review_key' is distinct from review_key then return '{"error":"revision_conflict"}'; end if;
  if exists(select from jsonb_each(review->'checks') where value = 'false') then return '{"error":"incomplete"}'; end if;
  next_decision := case when review->'entitled' = 'true' then 'activated' else 'pending_entitlement' end;
  update reserve_internal.business_onboarding set decision = next_decision, revision = revision+1,
    updated_at = now(), updated_by = reserve_internal.authenticated_session_user()
    where tenant_id = target and decision <> next_decision;
  if next_decision = 'activated' then
    update reserve.tenants set status = 'ACTIVE' where id = target and status = 'SETUP';
    set constraints all immediate;
  end if;
  review := reserve_internal.read_business_onboarding(target);
  if review ? 'error' then raise exception 'Cannot verify activation decision'; end if;
  return review;
end $$;

create function public.reserve_read_business_onboarding(target uuid) returns jsonb
language sql stable security invoker set search_path = '' as $$ select reserve_internal.read_business_onboarding(target) $$;
create function public.reserve_save_business_onboarding(target uuid, expected integer, details jsonb) returns jsonb
language sql volatile security invoker set search_path = '' as $$ select reserve_internal.save_business_onboarding(target,expected,details) $$;
create function public.reserve_activate_business_onboarding(target uuid, review_key text) returns jsonb
language sql volatile security invoker set search_path = '' set default_transaction_isolation = 'serializable'
as $$ select reserve_internal.activate_business_onboarding(target,review_key) $$;

-- Service and practitioner names need not be unique. Bind a logical create to one actor and payload.
create table reserve_internal.catalogue_create_receipts (
  tenant_id uuid not null references reserve.tenants(id), actor uuid not null references reserve.users(id),
  request_key uuid not null, kind text not null check (kind in ('service','staff')),
  attributes jsonb not null, item_id uuid not null, primary key(tenant_id,actor,request_key)
);
alter table reserve_internal.catalogue_create_receipts enable row level security;
revoke all on reserve_internal.catalogue_create_receipts from public, anon, authenticated, service_role;
grant select,insert on reserve_internal.catalogue_create_receipts to reserve_onboarding_executor;
create policy catalogue_own_receipt on reserve_internal.catalogue_create_receipts to reserve_onboarding_executor
  using (actor = reserve_internal.authenticated_session_user() and reserve_internal.tenant_access_enabled(tenant_id))
  with check (actor = reserve_internal.authenticated_session_user() and reserve_internal.tenant_access_enabled(tenant_id));
grant execute on function reserve_internal.save_tenant_staff(uuid,uuid,integer,jsonb),
  reserve_internal.save_tenant_service(uuid,uuid,integer,jsonb) to reserve_onboarding_executor;
create function reserve_internal.create_catalogue_item(target uuid, kind text, request_key uuid, attributes jsonb) returns jsonb
language plpgsql volatile security definer set search_path = '' as $$
declare who uuid := reserve_internal.authenticated_session_user();
  receipt reserve_internal.catalogue_create_receipts; result jsonb; items jsonb; item jsonb; list_key text;
begin
  if kind is null or kind not in ('staff','service') or request_key is null then return '{"error":"invalid_input"}'; end if;
  list_key := case when kind = 'staff' then 'staff' else 'services' end;
  if who is null or not reserve_internal.tenant_access_enabled(target)
    or not reserve_internal.has_capability(target,list_key || '.manage')
    or not reserve_internal.has_capability(target,list_key || '.read') then return '{"error":"tenant_unavailable"}'; end if;
  perform pg_advisory_xact_lock(hashtextextended(target::text || who::text || request_key::text,0));
  select * into receipt from reserve_internal.catalogue_create_receipts r where r.tenant_id = target
    and r.actor = who and r.request_key = create_catalogue_item.request_key;
  if found then
    if receipt.kind <> kind or receipt.attributes is distinct from attributes then return '{"error":"revision_conflict"}'; end if;
    result := case when kind = 'staff' then reserve_internal.list_tenant_staff(target)
      else reserve_internal.list_tenant_services(target) end;
    if result ? 'error' then return result; end if;
    items := result->list_key;
    select value into item from jsonb_array_elements(items) where value->>(kind||'_id') = receipt.item_id::text;
    if item is null then return '{"error":"dependency_unavailable"}'; end if;
    return result || jsonb_build_object(kind||'_id',receipt.item_id,'revision',item->'revision');
  end if;
  result := case when kind = 'staff' then reserve_internal.save_tenant_staff(target,null,0,attributes)
    else reserve_internal.save_tenant_service(target,null,0,attributes) end;
  if not (result ? 'error') then
    insert into reserve_internal.catalogue_create_receipts values(target,who,request_key,kind,attributes,(result->>(kind||'_id'))::uuid);
  end if;
  return result;
end $$;
create function public.reserve_create_catalogue_item(target uuid,kind text,request_key uuid,attributes jsonb) returns jsonb
language sql volatile security invoker set search_path = '' as $$ select reserve_internal.create_catalogue_item(target,kind,request_key,attributes) $$;

grant create on schema reserve_internal to reserve_onboarding_executor;
alter function reserve_internal.read_business_onboarding(uuid) owner to reserve_onboarding_executor;
alter function reserve_internal.save_business_onboarding(uuid,integer,jsonb) owner to reserve_onboarding_executor;
alter function reserve_internal.activate_business_onboarding(uuid,text) owner to reserve_onboarding_executor;
alter function reserve_internal.create_catalogue_item(uuid,text,uuid,jsonb) owner to reserve_onboarding_executor;
revoke create on schema reserve_internal from reserve_onboarding_executor;
revoke all on function reserve_internal.onboarding_owner(uuid), reserve_internal.valid_onboarding_details(jsonb),
  reserve_internal.account_publish_entitlement(uuid) from public,anon,authenticated,service_role;
grant execute on function reserve_internal.onboarding_owner(uuid), reserve_internal.valid_onboarding_details(jsonb),
  reserve_internal.account_publish_entitlement(uuid) to reserve_onboarding_executor;
revoke all on function reserve_internal.read_business_onboarding(uuid), reserve_internal.save_business_onboarding(uuid,integer,jsonb),
  reserve_internal.activate_business_onboarding(uuid,text), reserve_internal.create_catalogue_item(uuid,text,uuid,jsonb),
  public.reserve_read_business_onboarding(uuid), public.reserve_save_business_onboarding(uuid,integer,jsonb),
  public.reserve_activate_business_onboarding(uuid,text), public.reserve_create_catalogue_item(uuid,text,uuid,jsonb)
  from public,anon,authenticated,service_role;
grant execute on function reserve_internal.read_business_onboarding(uuid), reserve_internal.save_business_onboarding(uuid,integer,jsonb),
  reserve_internal.activate_business_onboarding(uuid,text), reserve_internal.create_catalogue_item(uuid,text,uuid,jsonb),
  public.reserve_read_business_onboarding(uuid), public.reserve_save_business_onboarding(uuid,integer,jsonb),
  public.reserve_activate_business_onboarding(uuid,text), public.reserve_create_catalogue_item(uuid,text,uuid,jsonb) to authenticated;
revoke reserve_settings_executor, reserve_service_executor, reserve_location_executor, reserve_staff_executor from postgres;
revoke reserve_onboarding_executor from postgres;
notify pgrst,'reload schema';
commit;
