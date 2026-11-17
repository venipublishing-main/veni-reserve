begin isolation level serializable;
create extension if not exists pgtap with schema extensions;
set local search_path=public,extensions;
select no_plan();

select ok(not (rolcanlogin or rolsuper or rolbypassrls or rolcreatedb or rolcreaterole or rolreplication or rolinherit),
  'Staff executor cannot login, bypass RLS or inherit') from pg_roles where rolname='veni_staff_executor';
select ok(not pg_has_role(r,'veni_staff_executor','MEMBER') and
  not pg_has_role('veni_staff_executor',r,'MEMBER'),
  'No API role can set or inherit the Staff executor: '||r)
from unnest(array['anon','authenticated','authenticator','service_role']) r;
select is((select count(*) from pg_class where relowner='veni_staff_executor'::regrole),0::bigint,
  'Staff executor owns no relations');
select is((select count(*) from pg_proc where proowner='veni_staff_executor'::regrole),4::bigint,
  'Four restricted Staff/eligibility routines only');
select ok(not has_schema_privilege('veni_staff_executor','private','CREATE'),
  'Staff executor has no schema creation rights');
select columns_are('private','staff_members',array['id','tenant_id','name','public_display_name',
  'biography','status','public_visible','online_bookable','no_preference_eligible',
  'sort_order','revision','created_at','updated_at']);
select columns_are('private','staff_events',array['id','tenant_id','staff_id','revision','action',
  'actor_user_id','actor_membership_id','occurred_at']);
select columns_are('private','eligibility_links',array['id','tenant_id','kind','staff_id','service_id',
  'location_id','enabled','duration_override_minutes','price_override_minor_units',
  'buffer_before_override_minutes','buffer_after_override_minutes','online_bookable_override',
  'revision','created_at','updated_at']);
select columns_are('private','eligibility_events',array['id','tenant_id','eligibility_id','revision',
  'action','actor_user_id','actor_membership_id','occurred_at']);
select ok(c.relrowsecurity and c.relowner='postgres'::regrole,'Staff relation has independent owner and RLS: '||c.relname)
from unnest(array['private.staff_members','private.staff_events',
  'private.eligibility_links','private.eligibility_events']) r join pg_class c on c.oid=r::regclass;
select ok(not has_table_privilege(role,r,'SELECT,INSERT,UPDATE,DELETE,TRUNCATE,REFERENCES,TRIGGER')
  and not has_any_column_privilege(role,r,'SELECT,INSERT,UPDATE,REFERENCES'),
  'No raw Staff/eligibility relation exposed: '||role||'/'||r)
from unnest(array['anon','authenticated','service_role']) role
cross join unnest(array['private.staff_members','private.staff_events',
  'private.eligibility_links','private.eligibility_events']) r;
select ok(not has_table_privilege('veni_staff_executor','private.staff_members','DELETE,TRUNCATE') and
  not has_table_privilege('veni_staff_executor','private.eligibility_links','DELETE,TRUNCATE') and
  not has_table_privilege('veni_staff_executor','private.staff_events','SELECT,UPDATE,DELETE,TRUNCATE') and
  not has_table_privilege('veni_staff_executor','private.eligibility_events','SELECT,UPDATE,DELETE,TRUNCATE'),
  'Executor cannot delete identities/links or read or alter journals');
select ok(not has_column_privilege('veni_staff_executor','private.staff_members',col,'UPDATE'),
  'Immutable Staff identity columns: '||col)
from unnest(array['id','tenant_id','created_at']) col;
select ok(not has_column_privilege('veni_staff_executor','private.eligibility_links',col,'UPDATE'),
  'Immutable relationship endpoints: '||col)
from unnest(array['id','tenant_id','kind','staff_id','service_id','location_id','created_at']) col;
select is((select count(*) from pg_policies where schemaname='private' and tablename in
  ('staff_members','staff_events','eligibility_links','eligibility_events')),8::bigint,
  'Eight scoped Staff and eligibility policies');
select ok(roles=array['veni_staff_executor']::name[],
  'Each Staff/eligibility policy uses restricted role: '||policyname)
from pg_policies where schemaname='private' and tablename in
  ('staff_members','staff_events','eligibility_links','eligibility_events');
select is((select count(*) from pg_constraint
  where conrelid='private.eligibility_links'::regclass and contype='f'),4::bigint,
  'Every eligibility endpoint and tenant constrained by real foreign keys');
select ok((select bool_or(indnullsnotdistinct) from pg_index
  where indrelid='private.eligibility_links'::regclass and indisunique),
  'Unique NULLS NOT DISTINCT prevents duplicate eligibility relationships');
select is((select count(*) from pg_proc p join pg_namespace n on n.oid=p.pronamespace
  where n.nspname in ('public','private') and proname in
   ('list_tenant_staff','save_tenant_staff','list_tenant_eligibility','save_tenant_eligibility')),
  8::bigint,'Four invoker RPC and four private guarded routines only');
select ok(p.proconfig=array['search_path=""'] and p.prosecdef=(n.nspname='private') and
  has_function_privilege('authenticated',p.oid,'EXECUTE') and
  not has_function_privilege('anon',p.oid,'EXECUTE') and
  not has_function_privilege('service_role',p.oid,'EXECUTE'),
  'Staff RPC access and search_path contract: '||p.oid::regprocedure)
from pg_proc p join pg_namespace n on n.oid=p.pronamespace
where n.nspname in ('public','private') and proname in
  ('list_tenant_staff','save_tenant_staff','list_tenant_eligibility','save_tenant_eligibility');
select * from finish();
rollback;
