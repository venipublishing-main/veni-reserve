begin isolation level serializable;
create extension if not exists pgtap with schema extensions;
set local search_path=public,extensions;
select no_plan();

select ok(not (rolcanlogin or rolsuper or rolbypassrls or rolcreatedb or rolcreaterole or rolreplication or rolinherit),
  'Service executor is nonlogin, nonbypass, noninheriting and unprivileged')
from pg_roles where rolname='veni_service_executor';
select ok(not pg_has_role(r,'veni_service_executor','MEMBER')
  and not pg_has_role('veni_service_executor',r,'MEMBER'),
  'Service executor has no API role membership route: '||r)
from unnest(array['anon','authenticated','authenticator','service_role']) r;
select is((select count(*) from pg_class where relowner='veni_service_executor'::regrole),0::bigint,
  'Service executor owns no tables');
select is((select count(*) from pg_proc where proowner='veni_service_executor'::regrole),2::bigint,
  'Only two guarded Service routines use restricted ownership');
select ok(not has_schema_privilege('veni_service_executor','private','CREATE'),
  'Service executor has no schema creation privilege');

select columns_are('private','services',array['id','tenant_id','name','description','category',
  'duration_minutes','price_minor_units','currency_override','price_display','buffer_before_minutes',
  'buffer_after_minutes','min_notice_minutes','max_advance_days','public_visible','online_bookable',
  'sort_order','status','revision','created_at','updated_at']);
select columns_are('private','service_events',array['id','tenant_id','service_id','revision',
  'action','actor_user_id','actor_membership_id','occurred_at']);
select ok(c.relrowsecurity and c.relowner='postgres'::regrole,
  'Independent table ownership and RLS: '||c.relname)
from unnest(array['private.services','private.service_events']) r
join pg_class c on c.oid=r::regclass;
select ok(not has_table_privilege(role,r,'SELECT,INSERT,UPDATE,DELETE,TRUNCATE,REFERENCES,TRIGGER')
  and not has_any_column_privilege(role,r,'SELECT,INSERT,UPDATE,REFERENCES'),
  'No direct private Service access: '||role||'/'||r)
from unnest(array['anon','authenticated','service_role']) role
cross join unnest(array['private.services','private.service_events']) r;
select ok(not has_table_privilege('veni_service_executor','private.services','DELETE,TRUNCATE')
  and not has_table_privilege('veni_service_executor','private.service_events','SELECT,UPDATE,DELETE,TRUNCATE'),
  'No routine hard deletion or journal reading/writing');
select ok(not has_column_privilege('veni_service_executor','private.services',col,'UPDATE'),
  'Immutable Service identity: '||col)
from unnest(array['id','tenant_id','created_at']) col;
select is((select count(*) from pg_policies where schemaname='private' and tablename in
  ('services','service_events')),4::bigint,'Four scoped Service table policies');
select ok(roles=array['veni_service_executor']::name[],
  'Service policies limited to restricted executor: '||policyname)
from pg_policies where schemaname='private' and tablename in ('services','service_events');
select ok(roles=array['veni_service_executor']::name[],
  'Service catalogue currency lookup is executor-only')
from pg_policies where schemaname='private' and tablename='settings_reference'
 and policyname='settings_catalogue_service_read';
select is((select count(*) from pg_proc p join pg_namespace n on n.oid=p.pronamespace
  where p.proname in ('list_tenant_services','save_tenant_service')
  and n.nspname in ('private','public')),4::bigint,'Two invoker RPCs and two guarded routines only');
select ok(p.prosecdef=(n.nspname='private') and p.proconfig=array['search_path=""']
  and has_function_privilege('authenticated',p.oid,'EXECUTE')
  and not has_function_privilege('anon',p.oid,'EXECUTE'),
  'Correct Service RPC privileges and security mode: '||p.oid::regprocedure)
from pg_proc p join pg_namespace n on n.oid=p.pronamespace
where p.proname in ('list_tenant_services','save_tenant_service');
select ok(not has_function_privilege('authenticated','private.service_integer(jsonb,integer,integer)','EXECUTE')
  and not has_function_privilege('anon','private.service_integer(jsonb,integer,integer)','EXECUTE'),
  'Numeric wire validator is internal only');
select is(private.service_integer('45'::jsonb,1,10080),45,'Correct whole-number conversion');
select is(private.service_integer('45.1'::jsonb,1,10080),null::integer,'No fractional duration coercion');
select is(private.service_integer('"45"'::jsonb,1,10080),null::integer,'No quoted-number coercion');
select is(private.service_integer('10000000000'::jsonb,1,10080),null::integer,'Oversized number fails closed');
select * from finish();
rollback;
