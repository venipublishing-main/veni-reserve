begin isolation level serializable;
create extension if not exists pgtap with schema extensions;
set local search_path = public,extensions;
select no_plan();

-- These simulated contexts are negative diagnostics only. Successful identity
-- evidence comes exclusively from the issued token used in settingsProof.
select is(private.settings_actor(),null::uuid,'missing canonical request context fails closed');
set local role authenticated;
select private.read_tenant_business_settings(null) as no_context_read,
  private.save_tenant_business_settings(null,0,'Example','UTC','en','CAD',null,null) as no_context_save \gset
reset role;
select is(:'no_context_read'::jsonb,'{"error":"unauthorized"}'::jsonb,'authenticated SQL without verified context cannot read');
select is(:'no_context_save'::jsonb,'{"error":"unauthorized"}'::jsonb,'authenticated SQL without verified context cannot save');
do $diag$
declare bad text;
begin
  foreach bad in array array['{','null','[]','{}',
    '{"sub":"not-a-uuid","role":"authenticated","is_anonymous":false}',
    '{"sub":12,"role":"authenticated","is_anonymous":false}',
    '{"sub":"__AUTH_USER_ID__","role":"service_role","is_anonymous":false}',
    '{"sub":"__AUTH_USER_ID__","role":"authenticated","is_anonymous":"false"}',
    '{"sub":"__AUTH_USER_ID__","role":"authenticated","is_anonymous":true}',
    '{"sub":"__AUTH_USER_ID__","role":"authenticated"}']
  loop
    perform set_config('request.jwt.claims',bad,true);
    if private.settings_actor() is not null then raise exception 'Unsafe M2 identity extraction'; end if;
  end loop;
end $diag$;
select pass('malformed, missing, wrong-type, wrong-role and anonymous claims denied');
select set_config('request.jwt.claims','{"sub":"__AUTH_USER_ID__","role":"authenticated","is_anonymous":false}',true) is not null;
select set_config('request.jwt.claim.sub','__AUTH_USER_ID_2__',true) is not null;
select is(private.settings_actor(),null::uuid,'conflicting legacy subject denied');
select set_config('request.jwt.claim.sub','',true) is not null;
select set_config('request.jwt.claim','{"sub":"__AUTH_USER_ID__","role":"authenticated","is_anonymous":true}',true) is not null;
select is(private.settings_actor(),null::uuid,'conflicting aggregate legacy classification denied');
select set_config('request.jwt.claim','',true) is not null;
select set_config('request.jwt.claims','',true) is not null;
select ok(not has_schema_privilege('veni_settings_executor','auth','USAGE'),'no provider auth schema usage');
select ok(not has_function_privilege('authenticated','private.settings_actor()','EXECUTE') and
  has_function_privilege('veni_settings_executor','private.settings_actor()','EXECUTE'),
  'only internal executor can use new caller adapter among application roles');

select ok(not (rolcanlogin or rolsuper or rolbypassrls or rolcreatedb or rolcreaterole or rolreplication or rolinherit),'restricted executor attributes')
from pg_roles where rolname='veni_settings_executor';
select ok(not pg_has_role(r,'veni_settings_executor','SET') and not pg_has_role('veni_settings_executor',r,'MEMBER'),'no role path '||r)
from unnest(array['anon','authenticated','authenticator','service_role']) r;
select is((select count(*) from pg_namespace where oid<>pg_my_temp_schema() and has_schema_privilege('veni_settings_executor',oid,'CREATE')),0::bigint,'no persistent schema CREATE');
select ok(not has_database_privilege('veni_settings_executor',current_database(),'CREATE'),'no database CREATE');
select is((select count(*) from pg_class where relowner='veni_settings_executor'::regrole),0::bigint,'no relation ownership');
select is((select count(*) from pg_namespace where nspowner='veni_settings_executor'::regrole),0::bigint,'no schema ownership');
select is((select array_agg(proname::text order by proname) from pg_proc where proowner='veni_settings_executor'::regrole),
  array['read_tenant_business_settings','save_tenant_business_settings'],'only guarded routine ownership');
select ok(c.relrowsecurity and c.relowner='postgres'::regrole,r||' RLS and separate data owner')
from unnest(array['private.settings_reference','private.tenant_business_settings','private.tenant_business_settings_changes']) r join pg_class c on c.oid=r::regclass;
select ok(not has_table_privilege(role,r,'SELECT,INSERT,UPDATE,DELETE,TRUNCATE,REFERENCES,TRIGGER') and
 not has_any_column_privilege(role,r,'SELECT,INSERT,UPDATE,REFERENCES'),role||' raw relation denied '||r)
from unnest(array['anon','authenticated','service_role']) role cross join unnest(array['private.settings_reference','private.tenant_business_settings','private.tenant_business_settings_changes']) r;
select is((select count(*) from pg_policies where schemaname='private' and tablename in ('settings_reference','tenant_business_settings','tenant_business_settings_changes')),5::bigint,'five new scoped policies');
select ok(roles=array['veni_settings_executor']::name[],'executor-only policy '||policyname)
from pg_policies where schemaname='private' and tablename in ('settings_reference','tenant_business_settings','tenant_business_settings_changes');
select ok(p.prosecdef=(n.nspname='private') and p.proconfig=array['search_path=""'] and
  has_function_privilege('authenticated',p.oid,'EXECUTE') and not has_function_privilege('anon',p.oid,'EXECUTE')
  and not has_function_privilege('service_role',p.oid,'EXECUTE'),'approved signature '||p.oid::regprocedure)
from pg_proc p join pg_namespace n on n.oid=p.pronamespace where proname in ('read_tenant_business_settings','save_tenant_business_settings');
select is((select count(*) from pg_proc where proname in ('read_tenant_business_settings','save_tenant_business_settings')),4::bigint,'no overloads');
select ok(prosrc !~* '\m(execute|format|lo_\w+|loread|lowrite|dblink\w*|pg_read_file|pg_write_file|create|alter|grant|set\s+role)\M',
  'static operation: no dynamic dispatch or administrative calls '||oid::regprocedure)
from pg_proc where proname in ('read_tenant_business_settings','save_tenant_business_settings');
select ok(not has_column_privilege('veni_settings_executor','private.tenant_business_settings',col,'UPDATE'),'immutable '||col)
from unnest(array['tenant_id','created_at']) col;
select ok(not has_table_privilege('veni_settings_executor','private.tenant_business_settings_changes','SELECT,UPDATE,DELETE,TRUNCATE'),'journal append only');
select ok(not has_table_privilege('veni_settings_executor','private.settings_reference','INSERT,UPDATE,DELETE,TRUNCATE'),'reference read only');
select is((select count(*) from private.settings_reference where kind='zone' and code not in (select name from pg_timezone_names)),0::bigint,'every zone present at runtime');
select ok(has_function_privilege('veni_settings_executor','pg_catalog.lo_from_bytea(oid,bytea)','EXECUTE'),'AR-033 known ambient privilege, not granted by this migration');
select ok(not exists(select from pg_class c join pg_namespace n on n.oid=c.relnamespace where n.nspname in ('public','private') and case when c.relkind='S' then has_sequence_privilege('veni_settings_executor',c.oid,'USAGE,SELECT,UPDATE') else false end),'no application sequence authority');
select ok(not exists(select from pg_class c join pg_namespace n on n.oid=c.relnamespace where n.nspname in ('public','private') and c.relkind='r' and c.relname not in ('settings_reference','tenant_business_settings','tenant_business_settings_changes') and has_any_column_privilege('veni_settings_executor',c.oid,'SELECT,INSERT,UPDATE,REFERENCES')),'no other application column privileges');
select ok(not exists(select from pg_constraint where conrelid in ('private.tenant_business_settings'::regclass,'private.tenant_business_settings_changes'::regclass) and contype='f' and (confdeltype<>'r' or confupdtype<>'r')),'restrictive FKs only');
select columns_are('private','tenant_business_settings',array['tenant_id','display_name','timezone','default_locale','default_currency','staff_member_singular','staff_member_plural','revision','created_at','updated_at']);
select columns_are('private','tenant_business_settings_changes',array['tenant_id','revision','action','occurred_at','actor_user_id','actor_membership_id']);
select throws_ok($$truncate private.tenant_business_settings_changes$$,'23514',null,'journal truncate guard');
select * from finish();
rollback;
