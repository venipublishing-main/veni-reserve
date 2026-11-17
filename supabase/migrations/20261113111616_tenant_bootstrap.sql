-- Issue 18: source-controlled candidate; disposable local replay only.
begin;
create function private.authenticated_session_user() returns uuid
language sql stable security definer set search_path='' as $$
  select u.id from auth.users u join auth.sessions s on s.user_id=u.id
  where u.id=private.business_user_id() and auth.jwt()->>'role'='authenticated'
    and s.id::text=auth.jwt()->>'session_id'
    and (s.not_after is null or s.not_after>now())
    and (u.banned_until is null or u.banned_until<=now()) and u.deleted_at is null
$$;
revoke all on function private.authenticated_session_user() from public,anon,authenticated,service_role;
grant execute on function private.authenticated_session_user() to authenticated;
create function public.current_reserve_user() returns uuid
language sql stable security invoker set search_path='' as $$select private.authenticated_session_user()$$;
revoke all on function public.current_reserve_user() from public,anon,service_role;
grant execute on function public.current_reserve_user() to authenticated;

create role veni_bootstrap_executor nologin nosuperuser nobypassrls nocreatedb nocreaterole noreplication noinherit;
grant veni_bootstrap_executor to postgres;
grant usage on schema private,public to veni_bootstrap_executor;
grant execute on function private.authenticated_session_user(),private.tenant_access_enabled(uuid) to veni_bootstrap_executor;
create table private.tenant_bootstrap_requests (
  request_key uuid primary key,
  user_id uuid not null references public.users on delete restrict,
  tenant_id uuid not null unique references public.tenants on delete restrict,
  membership_id uuid not null unique references public.memberships on delete restrict,
  operation text not null check(operation='tenant.bootstrap.v1'),
  created_at timestamptz not null default now()
);
create index tenant_bootstrap_requests_user_idx on private.tenant_bootstrap_requests(user_id);
alter table private.tenant_bootstrap_requests enable row level security;
revoke all on private.tenant_bootstrap_requests from public,anon,authenticated,service_role;
grant select,insert on private.tenant_bootstrap_requests,public.users,public.tenants,public.memberships,public.membership_roles to veni_bootstrap_executor;
grant insert on public.audit_events to veni_bootstrap_executor;
grant select on public.roles to veni_bootstrap_executor;
-- Existing audit guard takes FOR KEY SHARE on its Membership target. PostgreSQL
-- requires UPDATE privilege on one column for that lock; M1 forbids changing id.
grant update(id) on public.memberships to veni_bootstrap_executor;
create policy bootstrap_receipts on private.tenant_bootstrap_requests for all to veni_bootstrap_executor using(true) with check(true);
create policy bootstrap_users_read on public.users for select to veni_bootstrap_executor using(true);
create policy bootstrap_users_insert on public.users for insert to veni_bootstrap_executor with check(id=private.authenticated_session_user());
create policy bootstrap_tenants_read on public.tenants for select to veni_bootstrap_executor using(true);
create policy bootstrap_tenants_insert on public.tenants for insert to veni_bootstrap_executor with check(status='SETUP');
create policy bootstrap_memberships_read on public.memberships for select to veni_bootstrap_executor using(true);
create policy bootstrap_memberships_insert on public.memberships for insert to veni_bootstrap_executor with check(user_id=private.authenticated_session_user() and status='ACTIVE');
create policy bootstrap_memberships_lock on public.memberships for update to veni_bootstrap_executor using(user_id=private.authenticated_session_user()) with check(false);
create policy bootstrap_assignments_read on public.membership_roles for select to veni_bootstrap_executor using(true);
create policy bootstrap_assignments_insert on public.membership_roles for insert to veni_bootstrap_executor with check(role_id='10000000-0000-4000-8000-000000000001');
create policy bootstrap_roles_read on public.roles for select to veni_bootstrap_executor using(kind='SYSTEM');
create policy bootstrap_audit_insert on public.audit_events for insert to veni_bootstrap_executor with check(actor_type='USER' and actor_user_id=private.authenticated_session_user() and action in ('membership.activated','ownership.granted') and reason_code='BOOTSTRAP');

create function private.bootstrap_setup_tenant(request_key uuid) returns jsonb
language plpgsql volatile security definer set search_path='' as $$
declare actor uuid:=private.authenticated_session_user(); receipt private.tenant_bootstrap_requests;
 tid uuid:=gen_random_uuid(); mid uuid:=gen_random_uuid();
begin
 if actor is null then return '{"error":"unauthenticated"}'; end if;
 if request_key is null then return '{"error":"invalid_input"}'; end if;
 if current_setting('transaction_isolation')<>'serializable' then
   raise exception using errcode='25001',message='Bootstrap requires SERIALIZABLE';
 end if;
 select * into receipt from private.tenant_bootstrap_requests b where b.request_key=bootstrap_setup_tenant.request_key;
 if found then
   if receipt.user_id<>actor then return '{"error":"idempotency_conflict"}'; end if;
   if not private.tenant_access_enabled(receipt.tenant_id) then return '{"error":"tenant_unavailable"}'; end if;
   return jsonb_build_object('tenant_id',receipt.tenant_id,'membership_id',receipt.membership_id,'replayed',true);
 end if;
 insert into public.users(id) values(actor) on conflict(id) do nothing;
 insert into public.tenants(id,status) values(tid,'SETUP');
 insert into public.memberships(id,tenant_id,user_id,status) values(mid,tid,actor,'ACTIVE');
 insert into public.membership_roles(membership_id,role_id) values(mid,'10000000-0000-4000-8000-000000000001');
 insert into public.audit_events(tenant_id,action,actor_type,actor_user_id,actor_membership_id,reason_code,target_type,target_id,correlation_id,metadata)
 values(tid,'membership.activated','USER',actor,mid,'BOOTSTRAP','membership',mid,request_key,'{"new_status":"ACTIVE"}'),
 (tid,'ownership.granted','USER',actor,mid,'BOOTSTRAP','membership',mid,request_key,'{"role_id":"10000000-0000-4000-8000-000000000001"}');
 insert into private.tenant_bootstrap_requests values(request_key,actor,tid,mid,'tenant.bootstrap.v1',now());
 -- Run the existing invariant as this narrowly privileged executor, never bypass it.
 set constraints all immediate;
 return jsonb_build_object('tenant_id',tid,'membership_id',mid,'replayed',false);
end $$;
grant create on schema private to veni_bootstrap_executor;
alter function private.bootstrap_setup_tenant(uuid) owner to veni_bootstrap_executor;
revoke create on schema private from veni_bootstrap_executor;
revoke all on function private.bootstrap_setup_tenant(uuid) from public,anon,authenticated,service_role;
grant execute on function private.bootstrap_setup_tenant(uuid) to authenticated;
create function public.bootstrap_setup_tenant(request_key uuid) returns jsonb
language sql volatile security invoker set search_path='' set default_transaction_isolation='serializable'
as $$select private.bootstrap_setup_tenant(request_key)$$;
revoke all on function public.bootstrap_setup_tenant(uuid) from public,anon,service_role;
grant execute on function public.bootstrap_setup_tenant(uuid) to authenticated;
revoke veni_bootstrap_executor from postgres;

-- Require a live provider session at the public RPC boundary. Existing M2.1
-- validation/storage/revision/audit implementation is reused without alteration.
create or replace function public.read_tenant_business_settings(target uuid) returns jsonb
language plpgsql stable security invoker set search_path='' as $$
begin
 if private.authenticated_session_user() is null then return '{"error":"unauthorized"}'; end if;
 return private.read_tenant_business_settings(target);
end $$;
create or replace function public.save_tenant_business_settings(target uuid,expected_revision private.settings_wire_revision,
 display_name private.settings_wire_text,timezone private.settings_wire_text,
 default_locale private.settings_wire_text,default_currency private.settings_wire_text,
 staff_member_singular private.settings_wire_text,staff_member_plural private.settings_wire_text)
returns jsonb language plpgsql volatile security invoker set search_path='' as $$
begin
 if private.authenticated_session_user() is null then return '{"error":"unauthorized"}'; end if;
 return private.save_tenant_business_settings($1,($2 #>> '{}')::numeric::integer,
 $3 #>> '{}',$4 #>> '{}',$5 #>> '{}',$6 #>> '{}',$7 #>> '{}',$8 #>> '{}');
end $$;
create function public.list_setup_tenants() returns jsonb
language sql stable security invoker set search_path='' as $$
 select coalesce(jsonb_agg(jsonb_build_object('id',t.id,'status',t.status,'membership_id',m.id,
 'display_name',public.read_tenant_business_settings(t.id)->'settings'->>'display_name') order by t.created_at,t.id),'[]'::jsonb)
 from public.tenants t join public.memberships m on m.tenant_id=t.id
 where m.user_id=private.authenticated_session_user() and m.status='ACTIVE' and t.status in ('SETUP','ACTIVE')
 and private.has_capability(t.id,'tenant.read')
$$;
revoke all on function public.list_setup_tenants() from public,anon,service_role;
grant execute on function public.list_setup_tenants() to authenticated;
comment on table private.tenant_bootstrap_requests is 'Durable operation v1 receipt: one key globally bound to trusted Auth subject. No raw token, email or user-supplied role. No direct API access.';
notify pgrst,'reload schema';
commit;
