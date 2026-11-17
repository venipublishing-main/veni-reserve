begin isolation level serializable;
create extension if not exists pgtap with schema extensions;
set local search_path = public,extensions;
select no_plan();

select ok(not (rolcanlogin or rolsuper or rolbypassrls or rolcreatedb or rolcreaterole or rolreplication or rolinherit),
  'Location executor cannot log in or bypass RLS') from pg_roles where rolname='veni_location_executor';
select ok(not pg_has_role(r,'veni_location_executor','MEMBER') and not pg_has_role('veni_location_executor',r,'MEMBER'),
  'Location executor has no inherited API-role route: '||r)
from unnest(array['anon','authenticated','authenticator','service_role']) r;
select ok(not has_schema_privilege('veni_location_executor','private','CREATE'),'Location executor cannot create schema objects');
select is((select count(*) from pg_class where relowner='veni_location_executor'::regrole),0::bigint,
  'Location executor owns no tables');
select is((select count(*) from pg_proc where proowner='veni_location_executor'::regrole),2::bigint,
  'Only two Location private routines use restricted ownership');

select columns_are('private','locations',array['id','tenant_id','name','kind','description',
  'timezone_override','public_visible','sort_order','status','revision','created_at','updated_at']);
select columns_are('private','location_events',array['id','tenant_id','location_id','revision','action',
  'actor_user_id','actor_membership_id','occurred_at']);
select ok(c.relrowsecurity and c.relowner='postgres'::regrole,
  'private table is RLS-enabled and owned by independent postgres: '||c.relname)
from unnest(array['private.locations','private.location_events']) r
join pg_class c on c.oid=r::regclass;
select ok(not has_table_privilege(role,r,'SELECT,INSERT,UPDATE,DELETE,TRUNCATE,REFERENCES,TRIGGER')
  and not has_any_column_privilege(role,r,'SELECT,INSERT,UPDATE,REFERENCES'),
  'No direct private Location access: '||role||'/'||r)
from unnest(array['anon','authenticated','service_role']) role
cross join unnest(array['private.locations','private.location_events']) r;
select ok(not has_table_privilege('veni_location_executor','private.locations','DELETE,TRUNCATE')
  and not has_table_privilege('veni_location_executor','private.location_events','SELECT,UPDATE,DELETE,TRUNCATE'),
  'No hard deletion or history edits through Location executor');
select ok(not has_column_privilege('veni_location_executor','private.locations',col,'UPDATE'),
  'Location identity is immutable: '||col)
from unnest(array['id','tenant_id','created_at']) col;
select is((select count(*) from pg_policies where schemaname='private' and tablename in
  ('locations','location_events')),4::bigint,'Four private, executor-only RLS policies');
select ok(roles=array['veni_location_executor']::name[],'policy restricted to Location executor: '||policyname)
from pg_policies where schemaname='private' and tablename in ('locations','location_events');
select ok(has_function_privilege('authenticated',p.oid,'EXECUTE')
  and not has_function_privilege('anon',p.oid,'EXECUTE')
  and p.proconfig=array['search_path=""'] and p.prosecdef=(n.nspname='private'),
  'RPC invoker public / restricted private contract: '||p.oid::regprocedure)
from pg_proc p join pg_namespace n on n.oid=p.pronamespace
where proname in ('list_tenant_locations','save_tenant_location');
select is((select count(*) from pg_proc p join pg_namespace n on n.oid=p.pronamespace
  where p.proname in ('list_tenant_locations','save_tenant_location') and
    n.nspname in ('public','private')),4::bigint,'No unreviewed overloads');
select * from finish();
rollback;
