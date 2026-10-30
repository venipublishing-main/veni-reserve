-- AR-027: persistence/integrity only; no operative authorization or public RPC.
-- Migration runner executes this file transactionally. Existing tenants need an
-- explicit ownership migration, never an inferred/backfilled owner.
do $$ begin
  if exists (select 1 from public.tenants) then
    raise exception 'M1.1B requires explicit ownership reconciliation for existing tenants';
  end if;
end $$;

create schema if not exists private;
revoke all on schema private from public, anon, authenticated;

create table public.permissions (
  code text primary key check (code ~ '^[a-z]+[a-z_.]*$'),
  description text not null
);
create table public.roles (
  id uuid primary key default gen_random_uuid(),
  kind text not null check (kind in ('SYSTEM', 'CUSTOM')),
  tenant_id uuid references public.tenants on update restrict on delete restrict,
  code text not null check (code ~ '^[a-z][a-z0-9_]*$'),
  display_name text not null check (length(btrim(display_name)) > 0),
  created_at timestamptz not null default now(),
  check ((kind = 'SYSTEM' and tenant_id is null) or
    (kind = 'CUSTOM' and tenant_id is not null)),
  check (kind = 'SYSTEM' or code not in ('owner','admin','reception','staff'))
);
create unique index roles_system_code_key on public.roles(code) where kind = 'SYSTEM';
create unique index roles_tenant_code_key on public.roles(tenant_id,code) where kind = 'CUSTOM';
create table public.role_permissions (
  role_id uuid not null references public.roles on update restrict on delete restrict,
  permission_code text not null references public.permissions(code) on update restrict on delete restrict,
  primary key (role_id,permission_code)
);
create index role_permissions_permission_idx on public.role_permissions(permission_code);
create table public.membership_roles (
  membership_id uuid not null references public.memberships on update restrict on delete restrict,
  role_id uuid not null references public.roles on update restrict on delete restrict,
  assigned_at timestamptz not null default now(),
  primary key (membership_id,role_id)
);
create index membership_roles_role_idx on public.membership_roles(role_id);

insert into public.permissions(code,description) values
  ('tenant.read','Tenant identity and safe operational metadata; no secrets.'),
  ('tenant.settings_manage','Business settings; excludes ownership, billing and credential operations.'),
  ('members.read','Tenant membership directory, not provider authentication records.'),
  ('members.invite','Non-owner invitations; delegator restrictions apply.'),
  ('members.manage','Non-owner lifecycle and role changes; no self-escalation.'),
  ('ownership.manage','Explicit ownership operations; active-Owner invariant always applies.'),
  ('calendar.read_all','Tenant-wide operational calendar.'),
  ('calendar.read_own','Explicit Staff linkage and assigned context.'),
  ('appointments.read_all','Tenant-wide bookings.'),
  ('appointments.read_own','Only appointments assigned to linked Staff.'),
  ('appointments.create','Routine bookings; no implicit import authority.'),
  ('appointments.update_all','Tenant bookings, subject to booking lifecycle rules.'),
  ('appointments.update_own','Assigned appointments only; does not permit arbitrary reassignment.'),
  ('appointments.cancel_all','Tenant bookings; cancellation rules still apply.'),
  ('appointments.cancel_own','Assigned appointments only; Appointment lifecycle rules remain authoritative.'),
  ('customers.read_all','Tenant customer records; protected fields remain separately restricted.'),
  ('customers.read_assigned','Minimum service-delivery projection for assigned appointments only.'),
  ('customers.create','Routine customer creation.'),
  ('customers.update','Routine customer editing; no access/security identity changes.'),
  ('customers.export','Customer dataset export; also requires exports.create. Owner-only default.'),
  ('staff.read','Operational roster; excludes HR/private authentication data.'),
  ('staff.manage','Staff domain management, never Membership authority by implication.'),
  ('services.read','Operational service catalogue.'),
  ('services.manage','Service configuration.'),
  ('availability.read_all','Tenant scheduling availability.'),
  ('availability.read_own','Linked Staff availability only.'),
  ('availability.manage_all','Tenant availability configuration.'),
  ('availability.manage_own','Linked Staff availability, subject to scheduling constraints.'),
  ('resources.manage','Operational resource configuration.'),
  ('communications.read','Booking/customer operational communications; no secrets or unrelated private mail.'),
  ('communications.manage','Operational communication configuration.'),
  ('communications.send','Permitted booking/customer sends; not arbitrary bulk marketing authority.'),
  ('templates.manage','Operational templates; permission does not bypass publication rules.'),
  ('themes.read','Tenant theme configuration preview.'),
  ('themes.edit','Theme drafts.'),
  ('themes.publish','Theme publication; no Reception default.'),
  ('brand_assets.manage','Tenant brand assets.'),
  ('integrations.read','Redacted integration metadata/status only.'),
  ('integrations.manage','Approved tenant integrations; write/rotate credentials server-side, never disclose stored secrets.'),
  ('exports.create','Bounded routine export job; requires domain/report export authorization; excludes full-business export.'),
  ('exports.create_full','High-trust full-business portability; explicit future delegation only.'),
  ('imports.view','Migration job status and safe summaries.'),
  ('imports.manage','Prepare/map/validate migration jobs; no execute/reverse authority.'),
  ('imports.execute','Apply imports; also requires domain mutation permissions.'),
  ('imports.reverse','Reverse only supported jobs under domain and history constraints.'),
  ('reports.view','Non-financial operational aggregates; no implicit client drilldown/value access.'),
  ('reports.view_team','Team dimension, combined with reports.view and tenant scope.'),
  ('reports.view_client_detail','Requires reports.view plus underlying customer/booking read scope.'),
  ('reports.view_value','Requires reports.view; booking/service-value analytics, not billing invoices.'),
  ('reports.export','Requires reports.view, relevant report dimensions, exports.create, and relevant domain export gates.'),
  ('audit.read','Tenant-safe audit projection, never raw credentials or platform security telemetry.'),
  ('billing.read','Commercial invoices/subscription data; Owner-only default.'),
  ('billing.manage','Commercial changes; no automatic ownership or billing-provider identity transfer.');
insert into public.roles(id,kind,code,display_name) values
  ('10000000-0000-4000-8000-000000000001','SYSTEM','owner','Owner'),
  ('10000000-0000-4000-8000-000000000002','SYSTEM','admin','Admin'),
  ('10000000-0000-4000-8000-000000000003','SYSTEM','reception','Reception'),
  ('10000000-0000-4000-8000-000000000004','SYSTEM','staff','Staff');
-- Explicit pairs, no inherited/implicit grants.
insert into public.role_permissions(role_id,permission_code) values
  ('10000000-0000-4000-8000-000000000001','tenant.read'),
  ('10000000-0000-4000-8000-000000000002','tenant.read'),
  ('10000000-0000-4000-8000-000000000003','tenant.read'),
  ('10000000-0000-4000-8000-000000000004','tenant.read'),
  ('10000000-0000-4000-8000-000000000001','tenant.settings_manage'),
  ('10000000-0000-4000-8000-000000000002','tenant.settings_manage'),
  ('10000000-0000-4000-8000-000000000001','members.read'),
  ('10000000-0000-4000-8000-000000000002','members.read'),
  ('10000000-0000-4000-8000-000000000001','members.invite'),
  ('10000000-0000-4000-8000-000000000002','members.invite'),
  ('10000000-0000-4000-8000-000000000001','members.manage'),
  ('10000000-0000-4000-8000-000000000002','members.manage'),
  ('10000000-0000-4000-8000-000000000001','ownership.manage'),
  ('10000000-0000-4000-8000-000000000001','calendar.read_all'),
  ('10000000-0000-4000-8000-000000000002','calendar.read_all'),
  ('10000000-0000-4000-8000-000000000003','calendar.read_all'),
  ('10000000-0000-4000-8000-000000000001','calendar.read_own'),
  ('10000000-0000-4000-8000-000000000002','calendar.read_own'),
  ('10000000-0000-4000-8000-000000000003','calendar.read_own'),
  ('10000000-0000-4000-8000-000000000004','calendar.read_own'),
  ('10000000-0000-4000-8000-000000000001','appointments.read_all'),
  ('10000000-0000-4000-8000-000000000002','appointments.read_all'),
  ('10000000-0000-4000-8000-000000000003','appointments.read_all'),
  ('10000000-0000-4000-8000-000000000001','appointments.read_own'),
  ('10000000-0000-4000-8000-000000000002','appointments.read_own'),
  ('10000000-0000-4000-8000-000000000003','appointments.read_own'),
  ('10000000-0000-4000-8000-000000000004','appointments.read_own'),
  ('10000000-0000-4000-8000-000000000001','appointments.create'),
  ('10000000-0000-4000-8000-000000000002','appointments.create'),
  ('10000000-0000-4000-8000-000000000003','appointments.create'),
  ('10000000-0000-4000-8000-000000000001','appointments.update_all'),
  ('10000000-0000-4000-8000-000000000002','appointments.update_all'),
  ('10000000-0000-4000-8000-000000000003','appointments.update_all'),
  ('10000000-0000-4000-8000-000000000001','appointments.update_own'),
  ('10000000-0000-4000-8000-000000000002','appointments.update_own'),
  ('10000000-0000-4000-8000-000000000003','appointments.update_own'),
  ('10000000-0000-4000-8000-000000000004','appointments.update_own'),
  ('10000000-0000-4000-8000-000000000001','appointments.cancel_all'),
  ('10000000-0000-4000-8000-000000000002','appointments.cancel_all'),
  ('10000000-0000-4000-8000-000000000003','appointments.cancel_all'),
  ('10000000-0000-4000-8000-000000000001','appointments.cancel_own'),
  ('10000000-0000-4000-8000-000000000002','appointments.cancel_own'),
  ('10000000-0000-4000-8000-000000000003','appointments.cancel_own'),
  ('10000000-0000-4000-8000-000000000004','appointments.cancel_own'),
  ('10000000-0000-4000-8000-000000000001','customers.read_all'),
  ('10000000-0000-4000-8000-000000000002','customers.read_all'),
  ('10000000-0000-4000-8000-000000000003','customers.read_all'),
  ('10000000-0000-4000-8000-000000000001','customers.read_assigned'),
  ('10000000-0000-4000-8000-000000000002','customers.read_assigned'),
  ('10000000-0000-4000-8000-000000000003','customers.read_assigned'),
  ('10000000-0000-4000-8000-000000000004','customers.read_assigned'),
  ('10000000-0000-4000-8000-000000000001','customers.create'),
  ('10000000-0000-4000-8000-000000000002','customers.create'),
  ('10000000-0000-4000-8000-000000000003','customers.create'),
  ('10000000-0000-4000-8000-000000000001','customers.update'),
  ('10000000-0000-4000-8000-000000000002','customers.update'),
  ('10000000-0000-4000-8000-000000000003','customers.update'),
  ('10000000-0000-4000-8000-000000000001','customers.export'),
  ('10000000-0000-4000-8000-000000000001','staff.read'),
  ('10000000-0000-4000-8000-000000000002','staff.read'),
  ('10000000-0000-4000-8000-000000000003','staff.read'),
  ('10000000-0000-4000-8000-000000000001','staff.manage'),
  ('10000000-0000-4000-8000-000000000002','staff.manage'),
  ('10000000-0000-4000-8000-000000000001','services.read'),
  ('10000000-0000-4000-8000-000000000002','services.read'),
  ('10000000-0000-4000-8000-000000000003','services.read'),
  ('10000000-0000-4000-8000-000000000004','services.read'),
  ('10000000-0000-4000-8000-000000000001','services.manage'),
  ('10000000-0000-4000-8000-000000000002','services.manage'),
  ('10000000-0000-4000-8000-000000000001','availability.read_all'),
  ('10000000-0000-4000-8000-000000000002','availability.read_all'),
  ('10000000-0000-4000-8000-000000000003','availability.read_all'),
  ('10000000-0000-4000-8000-000000000001','availability.read_own'),
  ('10000000-0000-4000-8000-000000000002','availability.read_own'),
  ('10000000-0000-4000-8000-000000000003','availability.read_own'),
  ('10000000-0000-4000-8000-000000000004','availability.read_own'),
  ('10000000-0000-4000-8000-000000000001','availability.manage_all'),
  ('10000000-0000-4000-8000-000000000002','availability.manage_all'),
  ('10000000-0000-4000-8000-000000000001','availability.manage_own'),
  ('10000000-0000-4000-8000-000000000002','availability.manage_own'),
  ('10000000-0000-4000-8000-000000000003','availability.manage_own'),
  ('10000000-0000-4000-8000-000000000004','availability.manage_own'),
  ('10000000-0000-4000-8000-000000000001','resources.manage'),
  ('10000000-0000-4000-8000-000000000002','resources.manage'),
  ('10000000-0000-4000-8000-000000000001','communications.read'),
  ('10000000-0000-4000-8000-000000000002','communications.read'),
  ('10000000-0000-4000-8000-000000000003','communications.read'),
  ('10000000-0000-4000-8000-000000000001','communications.manage'),
  ('10000000-0000-4000-8000-000000000002','communications.manage'),
  ('10000000-0000-4000-8000-000000000001','communications.send'),
  ('10000000-0000-4000-8000-000000000002','communications.send'),
  ('10000000-0000-4000-8000-000000000003','communications.send'),
  ('10000000-0000-4000-8000-000000000001','templates.manage'),
  ('10000000-0000-4000-8000-000000000002','templates.manage'),
  ('10000000-0000-4000-8000-000000000001','themes.read'),
  ('10000000-0000-4000-8000-000000000002','themes.read'),
  ('10000000-0000-4000-8000-000000000003','themes.read'),
  ('10000000-0000-4000-8000-000000000001','themes.edit'),
  ('10000000-0000-4000-8000-000000000002','themes.edit'),
  ('10000000-0000-4000-8000-000000000001','themes.publish'),
  ('10000000-0000-4000-8000-000000000002','themes.publish'),
  ('10000000-0000-4000-8000-000000000001','brand_assets.manage'),
  ('10000000-0000-4000-8000-000000000002','brand_assets.manage'),
  ('10000000-0000-4000-8000-000000000001','integrations.read'),
  ('10000000-0000-4000-8000-000000000002','integrations.read'),
  ('10000000-0000-4000-8000-000000000001','integrations.manage'),
  ('10000000-0000-4000-8000-000000000002','integrations.manage'),
  ('10000000-0000-4000-8000-000000000001','exports.create'),
  ('10000000-0000-4000-8000-000000000002','exports.create'),
  ('10000000-0000-4000-8000-000000000001','exports.create_full'),
  ('10000000-0000-4000-8000-000000000001','imports.view'),
  ('10000000-0000-4000-8000-000000000002','imports.view'),
  ('10000000-0000-4000-8000-000000000001','imports.manage'),
  ('10000000-0000-4000-8000-000000000002','imports.manage'),
  ('10000000-0000-4000-8000-000000000001','imports.execute'),
  ('10000000-0000-4000-8000-000000000001','imports.reverse'),
  ('10000000-0000-4000-8000-000000000001','reports.view'),
  ('10000000-0000-4000-8000-000000000002','reports.view'),
  ('10000000-0000-4000-8000-000000000003','reports.view'),
  ('10000000-0000-4000-8000-000000000001','reports.view_team'),
  ('10000000-0000-4000-8000-000000000002','reports.view_team'),
  ('10000000-0000-4000-8000-000000000003','reports.view_team'),
  ('10000000-0000-4000-8000-000000000001','reports.view_client_detail'),
  ('10000000-0000-4000-8000-000000000002','reports.view_client_detail'),
  ('10000000-0000-4000-8000-000000000001','reports.view_value'),
  ('10000000-0000-4000-8000-000000000002','reports.view_value'),
  ('10000000-0000-4000-8000-000000000001','reports.export'),
  ('10000000-0000-4000-8000-000000000002','reports.export'),
  ('10000000-0000-4000-8000-000000000001','audit.read'),
  ('10000000-0000-4000-8000-000000000002','audit.read'),
  ('10000000-0000-4000-8000-000000000001','billing.read'),
  ('10000000-0000-4000-8000-000000000001','billing.manage');

create function private.reject_mutation() returns trigger
language plpgsql set search_path = '' as $$
begin raise exception using errcode = '23514', message = 'Protected immutable history/catalogue'; end $$;
create trigger permissions_immutable before update or delete or truncate on public.permissions
for each statement execute function private.reject_mutation();

create function private.role_guard() returns trigger
language plpgsql set search_path = '' as $$
begin
  if tg_op = 'INSERT' then
    if new.kind = 'SYSTEM' then
      raise exception using errcode='23514', message='System catalogue changes require migration';
    end if;
  elsif old.kind = 'SYSTEM' then
    raise exception using errcode='23514', message='System role is immutable';
  elsif tg_op = 'UPDATE' and
    (new.id,new.kind,new.tenant_id,new.code) is distinct from
    (old.id,old.kind,old.tenant_id,old.code) then
    raise exception using errcode='23514', message='Role identity and scope are immutable';
  end if;
  if tg_op = 'DELETE' then return old; end if;
  return new;
end $$;
create trigger role_guard before insert or update or delete on public.roles
for each row execute function private.role_guard();
create trigger roles_no_truncate before truncate on public.roles
for each statement execute function private.reject_mutation();

create function private.mapping_guard() returns trigger
language plpgsql set search_path = '' as $$
declare r public.roles;
begin
  if tg_op <> 'INSERT' then
    select * into r from public.roles where id=old.role_id;
    if r.kind='SYSTEM' then
      raise exception using errcode='23514', message='System mappings are immutable';
    end if;
  end if;
  if tg_op <> 'DELETE' then
    select * into r from public.roles where id=new.role_id;
    if r.kind='SYSTEM' or new.permission_code='ownership.manage' then
      raise exception using errcode='23514', message='Protected system/ownership grant';
    end if;
    return new;
  end if;
  return old;
end $$;
create trigger mapping_guard before insert or update or delete on public.role_permissions
for each row execute function private.mapping_guard();
create trigger mappings_no_truncate before truncate on public.role_permissions
for each statement execute function private.reject_mutation();

-- Enforce isolation, rather than trusting callers to opt in. Serializable
-- predicate reads in the deferred check prevent write skew across two owners.
create function private.owner_write_guard() returns trigger
language plpgsql set search_path = '' as $$
begin
  if current_setting('transaction_isolation') <> 'serializable' then
    raise exception using errcode='25001', message='Access integrity writes require SERIALIZABLE transaction';
  end if;
  if tg_op='UPDATE' then
    if tg_table_name='memberships' then
      if (new.id,new.tenant_id,new.user_id) is distinct from (old.id,old.tenant_id,old.user_id) then
        raise exception using errcode='23514', message='Membership identity is immutable';
      end if;
    elsif tg_table_name='tenants' then
      if new.id<>old.id then raise exception using errcode='23514', message='Tenant identity is immutable'; end if;
    else
      if (new.membership_id,new.role_id) is distinct from (old.membership_id,old.role_id) then
        raise exception using errcode='23514', message='Assignment identity is immutable';
      end if;
    end if;
  end if;
  if tg_op='DELETE' then return old; end if;
  return new;
end $$;
create trigger owner_write_guard before insert or update or delete on public.tenants
for each row execute function private.owner_write_guard();
create trigger owner_write_guard before insert or update or delete on public.memberships
for each row execute function private.owner_write_guard();
create trigger owner_write_guard before insert or update or delete on public.membership_roles
for each row execute function private.owner_write_guard();
create trigger tenants_no_truncate before truncate on public.tenants
for each statement execute function private.reject_mutation();
create trigger memberships_no_truncate before truncate on public.memberships
for each statement execute function private.reject_mutation();
create trigger assignments_no_truncate before truncate on public.membership_roles
for each statement execute function private.reject_mutation();

create function private.check_owner() returns trigger
language plpgsql set search_path = '' as $$
declare tid uuid;
begin
  if tg_table_name='tenants' then
    tid := new.id;
  elsif tg_table_name='memberships' then
    if tg_op='DELETE' then tid:=old.tenant_id; else tid:=new.tenant_id; end if;
  else
    if tg_op='DELETE' then
      select tenant_id into tid from public.memberships where id=old.membership_id;
    else
      select tenant_id into tid from public.memberships where id=new.membership_id;
    end if;
  end if;
  if exists(select 1 from public.tenants where id=tid) and not exists (
    select 1 from public.memberships m join public.membership_roles mr on mr.membership_id=m.id
    where m.tenant_id=tid and m.status='ACTIVE'
      and mr.role_id='10000000-0000-4000-8000-000000000001'
  ) then
    raise exception using errcode='23514', message='Tenant requires an ACTIVE system Owner';
  end if;
  return null;
end $$;
create constraint trigger owner_final_state after insert or update on public.tenants
deferrable initially deferred for each row execute function private.check_owner();
create constraint trigger owner_final_state after insert or update or delete on public.memberships
deferrable initially deferred for each row execute function private.check_owner();
create constraint trigger owner_final_state after insert or update or delete on public.membership_roles
deferrable initially deferred for each row execute function private.check_owner();

create function private.assignment_scope() returns trigger
language plpgsql set search_path = '' as $$
declare mt uuid; rt uuid;
begin
  select tenant_id into mt from public.memberships where id=new.membership_id;
  select tenant_id into rt from public.roles where id=new.role_id;
  if rt is not null and rt is distinct from mt then
    raise exception using errcode='23514', message='Custom role belongs to another Tenant';
  end if;
  return new;
end $$;
create trigger assignment_scope before insert or update on public.membership_roles
for each row execute function private.assignment_scope();

create table private.invitations (
  id uuid primary key default gen_random_uuid(),
  tenant_id uuid not null references public.tenants on update restrict on delete restrict,
  target_email text not null check (target_email=lower(btrim(target_email)) and target_email ~ '^[^[:space:]@]+@[^[:space:]@]+$'),
  target_user_id uuid references public.users on update restrict on delete restrict,
  inviter_user_id uuid not null references public.users on update restrict on delete restrict,
  inviter_membership_id uuid not null references public.memberships on update restrict on delete restrict,
  created_at timestamptz not null default now(),
  expires_at timestamptz not null,
  accepted_at timestamptz,
  accepted_user_id uuid references public.users on update restrict on delete restrict,
  accepted_membership_id uuid references public.memberships on update restrict on delete restrict,
  revoked_at timestamptz,
  revoked_by_membership_id uuid references public.memberships on update restrict on delete restrict,
  revocation_reason text check (revocation_reason in ('CANCELLED','SUPERSEDED','ACCESS_REVOKED')),
  supersedes_id uuid references private.invitations on update restrict on delete restrict,
  request_key uuid not null,
  request_fingerprint bytea not null check (octet_length(request_fingerprint)=32),
  token_verifier bytea not null unique check (octet_length(token_verifier)=32),
  -- Internal transaction provenance seals the role set at commit, no writable status.
  issuance_xid xid8 not null default pg_current_xact_id(),
  unique(tenant_id,request_key),
  check (expires_at = created_at + interval '168 hours'),
  check ((accepted_at is null and accepted_user_id is null and accepted_membership_id is null)
    or (accepted_at is not null and accepted_user_id is not null and accepted_membership_id is not null)),
  check ((revoked_at is null and revoked_by_membership_id is null and revocation_reason is null)
    or (revoked_at is not null and revoked_by_membership_id is not null and revocation_reason is not null)),
  check (accepted_at is null or (revoked_at is null and accepted_at>=created_at and accepted_at<expires_at)),
  check (revoked_at is null or revoked_at>=created_at),
  check (supersedes_id is null or supersedes_id<>id)
);
create unique index invitations_outstanding_key on private.invitations(tenant_id,target_email)
where accepted_at is null and revoked_at is null;
create index invitations_tenant_created_idx on private.invitations(tenant_id,created_at);
create index invitations_expiry_idx on private.invitations(expires_at) where accepted_at is null and revoked_at is null;
create index invitations_target_user_idx on private.invitations(target_user_id);
create index invitations_inviter_user_idx on private.invitations(inviter_user_id);
create index invitations_inviter_member_idx on private.invitations(inviter_membership_id);
create index invitations_accepted_user_idx on private.invitations(accepted_user_id);
create index invitations_accepted_member_idx on private.invitations(accepted_membership_id);
create index invitations_revoker_idx on private.invitations(revoked_by_membership_id);
create index invitations_supersedes_idx on private.invitations(supersedes_id);
create table private.invitation_roles (
  invitation_id uuid not null references private.invitations on update restrict on delete restrict,
  role_id uuid not null references public.roles on update restrict on delete restrict,
  primary key(invitation_id,role_id),
  check(role_id<>'10000000-0000-4000-8000-000000000001')
);
create index invitation_roles_role_idx on private.invitation_roles(role_id);

create function private.invitation_guard() returns trigger
language plpgsql set search_path = '' as $$
declare m public.memberships; previous private.invitations;
begin
  if tg_op='DELETE' then raise exception using errcode='23514',message='Invitation history is immutable'; end if;
  if tg_op='INSERT' then
    new.issuance_xid:=pg_current_xact_id();
    if new.accepted_at is not null or new.revoked_at is not null then
      raise exception using errcode='23514',message='New issuance must be non-terminal';
    end if;
  else
    if (to_jsonb(new)-array['accepted_at','accepted_user_id','accepted_membership_id','revoked_at','revoked_by_membership_id','revocation_reason'])
      is distinct from (to_jsonb(old)-array['accepted_at','accepted_user_id','accepted_membership_id','revoked_at','revoked_by_membership_id','revocation_reason'])
      or old.accepted_at is not null or old.revoked_at is not null then
      raise exception using errcode='23514',message='Issuance and terminal receipts are immutable';
    end if;
  end if;
  select * into m from public.memberships where id=new.inviter_membership_id;
  if m.tenant_id is distinct from new.tenant_id or m.user_id is distinct from new.inviter_user_id then
    raise exception using errcode='23514',message='Inviter attribution mismatch';
  end if;
  if new.accepted_at is not null then
    select * into m from public.memberships where id=new.accepted_membership_id;
    if m.tenant_id is distinct from new.tenant_id or m.user_id is distinct from new.accepted_user_id
      or m.status is distinct from 'ACTIVE'
      or (new.target_user_id is not null and new.target_user_id<>new.accepted_user_id)
      or clock_timestamp()>=new.expires_at then
      raise exception using errcode='23514',message='Acceptance receipt mismatch or expired issuance';
    end if;
    if exists(select 1 from private.invitation_roles ir where ir.invitation_id=new.id
      and not exists(select 1 from public.membership_roles mr
        where mr.membership_id=new.accepted_membership_id and mr.role_id=ir.role_id)) then
      raise exception using errcode='23514',message='Receipt requires intended assignments';
    end if;
  end if;
  if new.revoked_at is not null then
    select * into m from public.memberships where id=new.revoked_by_membership_id;
    if m.tenant_id is distinct from new.tenant_id then
      raise exception using errcode='23514',message='Revoker attribution mismatch';
    end if;
  end if;
  if new.supersedes_id is not null then
    select * into previous from private.invitations where id=new.supersedes_id;
    if previous.tenant_id is distinct from new.tenant_id or previous.target_email is distinct from new.target_email
      or previous.revoked_at is null or previous.revocation_reason<>'SUPERSEDED'
      or previous.token_verifier=new.token_verifier then
      raise exception using errcode='23514',message='Invalid replacement issuance';
    end if;
  end if;
  return new;
end $$;
create trigger invitation_guard before insert or update or delete on private.invitations
for each row execute function private.invitation_guard();
create trigger invitations_no_truncate before truncate on private.invitations
for each statement execute function private.reject_mutation();

create function private.invitation_role_guard() returns trigger
language plpgsql set search_path = '' as $$
declare inv private.invitations; rt uuid;
begin
  if tg_op<>'INSERT' then raise exception using errcode='23514',message='Intended roles are immutable'; end if;
  select * into inv from private.invitations where id=new.invitation_id for update;
  if inv.issuance_xid is distinct from pg_current_xact_id()
    or inv.accepted_at is not null or inv.revoked_at is not null then
    raise exception using errcode='23514',message='Issuance role set is sealed';
  end if;
  select tenant_id into rt from public.roles where id=new.role_id;
  if rt is not null and rt is distinct from inv.tenant_id then
    raise exception using errcode='23514',message='Invitation role Tenant mismatch';
  end if;
  return new;
end $$;
create trigger invitation_role_guard before insert or update or delete on private.invitation_roles
for each row execute function private.invitation_role_guard();
create trigger invitation_roles_no_truncate before truncate on private.invitation_roles
for each statement execute function private.reject_mutation();
create function private.invitation_nonempty() returns trigger
language plpgsql set search_path = '' as $$
begin
  if not exists(select 1 from private.invitation_roles where invitation_id=new.id) then
    raise exception using errcode='23514',message='Invitation requires intended roles';
  end if;
  return null;
end $$;
create constraint trigger invitation_nonempty after insert on private.invitations
deferrable initially deferred for each row execute function private.invitation_nonempty();

create table public.audit_events (
  id uuid primary key default gen_random_uuid(),
  tenant_id uuid not null references public.tenants on update restrict on delete restrict,
  occurred_at timestamptz not null default clock_timestamp(),
  action text not null check(action in (
    'invitation.created','invitation.revoked','invitation.accepted',
    'membership.activated','membership.suspended','membership.revoked',
    'role.assigned','role.removed','ownership.granted','ownership.removed','ownership.transferred')),
  category text not null default 'MEMBERSHIP' check(category='MEMBERSHIP'),
  actor_type text not null check(actor_type in ('USER','SERVICE')),
  actor_user_id uuid references public.users on update restrict on delete restrict,
  actor_membership_id uuid references public.memberships on update restrict on delete restrict,
  service_actor text check(service_actor in ('trusted_bootstrap','access_service')),
  reason_code text check(reason_code in ('BOOTSTRAP','INVITATION','ADMIN_CHANGE','TRANSFER','CORRECTION')),
  target_type text not null check(target_type in ('invitation','membership')),
  target_id uuid not null,
  -- Generated FK projections retain one target vocabulary without trusting a
  -- second writable target value; real FKs also serialize concurrent deletion.
  target_membership_id uuid generated always as
    (case when target_type='membership' then target_id end) stored
    references public.memberships on update restrict on delete restrict,
  target_invitation_id uuid generated always as
    (case when target_type='invitation' then target_id end) stored
    references private.invitations on update restrict on delete restrict,
  correlation_id uuid not null,
  metadata jsonb not null default '{}',
  schema_version integer not null default 1 check(schema_version=1),
  check((actor_type='USER' and actor_user_id is not null and service_actor is null)
    or (actor_type='SERVICE' and actor_user_id is null and actor_membership_id is null
      and service_actor is not null and reason_code is not null)),
  check ((action like 'invitation.%' and target_type='invitation')
    or (action not like 'invitation.%' and target_type='membership'))
);
create index audit_events_tenant_time_idx on public.audit_events(tenant_id,occurred_at,id);
create index audit_events_target_idx on public.audit_events(tenant_id,target_type,target_id,occurred_at);
create index audit_events_actor_user_idx on public.audit_events(actor_user_id);
create index audit_events_actor_member_idx on public.audit_events(actor_membership_id);
create index audit_events_target_member_idx on public.audit_events(target_membership_id);
create index audit_events_target_invitation_idx on public.audit_events(target_invitation_id);
create function private.audit_guard() returns trigger
language plpgsql set search_path = '' as $$
declare m public.memberships; tid uuid; k text; v jsonb;
begin
  new.occurred_at:=clock_timestamp();
  if new.actor_membership_id is not null then
    select * into m from public.memberships where id=new.actor_membership_id;
    if m.tenant_id is distinct from new.tenant_id or m.user_id is distinct from new.actor_user_id then
      raise exception using errcode='23514',message='Audit actor attribution mismatch';
    end if;
  end if;
  if new.target_type='invitation' then
    select tenant_id into tid from private.invitations where id=new.target_id for key share;
  else
    select tenant_id into tid from public.memberships where id=new.target_id for key share;
  end if;
  if tid is distinct from new.tenant_id then
    raise exception using errcode='23514',message='Audit target attribution mismatch';
  end if;
  if jsonb_typeof(new.metadata)<>'object' then
    raise exception using errcode='23514',message='Audit metadata must be an allowlisted object';
  end if;
  for k,v in select * from jsonb_each(new.metadata) loop
    if k in ('old_status','new_status') then
      if jsonb_typeof(v)<>'string' or v#>>'{}' not in ('ACTIVE','SUSPENDED','REVOKED') then
        raise exception using errcode='23514',message='Invalid audit lifecycle metadata';
      end if;
    elsif k in ('role_id','previous_owner_membership_id','new_owner_membership_id','corrects_event_id') then
      if jsonb_typeof(v)<>'string' or v#>>'{}' !~ '^[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}$' then
        raise exception using errcode='23514',message='Invalid audit reference metadata';
      end if;
    else
      raise exception using errcode='23514',message='Unapproved audit metadata field';
    end if;
  end loop;
  return new;
end $$;
create trigger audit_guard before insert on public.audit_events
for each row execute function private.audit_guard();
create trigger audit_immutable before update or delete or truncate on public.audit_events
for each statement execute function private.reject_mutation();

alter table public.permissions enable row level security;
alter table public.roles enable row level security;
alter table public.role_permissions enable row level security;
alter table public.membership_roles enable row level security;
alter table private.invitations enable row level security;
alter table private.invitation_roles enable row level security;
alter table public.audit_events enable row level security;
revoke all on public.permissions, public.roles, public.role_permissions,
  public.membership_roles, private.invitations, private.invitation_roles,
  public.audit_events from public, anon, authenticated;
revoke all on all functions in schema private from public, anon, authenticated;
comment on table private.invitations is
  'Private issuance/receipt only. No provider authentication, secret generation or public acceptance endpoint. SHA-256 verifier of purpose-bound high-entropy token; never raw token.';
comment on column private.invitations.expires_at is
  'V1 seven calendar days measured in UTC (168 hours), controlled by trusted issuance.';
comment on table public.audit_events is
  'Trusted append-only success evidence. Future authorized services must atomically write events with state changes; rollback cannot preserve denied-attempt logs.';
