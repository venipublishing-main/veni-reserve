-- AR-028: read authorization only. No mutation service or public RPC.
begin;

-- Verified locally before implementation; refuse a different ownership boundary.
do $$
begin
  if current_user <> 'postgres' or exists (
    select 1 from pg_catalog.pg_tables
    where schemaname in ('public', 'private') and tableowner <> 'postgres'
  ) then
    raise exception 'AR-028 requires the reviewed postgres migration/table owner';
  end if;
end;
$$;

-- Require a JSON boolean false, not a missing claim, string, or user metadata.
create function private.business_user_id() returns uuid
language sql stable security invoker set search_path = ''
as $$
  select case when auth.jwt() -> 'is_anonymous' = 'false'::jsonb then auth.uid() end
$$;

create function private.current_membership_id(tenant_uuid uuid) returns uuid
language sql stable security definer set search_path = ''
as $$
  select m.id from public.memberships m
  join public.users u on u.id = m.user_id
  where u.id = private.business_user_id()
    and m.tenant_id = tenant_uuid and m.status = 'ACTIVE'
$$;

create function private.has_active_membership(tenant_uuid uuid) returns boolean
language sql stable security definer set search_path = ''
as $$
  select private.current_membership_id(tenant_uuid) is not null
$$;

-- Mapping possession only: no domain row/Staff linkage and no own -> all upgrade.
create function private.has_capability(tenant_uuid uuid, permission_code text) returns boolean
language sql stable security definer set search_path = ''
as $$
  select exists (
    select 1 from public.membership_roles mr
    join public.roles r on r.id = mr.role_id
    join public.role_permissions rp on rp.role_id = r.id
    where mr.membership_id = private.current_membership_id(tenant_uuid)
      and (r.kind = 'SYSTEM' or (r.kind = 'CUSTOM' and r.tenant_id = tenant_uuid))
      and rp.permission_code = has_capability.permission_code
  )
$$;

-- Scoped even when called directly: foreign lifecycle is not an oracle.
create function private.tenant_access_enabled(tenant_uuid uuid) returns boolean
language sql stable security definer set search_path = ''
as $$
  select private.has_active_membership(tenant_uuid) and exists (
    select 1 from public.tenants t where t.id = tenant_uuid and t.status in ('SETUP', 'ACTIVE')
  )
$$;

create function private.can_read_membership(membership_uuid uuid) returns boolean
language sql stable security definer set search_path = ''
as $$
  select exists (
    select 1 from public.memberships m where m.id = membership_uuid
      and private.business_user_id() is not null
      and (m.user_id = private.business_user_id()
        or (private.tenant_access_enabled(m.tenant_id) and private.has_capability(m.tenant_id, 'members.read')))
  )
$$;

create function private.can_read_membership_roles(membership_uuid uuid) returns boolean
language sql stable security definer set search_path = ''
as $$
  select exists (
    select 1 from public.memberships m where m.id = membership_uuid
      and private.tenant_access_enabled(m.tenant_id)
      and (m.id = private.current_membership_id(m.tenant_id) or private.has_capability(m.tenant_id, 'members.read'))
  )
$$;

create function private.can_read_role(role_uuid uuid) returns boolean
language sql stable security definer set search_path = ''
as $$
  select exists (
    select 1 from public.roles r
    join public.memberships m on (r.kind = 'SYSTEM' or (r.kind = 'CUSTOM' and r.tenant_id = m.tenant_id))
    join public.users u on u.id = m.user_id
    where r.id = role_uuid and u.id = private.business_user_id() and m.status = 'ACTIVE'
      and private.tenant_access_enabled(m.tenant_id)
      and (exists (select 1 from public.membership_roles mr where mr.membership_id = m.id and mr.role_id = r.id)
        or private.has_capability(m.tenant_id, 'members.read'))
  )
$$;

revoke all on function private.business_user_id(), private.current_membership_id(uuid),
  private.has_active_membership(uuid), private.has_capability(uuid,text),
  private.tenant_access_enabled(uuid), private.can_read_membership(uuid),
  private.can_read_membership_roles(uuid), private.can_read_role(uuid)
  from public, anon, authenticated, service_role;
grant execute on function private.business_user_id(), private.current_membership_id(uuid),
  private.has_active_membership(uuid), private.has_capability(uuid,text),
  private.tenant_access_enabled(uuid), private.can_read_membership(uuid),
  private.can_read_membership_roles(uuid), private.can_read_role(uuid) to authenticated;

-- Triggers do not require callers to have ordinary EXECUTE privileges.
revoke all on function private.reject_mutation(), private.role_guard(), private.mapping_guard(),
  private.owner_write_guard(), private.check_owner(), private.assignment_scope(),
  private.invitation_guard(), private.invitation_role_guard(), private.invitation_nonempty(),
  private.audit_guard() from public, anon, authenticated, service_role;

revoke create on schema public from public, anon, authenticated, service_role;
revoke all on schema private from public, anon, authenticated, service_role;
grant usage on schema private to authenticated;

revoke all on table public.tenants, public.users, public.memberships, public.permissions,
  public.roles, public.role_permissions, public.membership_roles, public.audit_events,
  private.invitations, private.invitation_roles from public, anon, authenticated, service_role;

-- Table REVOKE does not remove column grants. Normalize only application columns.
do $$
declare col record;
begin
  for col in select n.nspname, c.relname, a.attname
    from pg_catalog.pg_attribute a join pg_catalog.pg_class c on c.oid = a.attrelid
    join pg_catalog.pg_namespace n on n.oid = c.relnamespace
    where a.attnum > 0 and not a.attisdropped and c.relkind = 'r'
      and ((n.nspname = 'public' and c.relname in
        ('tenants','users','memberships','permissions','roles','role_permissions','membership_roles','audit_events'))
        or (n.nspname = 'private' and c.relname in ('invitations','invitation_roles')))
  loop
    execute pg_catalog.format('revoke select (%I), insert (%I), update (%I), references (%I) on table %I.%I from public, anon, authenticated, service_role',
      col.attname, col.attname, col.attname, col.attname, col.nspname, col.relname);
  end loop;
end;
$$;
grant select on table public.tenants, public.users, public.memberships, public.roles,
  public.role_permissions, public.membership_roles, public.audit_events to authenticated;

create policy tenants_select_authenticated on public.tenants for select to authenticated
using ((select private.business_user_id()) is not null
  and private.has_active_membership(id) and private.has_capability(id, 'tenant.read'));
create policy users_select_authenticated on public.users for select to authenticated
using (id = (select private.business_user_id()));
create policy memberships_select_authenticated on public.memberships for select to authenticated
using ((select private.business_user_id()) is not null and private.can_read_membership(id));
create policy roles_select_authenticated on public.roles for select to authenticated
using ((select private.business_user_id()) is not null and private.can_read_role(id));
create policy role_permissions_select_authenticated on public.role_permissions for select to authenticated
using ((select private.business_user_id()) is not null and private.can_read_role(role_id));
create policy membership_roles_select_authenticated on public.membership_roles for select to authenticated
using ((select private.business_user_id()) is not null and private.can_read_membership_roles(membership_id));
create policy audit_events_select_authenticated on public.audit_events for select to authenticated
using ((select private.business_user_id()) is not null and private.tenant_access_enabled(tenant_id)
  and private.has_capability(tenant_id, 'audit.read'));

commit;
