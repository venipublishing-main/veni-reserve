-- M7 foundation, local only: stable Themes and immutable, private draft snapshots.
-- No public assignment or asset upload operation is exposed by this migration.
begin;
create role veni_theme_executor nologin nosuperuser nobypassrls nocreatedb nocreaterole noreplication noinherit;
grant veni_theme_executor to postgres;
grant usage on schema private to veni_theme_executor;
grant execute on function private.authenticated_session_user(),
  private.tenant_access_enabled(uuid), private.has_capability(uuid,text),
  private.current_membership_id(uuid), private.settings_text(text,integer)
  to veni_theme_executor;

-- V1 stores a deliberately small typed token set. Never store tenant CSS,
-- HTML, script, remote font URLs or client-side blob URLs as Theme content.
create function private.normalized_theme_tokens(value jsonb) returns jsonb
language plpgsql immutable security invoker set search_path='' as $$
begin
  if pg_catalog.jsonb_typeof(value) is distinct from 'object' then return null; end if;
  if (select count(*) from pg_catalog.jsonb_object_keys(value))<>3
    or pg_catalog.jsonb_typeof(value->'primary') is distinct from 'string'
    or pg_catalog.jsonb_typeof(value->'accent') is distinct from 'string'
    or pg_catalog.jsonb_typeof(value->'typography') is distinct from 'string'
    or (value->>'primary') collate "C" !~ '^#[0-9a-fA-F]{6}$'
    or (value->>'accent') collate "C" !~ '^#[0-9a-fA-F]{6}$'
    or value->>'typography' not in ('system','serif') then return null; end if;
  return pg_catalog.jsonb_build_object('primary',pg_catalog.lower((value->>'primary') collate "C"),
    'accent',pg_catalog.lower((value->>'accent') collate "C"),'typography',value->>'typography');
end
$$;
revoke all on function private.normalized_theme_tokens(jsonb) from public,anon,authenticated,service_role;
grant execute on function private.normalized_theme_tokens(jsonb) to veni_theme_executor;

create table private.themes (
  id uuid primary key default gen_random_uuid(),
  tenant_id uuid not null references public.tenants on update restrict on delete restrict,
  name text not null check(private.settings_text(name,80) is not distinct from name),
  status text not null default 'ACTIVE' check(status in ('ACTIVE','ARCHIVED')),
  draft_revision integer check(draft_revision between 1 and 2147483647),
  created_by_user_id uuid not null references public.users on update restrict on delete restrict,
  created_by_membership_id uuid not null references public.memberships on update restrict on delete restrict,
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now(),
  unique(tenant_id,id)
);
create unique index themes_active_name_idx on private.themes(tenant_id,pg_catalog.lower(name collate "C")) where status='ACTIVE';

create table private.theme_revisions (
  id uuid not null default gen_random_uuid() unique,
  tenant_id uuid not null,
  theme_id uuid not null,
  revision integer not null check(revision between 1 and 2147483647),
  schema_version integer not null default 1 check(schema_version=1),
  tokens jsonb not null check(private.normalized_theme_tokens(tokens) is not distinct from tokens),
  source_revision integer,
  actor_user_id uuid not null references public.users on update restrict on delete restrict,
  actor_membership_id uuid not null references public.memberships on update restrict on delete restrict,
  created_at timestamptz not null default now(),
  primary key(tenant_id,theme_id,revision),
  foreign key(tenant_id,theme_id) references private.themes(tenant_id,id) on update restrict on delete restrict,
  foreign key(tenant_id,theme_id,source_revision)
    references private.theme_revisions(tenant_id,theme_id,revision) on update restrict on delete restrict,
  check(source_revision is null or source_revision<revision)
);
alter table private.themes add constraint themes_draft_pointer_fk
  foreign key(tenant_id,id,draft_revision)
  references private.theme_revisions(tenant_id,theme_id,revision)
  on update no action on delete no action deferrable initially deferred;

create table private.theme_revision_events (
  id uuid primary key default gen_random_uuid(),
  tenant_id uuid not null,
  theme_id uuid not null,
  revision integer not null,
  action text not null check(action in ('theme.created','theme.revision.saved')),
  actor_user_id uuid not null references public.users on update restrict on delete restrict,
  actor_membership_id uuid not null references public.memberships on update restrict on delete restrict,
  occurred_at timestamptz not null default now(),
  correlation_id uuid not null default gen_random_uuid(),
  unique(tenant_id,theme_id,revision),
  foreign key(tenant_id,theme_id,revision)
    references private.theme_revisions(tenant_id,theme_id,revision) on update restrict on delete restrict,
  check(action=case when revision=1 then 'theme.created' else 'theme.revision.saved' end)
);
create index theme_revisions_actor_idx on private.theme_revisions(actor_user_id);
create index theme_events_tenant_time_idx on private.theme_revision_events(tenant_id,occurred_at,id);
create trigger theme_revisions_immutable before update or delete or truncate on private.theme_revisions
  for each statement execute function private.reject_mutation();
create trigger theme_revision_events_immutable before update or delete or truncate on private.theme_revision_events
  for each statement execute function private.reject_mutation();

-- Reserved, closed publication pointer. No route or database role can set it
-- during the private-draft slice. Later publish must validate atomically.
create table private.published_theme_assignments (
  tenant_id uuid primary key references public.tenants on update restrict on delete restrict,
  theme_id uuid not null,
  revision integer not null,
  generation integer not null check(generation>0),
  assigned_at timestamptz not null,
  actor_user_id uuid not null references public.users on update restrict on delete restrict,
  foreign key(tenant_id,theme_id,revision)
    references private.theme_revisions(tenant_id,theme_id,revision) on update restrict on delete restrict
);
alter table private.themes enable row level security;
alter table private.theme_revisions enable row level security;
alter table private.theme_revision_events enable row level security;
alter table private.published_theme_assignments enable row level security;
revoke all on private.themes,private.theme_revisions,private.theme_revision_events,
  private.published_theme_assignments from public,anon,authenticated,service_role;
grant select,insert on private.themes,private.theme_revisions to veni_theme_executor;
grant update(draft_revision,updated_at) on private.themes to veni_theme_executor;
grant insert on private.theme_revision_events to veni_theme_executor;
create policy theme_read on private.themes for select to veni_theme_executor
  using(private.tenant_access_enabled(tenant_id) and private.has_capability(tenant_id,'themes.read'));
create policy theme_create on private.themes for insert to veni_theme_executor
  with check(private.tenant_access_enabled(tenant_id) and private.has_capability(tenant_id,'themes.edit')
    and private.has_capability(tenant_id,'themes.read')
    and created_by_user_id=private.authenticated_session_user()
    and created_by_membership_id=private.current_membership_id(tenant_id));
create policy theme_update on private.themes for update to veni_theme_executor
  using(private.tenant_access_enabled(tenant_id) and private.has_capability(tenant_id,'themes.edit'))
  with check(private.tenant_access_enabled(tenant_id) and private.has_capability(tenant_id,'themes.edit'));
create policy theme_revision_read on private.theme_revisions for select to veni_theme_executor
  using(private.tenant_access_enabled(tenant_id) and private.has_capability(tenant_id,'themes.read'));
create policy theme_revision_append on private.theme_revisions for insert to veni_theme_executor
  with check(private.tenant_access_enabled(tenant_id) and private.has_capability(tenant_id,'themes.edit')
    and private.has_capability(tenant_id,'themes.read')
    and actor_user_id=private.authenticated_session_user()
    and actor_membership_id=private.current_membership_id(tenant_id));
create policy theme_event_append on private.theme_revision_events for insert to veni_theme_executor
  with check(private.tenant_access_enabled(tenant_id) and private.has_capability(tenant_id,'themes.edit')
    and actor_user_id=private.authenticated_session_user()
    and actor_membership_id=private.current_membership_id(tenant_id));

create function private.list_tenant_themes(target uuid) returns jsonb
language plpgsql stable security definer set search_path='' as $$
begin
 if private.authenticated_session_user() is null then return '{"error":"unauthorized"}'; end if;
 if not(private.tenant_access_enabled(target) and private.has_capability(target,'themes.read'))
   then return '{"error":"tenant_unavailable"}'; end if;
 return pg_catalog.jsonb_build_object('themes',coalesce((select pg_catalog.jsonb_agg(
   pg_catalog.jsonb_build_object('theme_id',t.id,'name',t.name,'status',t.status,
     'current_revision',t.draft_revision) order by t.created_at,t.id)
   from private.themes t where t.tenant_id=target),'[]'::jsonb));
end $$;

create function private.read_tenant_theme(target uuid,theme uuid) returns jsonb
language plpgsql stable security definer set search_path='' as $$
declare t private.themes; r private.theme_revisions;
begin
 if private.authenticated_session_user() is null then return '{"error":"unauthorized"}'; end if;
 if not(private.tenant_access_enabled(target) and private.has_capability(target,'themes.read'))
   then return '{"error":"tenant_unavailable"}'; end if;
 select * into t from private.themes where id=theme and tenant_id=target and status='ACTIVE';
 if not found then return '{"error":"theme_unavailable"}'; end if;
 select * into r from private.theme_revisions where tenant_id=target and theme_id=theme and revision=t.draft_revision;
 if not found then return '{"error":"dependency_unavailable"}'; end if;
 return pg_catalog.jsonb_build_object('theme_id',t.id,'name',t.name,'current_revision',t.draft_revision,
   'tokens',r.tokens,'history',coalesce((select pg_catalog.jsonb_agg(
     pg_catalog.jsonb_build_object('revision',v.revision,'revision_id',v.id,'created_at',v.created_at)
     order by v.revision desc) from (select revision,id,created_at from private.theme_revisions
       where tenant_id=target and theme_id=theme order by revision desc limit 50) v),'[]'::jsonb));
end $$;

create function private.read_tenant_theme_revision(target uuid,theme uuid,requested integer) returns jsonb
language plpgsql stable security definer set search_path='' as $$
declare r private.theme_revisions;
begin
 if private.authenticated_session_user() is null then return '{"error":"unauthorized"}'; end if;
 if not(private.tenant_access_enabled(target) and private.has_capability(target,'themes.read'))
   then return '{"error":"tenant_unavailable"}'; end if;
 if requested is null or requested<1 then return '{"error":"invalid_input"}'; end if;
 select r0.* into r from private.theme_revisions r0 join private.themes t
   on t.id=r0.theme_id and t.tenant_id=r0.tenant_id
   where r0.tenant_id=target and r0.theme_id=theme and r0.revision=requested and t.status='ACTIVE';
 if not found then return '{"error":"theme_unavailable"}'; end if;
 return pg_catalog.jsonb_build_object('theme_id',r.theme_id,'revision',r.revision,
   'revision_id',r.id,'tokens',r.tokens,'created_at',r.created_at);
end $$;

create function private.create_tenant_theme(target uuid,theme_name text,design_tokens jsonb) returns jsonb
language plpgsql volatile security definer set search_path='' as $$
declare actor uuid:=private.authenticated_session_user(); member uuid;
  safe_name text:=private.settings_text(theme_name,80);
  safe_tokens jsonb:=private.normalized_theme_tokens(design_tokens);
  theme uuid:=gen_random_uuid(); stamp timestamptz:=pg_catalog.statement_timestamp();
begin
 if actor is null then return '{"error":"unauthorized"}'; end if;
 if not(private.tenant_access_enabled(target) and private.has_capability(target,'themes.read')
   and private.has_capability(target,'themes.edit')) then return '{"error":"tenant_unavailable"}'; end if;
 if safe_name is null or safe_tokens is null then return '{"error":"invalid_input"}'; end if;
 member:=private.current_membership_id(target);
 insert into private.themes(id,tenant_id,name,created_by_user_id,created_by_membership_id,created_at,updated_at)
   values(theme,target,safe_name,actor,member,stamp,stamp);
 insert into private.theme_revisions(tenant_id,theme_id,revision,tokens,actor_user_id,actor_membership_id,created_at)
   values(target,theme,1,safe_tokens,actor,member,stamp);
 update private.themes set draft_revision=1 where id=theme and tenant_id=target;
 insert into private.theme_revision_events(tenant_id,theme_id,revision,action,actor_user_id,actor_membership_id,occurred_at)
   values(target,theme,1,'theme.created',actor,member,stamp);
 return private.read_tenant_theme(target,theme);
exception when unique_violation then return '{"error":"duplicate_name"}';
  when others then return '{"error":"dependency_unavailable"}';
end $$;

create function private.save_tenant_theme_revision(target uuid,theme uuid,expected integer,design_tokens jsonb) returns jsonb
language plpgsql volatile security definer set search_path='' as $$
declare actor uuid:=private.authenticated_session_user(); member uuid;
  safe_tokens jsonb:=private.normalized_theme_tokens(design_tokens);
  next_revision integer; stamp timestamptz:=pg_catalog.statement_timestamp();
begin
 if actor is null then return '{"error":"unauthorized"}'; end if;
 if not(private.tenant_access_enabled(target) and private.has_capability(target,'themes.read')
   and private.has_capability(target,'themes.edit')) then return '{"error":"tenant_unavailable"}'; end if;
 if expected is null or expected not between 1 and 2147483646 or safe_tokens is null
   then return '{"error":"invalid_input"}'; end if;
 if not exists(select from private.themes where id=theme and tenant_id=target and status='ACTIVE')
   then return '{"error":"theme_unavailable"}'; end if;
 member:=private.current_membership_id(target);
 update private.themes t set draft_revision=t.draft_revision+1,updated_at=stamp
   where t.id=theme and t.tenant_id=target and t.draft_revision=expected
   returning t.draft_revision into next_revision;
 if next_revision is null then return '{"error":"revision_conflict"}'; end if;
 insert into private.theme_revisions(tenant_id,theme_id,revision,tokens,source_revision,actor_user_id,actor_membership_id,created_at)
   values(target,theme,next_revision,safe_tokens,expected,actor,member,stamp);
 insert into private.theme_revision_events(tenant_id,theme_id,revision,action,actor_user_id,actor_membership_id,occurred_at)
   values(target,theme,next_revision,'theme.revision.saved',actor,member,stamp);
 return private.read_tenant_theme(target,theme);
exception when others then return '{"error":"dependency_unavailable"}';
end $$;

-- Publicly discoverable RPC names, but no public data. Every invocation uses
-- genuine live Auth identity and a restricted, RLS-subject executor.
create function public.list_tenant_themes(target uuid) returns jsonb
language sql stable security invoker set search_path='' as $$
 select case when private.authenticated_session_user() is null then '{"error":"unauthorized"}'::jsonb
 else private.list_tenant_themes(target) end
$$;
create function public.read_tenant_theme(target uuid,theme uuid) returns jsonb
language sql stable security invoker set search_path='' as $$
 select case when private.authenticated_session_user() is null then '{"error":"unauthorized"}'::jsonb
 else private.read_tenant_theme(target,theme) end
$$;
create function public.read_tenant_theme_revision(target uuid,theme uuid,requested private.settings_wire_revision) returns jsonb
language sql stable security invoker set search_path='' as $$
 select case when private.authenticated_session_user() is null then '{"error":"unauthorized"}'::jsonb
 else private.read_tenant_theme_revision(target,theme,(requested #>> '{}')::numeric::integer) end
$$;
create function public.create_tenant_theme(target uuid,theme_name private.settings_wire_text,design_tokens jsonb) returns jsonb
language sql volatile security invoker set search_path='' as $$
 select case when private.authenticated_session_user() is null then '{"error":"unauthorized"}'::jsonb
 else private.create_tenant_theme(target,theme_name #>> '{}',design_tokens) end
$$;
create function public.save_tenant_theme_revision(target uuid,theme uuid,expected private.settings_wire_revision,design_tokens jsonb) returns jsonb
language sql volatile security invoker set search_path='' as $$
 select case when private.authenticated_session_user() is null then '{"error":"unauthorized"}'::jsonb
 else private.save_tenant_theme_revision(target,theme,(expected #>> '{}')::numeric::integer,design_tokens) end
$$;

grant create on schema private to veni_theme_executor;
alter function private.list_tenant_themes(uuid) owner to veni_theme_executor;
alter function private.read_tenant_theme(uuid,uuid) owner to veni_theme_executor;
alter function private.read_tenant_theme_revision(uuid,uuid,integer) owner to veni_theme_executor;
alter function private.create_tenant_theme(uuid,text,jsonb) owner to veni_theme_executor;
alter function private.save_tenant_theme_revision(uuid,uuid,integer,jsonb) owner to veni_theme_executor;
revoke create on schema private from veni_theme_executor;
revoke all on function private.list_tenant_themes(uuid),private.read_tenant_theme(uuid,uuid),
  private.read_tenant_theme_revision(uuid,uuid,integer),private.create_tenant_theme(uuid,text,jsonb),
  private.save_tenant_theme_revision(uuid,uuid,integer,jsonb),
  public.list_tenant_themes(uuid),public.read_tenant_theme(uuid,uuid),
  public.read_tenant_theme_revision(uuid,uuid,private.settings_wire_revision),
  public.create_tenant_theme(uuid,private.settings_wire_text,jsonb),
  public.save_tenant_theme_revision(uuid,uuid,private.settings_wire_revision,jsonb)
  from public,anon,authenticated,service_role;
grant execute on function private.list_tenant_themes(uuid),private.read_tenant_theme(uuid,uuid),
  private.read_tenant_theme_revision(uuid,uuid,integer),private.create_tenant_theme(uuid,text,jsonb),
  private.save_tenant_theme_revision(uuid,uuid,integer,jsonb),
  public.list_tenant_themes(uuid),public.read_tenant_theme(uuid,uuid),
  public.read_tenant_theme_revision(uuid,uuid,private.settings_wire_revision),
  public.create_tenant_theme(uuid,private.settings_wire_text,jsonb),
  public.save_tenant_theme_revision(uuid,uuid,private.settings_wire_revision,jsonb) to authenticated;
revoke veni_theme_executor from postgres;
comment on table private.published_theme_assignments is 'Reserved only: closed RLS and no mutation path until separately reviewed publication slice.';
notify pgrst,'reload schema';
commit;
