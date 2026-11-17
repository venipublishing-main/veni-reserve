-- M2.5: Staff profiles and explicit Staff/Service/Location eligibility.
-- Disposable local Supabase only; no hosted rollout, Auth linking or booking.
begin;

create role veni_staff_executor nologin nosuperuser nobypassrls nocreatedb nocreaterole noreplication noinherit;
grant veni_staff_executor to postgres;
grant usage on schema private to veni_staff_executor;
grant execute on function private.authenticated_session_user(),
  private.tenant_access_enabled(uuid),private.has_capability(uuid,text),
  private.current_membership_id(uuid),private.settings_text(text,integer),
  private.service_integer(jsonb,integer,integer) to veni_staff_executor;

-- A tenant's schedulable person, deliberately not an Auth User or Membership.
create table private.staff_members (
  id uuid primary key default gen_random_uuid(),
  tenant_id uuid not null references public.tenants on update restrict on delete restrict,
  name text not null check(private.settings_text(name,120) is not distinct from name),
  public_display_name text check(public_display_name is null or
    private.settings_text(public_display_name,120) is not distinct from public_display_name),
  biography text check(biography is null or
    private.settings_text(biography,1000) is not distinct from biography),
  status text not null check(status in ('ACTIVE','INACTIVE','ARCHIVED')),
  public_visible boolean not null default false,
  online_bookable boolean not null default false,
  no_preference_eligible boolean not null default false,
  sort_order integer not null default 0 check(sort_order between 0 and 9999),
  revision integer not null check(revision between 1 and 2147483647),
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now(),
  unique(tenant_id,id)
);
create index staff_members_tenant_sort_idx on private.staff_members(tenant_id,sort_order,id);
create table private.staff_events (
  id uuid primary key default gen_random_uuid(),
  tenant_id uuid not null,
  staff_id uuid not null,
  revision integer not null check(revision between 1 and 2147483647),
  action text not null check(action in ('staff.created','staff.updated','staff.archived')),
  actor_user_id uuid not null references public.users on update restrict on delete restrict,
  actor_membership_id uuid not null references public.memberships on update restrict on delete restrict,
  occurred_at timestamptz not null default now(),
  unique(tenant_id,staff_id,revision),
  foreign key(tenant_id,staff_id) references private.staff_members(tenant_id,id)
    on update restrict on delete restrict,
  check((revision=1 and action='staff.created') or
    (revision>1 and action in ('staff.updated','staff.archived')))
);
create index staff_events_tenant_time_idx on private.staff_events(tenant_id,occurred_at,id);
create trigger staff_events_immutable before update or delete or truncate on private.staff_events
  for each statement execute function private.reject_mutation();

-- One relation table for three explicit M:N relationships. Every endpoint
-- has a tenant-scoped real FK and the kind CHECK fixes its exact shape.
-- NULLS NOT DISTINCT makes disabled links reusable instead of duplicated.
create table private.eligibility_links (
  id uuid primary key default gen_random_uuid(),
  tenant_id uuid not null references public.tenants on update restrict on delete restrict,
  kind text not null check(kind in ('STAFF_SERVICE','STAFF_LOCATION','SERVICE_LOCATION')),
  staff_id uuid,
  service_id uuid,
  location_id uuid,
  enabled boolean not null default true,
  duration_override_minutes integer check(duration_override_minutes between 1 and 10080),
  price_override_minor_units integer check(price_override_minor_units between 0 and 2147483647),
  buffer_before_override_minutes integer check(buffer_before_override_minutes between 0 and 1440),
  buffer_after_override_minutes integer check(buffer_after_override_minutes between 0 and 1440),
  online_bookable_override boolean,
  revision integer not null check(revision between 1 and 2147483647),
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now(),
  unique(tenant_id,id),
  unique nulls not distinct(tenant_id,kind,staff_id,service_id,location_id),
  foreign key(tenant_id,staff_id) references private.staff_members(tenant_id,id)
    on update restrict on delete restrict,
  foreign key(tenant_id,service_id) references private.services(tenant_id,id)
    on update restrict on delete restrict,
  foreign key(tenant_id,location_id) references private.locations(tenant_id,id)
    on update restrict on delete restrict,
  check(
    (kind='STAFF_SERVICE' and staff_id is not null and service_id is not null and location_id is null)
    or (kind='STAFF_LOCATION' and staff_id is not null and service_id is null and location_id is not null)
    or (kind='SERVICE_LOCATION' and staff_id is null and service_id is not null and location_id is not null)
  ),
  check(kind='STAFF_SERVICE' or
    (duration_override_minutes is null and price_override_minor_units is null and
     buffer_before_override_minutes is null and buffer_after_override_minutes is null and
     online_bookable_override is null))
);
create index eligibility_staff_service_idx on private.eligibility_links(tenant_id,staff_id,service_id)
  where kind='STAFF_SERVICE' and enabled;
create index eligibility_staff_location_idx on private.eligibility_links(tenant_id,staff_id,location_id)
  where kind='STAFF_LOCATION' and enabled;
create index eligibility_service_location_idx on private.eligibility_links(tenant_id,service_id,location_id)
  where kind='SERVICE_LOCATION' and enabled;
create table private.eligibility_events (
  id uuid primary key default gen_random_uuid(),
  tenant_id uuid not null,
  eligibility_id uuid not null,
  revision integer not null check(revision between 1 and 2147483647),
  action text not null check(action in ('eligibility.created','eligibility.updated','eligibility.disabled')),
  actor_user_id uuid not null references public.users on update restrict on delete restrict,
  actor_membership_id uuid not null references public.memberships on update restrict on delete restrict,
  occurred_at timestamptz not null default now(),
  unique(tenant_id,eligibility_id,revision),
  foreign key(tenant_id,eligibility_id) references private.eligibility_links(tenant_id,id)
    on update restrict on delete restrict,
  check((revision=1 and action='eligibility.created') or
    (revision>1 and action in ('eligibility.updated','eligibility.disabled')))
);
create index eligibility_events_tenant_time_idx on private.eligibility_events(tenant_id,occurred_at,id);
create trigger eligibility_events_immutable before update or delete or truncate on private.eligibility_events
  for each statement execute function private.reject_mutation();

alter table private.staff_members enable row level security;
alter table private.staff_events enable row level security;
alter table private.eligibility_links enable row level security;
alter table private.eligibility_events enable row level security;
revoke all on private.staff_members,private.staff_events,private.eligibility_links,
  private.eligibility_events from public,anon,authenticated,service_role;
grant select,insert on private.staff_members,private.eligibility_links to veni_staff_executor;
grant update(name,public_display_name,biography,status,public_visible,online_bookable,
  no_preference_eligible,sort_order,revision,updated_at) on private.staff_members to veni_staff_executor;
grant update(enabled,duration_override_minutes,price_override_minor_units,
  buffer_before_override_minutes,buffer_after_override_minutes,online_bookable_override,
  revision,updated_at) on private.eligibility_links to veni_staff_executor;
grant insert on private.staff_events,private.eligibility_events to veni_staff_executor;

create policy staff_read on private.staff_members for select to veni_staff_executor
  using(private.tenant_access_enabled(tenant_id) and private.has_capability(tenant_id,'staff.read'));
create policy staff_insert on private.staff_members for insert to veni_staff_executor
  with check(private.tenant_access_enabled(tenant_id) and private.has_capability(tenant_id,'staff.manage'));
create policy staff_update on private.staff_members for update to veni_staff_executor
  using(private.tenant_access_enabled(tenant_id) and private.has_capability(tenant_id,'staff.manage'))
  with check(private.tenant_access_enabled(tenant_id) and private.has_capability(tenant_id,'staff.manage'));
create policy staff_event_insert on private.staff_events for insert to veni_staff_executor
  with check(private.tenant_access_enabled(tenant_id) and private.has_capability(tenant_id,'staff.manage')
    and actor_user_id=private.authenticated_session_user()
    and actor_membership_id=private.current_membership_id(tenant_id));
-- Cross-domain scheduling configuration requires both domains' authority.
create policy eligibility_read on private.eligibility_links for select to veni_staff_executor
  using(private.tenant_access_enabled(tenant_id) and
    private.has_capability(tenant_id,'staff.read') and private.has_capability(tenant_id,'services.read'));
create policy eligibility_insert on private.eligibility_links for insert to veni_staff_executor
  with check(private.tenant_access_enabled(tenant_id) and
    private.has_capability(tenant_id,'staff.manage') and private.has_capability(tenant_id,'services.manage'));
create policy eligibility_update on private.eligibility_links for update to veni_staff_executor
  using(private.tenant_access_enabled(tenant_id) and
    private.has_capability(tenant_id,'staff.manage') and private.has_capability(tenant_id,'services.manage'))
  with check(private.tenant_access_enabled(tenant_id) and
    private.has_capability(tenant_id,'staff.manage') and private.has_capability(tenant_id,'services.manage'));
create policy eligibility_event_insert on private.eligibility_events for insert to veni_staff_executor
  with check(private.tenant_access_enabled(tenant_id) and
    private.has_capability(tenant_id,'staff.manage') and private.has_capability(tenant_id,'services.manage')
    and actor_user_id=private.authenticated_session_user()
    and actor_membership_id=private.current_membership_id(tenant_id));

create function private.list_tenant_staff(target uuid) returns jsonb
language plpgsql stable security definer set search_path='' as $$
begin
 if private.authenticated_session_user() is null then return '{"error":"unauthorized"}'; end if;
 if not(private.tenant_access_enabled(target) and private.has_capability(target,'staff.read'))
   then return '{"error":"tenant_unavailable"}'; end if;
 return pg_catalog.jsonb_build_object('staff',coalesce(
   (select pg_catalog.jsonb_agg(pg_catalog.jsonb_build_object(
     'staff_id',s.id,'name',s.name,'public_display_name',s.public_display_name,
     'biography',s.biography,'status',s.status,'public_visible',s.public_visible,
     'online_bookable',s.online_bookable,'no_preference_eligible',s.no_preference_eligible,
     'sort_order',s.sort_order,'revision',s.revision)
     order by s.sort_order,s.created_at,s.id)
    from private.staff_members s where s.tenant_id=target),'[]'::jsonb));
end $$;

create function private.save_tenant_staff(target uuid,staff uuid,expected integer,attributes jsonb)
returns jsonb language plpgsql volatile security definer set search_path='' as $$
declare actor uuid:=private.authenticated_session_user();member uuid;
  name_value text;display_value text;bio_value text;state_value text;
  visible_value boolean;online_value boolean;auto_value boolean;order_value integer;
  next_revision integer;new_id uuid;stamp timestamptz:=pg_catalog.statement_timestamp();
begin
 if actor is null then return '{"error":"unauthorized"}'; end if;
 if not(private.tenant_access_enabled(target) and private.has_capability(target,'staff.manage')
   and private.has_capability(target,'staff.read')) then return '{"error":"tenant_unavailable"}'; end if;
 if expected is null or expected not between 0 and 2147483646 or
   (expected=0 and staff is not null) or (expected>0 and staff is null) or
   pg_catalog.jsonb_typeof(attributes) is distinct from 'object'
 then return '{"error":"invalid_input"}'; end if;
 if (select count(*) from pg_catalog.jsonb_object_keys(attributes))<>8 or
   not(attributes ?& array['name','public_display_name','biography','status','public_visible',
     'online_bookable','no_preference_eligible','sort_order'])
 then return '{"error":"invalid_input"}'; end if;
 if pg_catalog.jsonb_typeof(attributes->'name') is distinct from 'string' or
   pg_catalog.jsonb_typeof(attributes->'status') is distinct from 'string' or
   pg_catalog.jsonb_typeof(attributes->'public_visible') is distinct from 'boolean' or
   pg_catalog.jsonb_typeof(attributes->'online_bookable') is distinct from 'boolean' or
   pg_catalog.jsonb_typeof(attributes->'no_preference_eligible') is distinct from 'boolean' or
   (attributes->'public_display_name'<>'null'::jsonb and
     pg_catalog.jsonb_typeof(attributes->'public_display_name') is distinct from 'string') or
   (attributes->'biography'<>'null'::jsonb and
     pg_catalog.jsonb_typeof(attributes->'biography') is distinct from 'string')
 then return '{"error":"invalid_input"}'; end if;
 name_value:=private.settings_text(attributes->>'name',120);
 display_value:=case when attributes->'public_display_name'='null'::jsonb then null
   else private.settings_text(attributes->>'public_display_name',120) end;
 bio_value:=case when attributes->'biography'='null'::jsonb then null
   else private.settings_text(attributes->>'biography',1000) end;
 state_value:=attributes->>'status';
 visible_value:=(attributes->>'public_visible')::boolean;
 online_value:=(attributes->>'online_bookable')::boolean;
 auto_value:=(attributes->>'no_preference_eligible')::boolean;
 order_value:=private.service_integer(attributes->'sort_order',0,9999);
 if name_value is null or
   (attributes->'public_display_name'<>'null'::jsonb and display_value is null) or
   (attributes->'biography'<>'null'::jsonb and bio_value is null) or
   state_value not in ('ACTIVE','INACTIVE','ARCHIVED') or order_value is null or
   (expected=0 and state_value='ARCHIVED')
 then return '{"error":"invalid_input"}'; end if;
 member:=private.current_membership_id(target);
 if expected=0 then
   new_id:=gen_random_uuid();
   insert into private.staff_members(id,tenant_id,name,public_display_name,biography,status,
     public_visible,online_bookable,no_preference_eligible,sort_order,revision,created_at,updated_at)
   values(new_id,target,name_value,display_value,bio_value,state_value,visible_value,
     online_value,auto_value,order_value,1,stamp,stamp);
   next_revision:=1;
 else
   if not exists(select from private.staff_members s where s.id=staff and
     s.tenant_id=target and s.status<>'ARCHIVED')
   then return '{"error":"staff_unavailable"}'; end if;
   update private.staff_members s set name=name_value,public_display_name=display_value,
     biography=bio_value,status=state_value,public_visible=visible_value,
     online_bookable=online_value,no_preference_eligible=auto_value,sort_order=order_value,
     revision=s.revision+1,updated_at=stamp
   where s.id=staff and s.tenant_id=target and s.revision=expected and s.status<>'ARCHIVED'
   returning s.revision into next_revision;
   if next_revision is null then return '{"error":"revision_conflict"}'; end if;
   new_id:=staff;
 end if;
 insert into private.staff_events(tenant_id,staff_id,revision,action,actor_user_id,
   actor_membership_id,occurred_at)
 values(target,new_id,next_revision,case when next_revision=1 then 'staff.created'
   when state_value='ARCHIVED' then 'staff.archived' else 'staff.updated' end,
   actor,member,stamp);
 return pg_catalog.jsonb_build_object('staff_id',new_id,'revision',next_revision,
   'staff',(private.list_tenant_staff(target)->'staff'));
exception when others then return '{"error":"dependency_unavailable"}';
end $$;

create function private.list_tenant_eligibility(target uuid) returns jsonb
language plpgsql stable security definer set search_path='' as $$
begin
 if private.authenticated_session_user() is null then return '{"error":"unauthorized"}'; end if;
 if not(private.tenant_access_enabled(target) and
   private.has_capability(target,'staff.read') and private.has_capability(target,'services.read'))
 then return '{"error":"tenant_unavailable"}'; end if;
 return pg_catalog.jsonb_build_object('eligibility',coalesce(
   (select pg_catalog.jsonb_agg(pg_catalog.jsonb_build_object(
     'eligibility_id',e.id,'kind',e.kind,'staff_id',e.staff_id,
     'service_id',e.service_id,'location_id',e.location_id,'enabled',e.enabled,
     'duration_override_minutes',e.duration_override_minutes,
     'price_override_minor_units',e.price_override_minor_units,
     'buffer_before_override_minutes',e.buffer_before_override_minutes,
     'buffer_after_override_minutes',e.buffer_after_override_minutes,
     'online_bookable_override',e.online_bookable_override,'revision',e.revision)
     order by e.kind,e.created_at,e.id)
    from private.eligibility_links e where e.tenant_id=target),'[]'::jsonb));
end $$;

create function private.save_tenant_eligibility(target uuid,link uuid,expected integer,attributes jsonb)
returns jsonb language plpgsql volatile security definer set search_path='' as $$
declare actor uuid:=private.authenticated_session_user();member uuid;
  kind_value text;staff_value uuid;service_value uuid;location_value uuid;
  enabled_value boolean;online_value boolean;
  duration_value integer;price_value integer;before_value integer;after_value integer;
  next_revision integer;new_id uuid;stamp timestamptz:=pg_catalog.statement_timestamp();
begin
 if actor is null then return '{"error":"unauthorized"}'; end if;
 if not(private.tenant_access_enabled(target) and
   private.has_capability(target,'staff.manage') and private.has_capability(target,'staff.read') and
   private.has_capability(target,'services.manage') and private.has_capability(target,'services.read'))
 then return '{"error":"tenant_unavailable"}'; end if;
 if expected is null or expected not between 0 and 2147483646 or
   (expected=0 and link is not null) or (expected>0 and link is null) or
   pg_catalog.jsonb_typeof(attributes) is distinct from 'object'
 then return '{"error":"invalid_input"}'; end if;
 if (select count(*) from pg_catalog.jsonb_object_keys(attributes))<>10 or
   not(attributes ?& array['kind','staff_id','service_id','location_id','enabled',
     'duration_override_minutes','price_override_minor_units','buffer_before_override_minutes',
     'buffer_after_override_minutes','online_bookable_override'])
 then return '{"error":"invalid_input"}'; end if;
 if pg_catalog.jsonb_typeof(attributes->'kind') is distinct from 'string' or
   pg_catalog.jsonb_typeof(attributes->'enabled') is distinct from 'boolean' or
   (attributes->'online_bookable_override'<>'null'::jsonb and
     pg_catalog.jsonb_typeof(attributes->'online_bookable_override') is distinct from 'boolean')
 then return '{"error":"invalid_input"}'; end if;
 kind_value:=attributes->>'kind';
 if kind_value not in ('STAFF_SERVICE','STAFF_LOCATION','SERVICE_LOCATION')
 then return '{"error":"invalid_input"}'; end if;
 -- Validate optional UUIDs before casting to prevent opaque runtime errors.
 if not ((attributes->'staff_id'='null'::jsonb or
    (pg_catalog.jsonb_typeof(attributes->'staff_id')='string' and
     attributes->>'staff_id' ~* '^[0-9a-f]{8}(-[0-9a-f]{4}){3}-[0-9a-f]{12}$')) and
   (attributes->'service_id'='null'::jsonb or
    (pg_catalog.jsonb_typeof(attributes->'service_id')='string' and
     attributes->>'service_id' ~* '^[0-9a-f]{8}(-[0-9a-f]{4}){3}-[0-9a-f]{12}$')) and
   (attributes->'location_id'='null'::jsonb or
    (pg_catalog.jsonb_typeof(attributes->'location_id')='string' and
     attributes->>'location_id' ~* '^[0-9a-f]{8}(-[0-9a-f]{4}){3}-[0-9a-f]{12}$')))
 then return '{"error":"invalid_input"}'; end if;
 staff_value:=(attributes->>'staff_id')::uuid;
 service_value:=(attributes->>'service_id')::uuid;
 location_value:=(attributes->>'location_id')::uuid;
 if not ((kind_value='STAFF_SERVICE' and staff_value is not null and
       service_value is not null and location_value is null) or
   (kind_value='STAFF_LOCATION' and staff_value is not null and
       service_value is null and location_value is not null) or
   (kind_value='SERVICE_LOCATION' and staff_value is null and
       service_value is not null and location_value is not null))
 then return '{"error":"invalid_input"}'; end if;
 enabled_value:=(attributes->>'enabled')::boolean;
 online_value:=case when attributes->'online_bookable_override'='null'::jsonb then null
   else (attributes->>'online_bookable_override')::boolean end;
 duration_value:=private.service_integer(attributes->'duration_override_minutes',1,10080);
 price_value:=private.service_integer(attributes->'price_override_minor_units',0,2147483647);
 before_value:=private.service_integer(attributes->'buffer_before_override_minutes',0,1440);
 after_value:=private.service_integer(attributes->'buffer_after_override_minutes',0,1440);
 if (attributes->'duration_override_minutes'<>'null'::jsonb and duration_value is null) or
   (attributes->'price_override_minor_units'<>'null'::jsonb and price_value is null) or
   (attributes->'buffer_before_override_minutes'<>'null'::jsonb and before_value is null) or
   (attributes->'buffer_after_override_minutes'<>'null'::jsonb and after_value is null) or
   (kind_value<>'STAFF_SERVICE' and (duration_value is not null or price_value is not null or
     before_value is not null or after_value is not null or online_value is not null))
 then return '{"error":"invalid_input"}'; end if;
 member:=private.current_membership_id(target);
 if expected=0 then
   if exists(select from private.eligibility_links e where e.tenant_id=target and
     e.kind=kind_value and e.staff_id is not distinct from staff_value and
     e.service_id is not distinct from service_value and
     e.location_id is not distinct from location_value)
   then return '{"error":"relation_exists"}'; end if;
   new_id:=gen_random_uuid();
   insert into private.eligibility_links(id,tenant_id,kind,staff_id,service_id,location_id,
     enabled,duration_override_minutes,price_override_minor_units,
     buffer_before_override_minutes,buffer_after_override_minutes,online_bookable_override,
     revision,created_at,updated_at)
   values(new_id,target,kind_value,staff_value,service_value,location_value,enabled_value,
     duration_value,price_value,before_value,after_value,online_value,1,stamp,stamp);
   next_revision:=1;
 else
   if not exists(select from private.eligibility_links e where e.tenant_id=target and
     e.id=link and e.kind=kind_value and e.staff_id is not distinct from staff_value and
     e.service_id is not distinct from service_value and
     e.location_id is not distinct from location_value)
   then return '{"error":"relation_unavailable"}'; end if;
   update private.eligibility_links e set enabled=enabled_value,
     duration_override_minutes=duration_value,price_override_minor_units=price_value,
     buffer_before_override_minutes=before_value,buffer_after_override_minutes=after_value,
     online_bookable_override=online_value,revision=e.revision+1,updated_at=stamp
   where e.id=link and e.tenant_id=target and e.revision=expected
   returning e.revision into next_revision;
   if next_revision is null then return '{"error":"revision_conflict"}'; end if;
   new_id:=link;
 end if;
 insert into private.eligibility_events(tenant_id,eligibility_id,revision,action,
   actor_user_id,actor_membership_id,occurred_at)
 values(target,new_id,next_revision,case when next_revision=1 then 'eligibility.created'
   when not enabled_value then 'eligibility.disabled' else 'eligibility.updated' end,
   actor,member,stamp);
 return pg_catalog.jsonb_build_object('eligibility_id',new_id,'revision',next_revision,
   'eligibility',(private.list_tenant_eligibility(target)->'eligibility'));
exception
 when foreign_key_violation then return '{"error":"relation_unavailable"}';
 when unique_violation then return '{"error":"relation_exists"}';
 when others then return '{"error":"dependency_unavailable"}';
end $$;

-- Authenticated invoker wrappers; raw tables are private, including history.
create function public.list_tenant_staff(target uuid) returns jsonb
language sql stable security invoker set search_path='' as $$
 select case when private.authenticated_session_user() is null then '{"error":"unauthorized"}'::jsonb
 else private.list_tenant_staff(target) end
$$;
create function public.save_tenant_staff(target uuid,staff uuid,
  expected private.settings_wire_revision,attributes jsonb) returns jsonb
language sql volatile security invoker set search_path='' as $$
 select case when private.authenticated_session_user() is null then '{"error":"unauthorized"}'::jsonb
 else private.save_tenant_staff(target,staff,(expected #>> '{}')::numeric::integer,attributes) end
$$;
create function public.list_tenant_eligibility(target uuid) returns jsonb
language sql stable security invoker set search_path='' as $$
 select case when private.authenticated_session_user() is null then '{"error":"unauthorized"}'::jsonb
 else private.list_tenant_eligibility(target) end
$$;
create function public.save_tenant_eligibility(target uuid,link uuid,
  expected private.settings_wire_revision,attributes jsonb) returns jsonb
language sql volatile security invoker set search_path='' as $$
 select case when private.authenticated_session_user() is null then '{"error":"unauthorized"}'::jsonb
 else private.save_tenant_eligibility(target,link,(expected #>> '{}')::numeric::integer,attributes) end
$$;
grant create on schema private to veni_staff_executor;
alter function private.list_tenant_staff(uuid) owner to veni_staff_executor;
alter function private.save_tenant_staff(uuid,uuid,integer,jsonb) owner to veni_staff_executor;
alter function private.list_tenant_eligibility(uuid) owner to veni_staff_executor;
alter function private.save_tenant_eligibility(uuid,uuid,integer,jsonb) owner to veni_staff_executor;
revoke create on schema private from veni_staff_executor;
revoke all on function private.list_tenant_staff(uuid),
  private.save_tenant_staff(uuid,uuid,integer,jsonb),
  private.list_tenant_eligibility(uuid),
  private.save_tenant_eligibility(uuid,uuid,integer,jsonb),
  public.list_tenant_staff(uuid),public.save_tenant_staff(uuid,uuid,private.settings_wire_revision,jsonb),
  public.list_tenant_eligibility(uuid),
  public.save_tenant_eligibility(uuid,uuid,private.settings_wire_revision,jsonb)
  from public,anon,authenticated,service_role;
grant execute on function private.list_tenant_staff(uuid),
  private.save_tenant_staff(uuid,uuid,integer,jsonb),
  private.list_tenant_eligibility(uuid),
  private.save_tenant_eligibility(uuid,uuid,integer,jsonb),
  public.list_tenant_staff(uuid),public.save_tenant_staff(uuid,uuid,private.settings_wire_revision,jsonb),
  public.list_tenant_eligibility(uuid),
  public.save_tenant_eligibility(uuid,uuid,private.settings_wire_revision,jsonb)
  to authenticated;
revoke veni_staff_executor from postgres;
comment on table private.eligibility_links is
  'Explicit tenant-private three-way scheduling eligibility; never public-bookable alone.';
notify pgrst,'reload schema';
commit;
