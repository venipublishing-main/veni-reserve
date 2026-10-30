-- M1.1A / AR-026: persistence only. Roles, ownership and access workflows follow later.
-- Text CHECKs keep the small, table-specific vocabularies explicit and easy to migrate.
-- Lifecycle states deliberately have no defaults: callers must choose explicitly.
create table public.tenants (
  id uuid primary key default gen_random_uuid(),
  status text not null constraint tenants_status_check
    check (status in ('SETUP', 'ACTIVE', 'SUSPENDED', 'ARCHIVED')),
  created_at timestamptz not null default now()
);

create table public.users (
  id uuid primary key constraint users_auth_user_fkey
    references auth.users (id) on update restrict on delete restrict,
  created_at timestamptz not null default now()
);

create table public.memberships (
  id uuid primary key default gen_random_uuid(),
  tenant_id uuid not null constraint memberships_tenant_fkey
    references public.tenants (id) on update restrict on delete restrict,
  user_id uuid not null constraint memberships_user_fkey
    references public.users (id) on update restrict on delete restrict,
  status text not null constraint memberships_status_check
    check (status in ('ACTIVE', 'SUSPENDED', 'REVOKED')),
  created_at timestamptz not null default now(),
  constraint memberships_tenant_user_key unique (tenant_id, user_id)
);

-- The unique index covers tenant-first lookups; this covers a User's memberships
-- and the referencing side of users -> memberships deletion checks.
create index memberships_user_id_idx on public.memberships (user_id);

-- Retain history by changing lifecycle state, not cascading identity deletion.
-- No updated_at or transition audit is introduced in this persistence slice.
comment on table public.users is
  'Global application identity projection; auth.users owns authentication. No tenant authority.';
comment on table public.memberships is
  'One durable User/Tenant relationship. Lifecycle persistence alone does not grant authority.';

alter table public.tenants enable row level security;
alter table public.users enable row level security;
alter table public.memberships enable row level security;

-- Supabase may grant table privileges by default. Remove ordinary API access
-- explicitly; M1.2 will add the least privileges and policies its model requires.
revoke all on table public.tenants, public.users, public.memberships
  from public, anon, authenticated;
-- No policies: default-deny for RLS-subject roles. Owners/superusers/BYPASSRLS
-- roles are not blocked by this structural posture.
