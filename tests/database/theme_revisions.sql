begin isolation level serializable;
create extension if not exists pgtap with schema extensions;
set local search_path = public,extensions;
select no_plan();

select ok(not (rolcanlogin or rolsuper or rolbypassrls or rolcreatedb or rolcreaterole or rolreplication or rolinherit),
  'Theme executor has no login, bypass, inheritance or administration')
from pg_roles where rolname='veni_theme_executor';
select ok(not pg_has_role(r,'veni_theme_executor','MEMBER') and not pg_has_role('veni_theme_executor',r,'MEMBER'),
  'no callable membership path for '||r)
from unnest(array['anon','authenticated','authenticator','service_role']) r;
select is((select count(*) from pg_class where relowner='veni_theme_executor'::regrole),0::bigint,'executor owns no tables');
select is((select count(*) from pg_proc where proowner='veni_theme_executor'::regrole),5::bigint,'only five guarded private routines owned');
select ok(not has_schema_privilege('veni_theme_executor','private','CREATE'),'executor cannot create schema objects');

select ok(c.relrowsecurity and c.relowner='postgres'::regrole,'RLS and independent postgres table ownership: '||c.relname)
from unnest(array['private.themes','private.theme_revisions','private.theme_revision_events','private.published_theme_assignments']) r
join pg_class c on c.oid=r::regclass;
select ok(not has_table_privilege(role,r,'SELECT,INSERT,UPDATE,DELETE,TRUNCATE,REFERENCES,TRIGGER')
 and not has_any_column_privilege(role,r,'SELECT,INSERT,UPDATE,REFERENCES'),role||' has no direct Theme access: '||r)
from unnest(array['anon','authenticated','service_role']) role
cross join unnest(array['private.themes','private.theme_revisions','private.theme_revision_events','private.published_theme_assignments']) r;
select ok(not has_table_privilege('veni_theme_executor','private.published_theme_assignments','SELECT,INSERT,UPDATE,DELETE,TRUNCATE'),
  'published pointer is wholly closed');
select is((select count(*) from pg_policies where schemaname='private' and tablename in
  ('themes','theme_revisions','theme_revision_events','published_theme_assignments')),6::bigint,
  'six scoped policies, no public assignment policy');
select ok(roles=array['veni_theme_executor']::name[],'executor-only policy: '||policyname)
from pg_policies where schemaname='private' and tablename in ('themes','theme_revisions','theme_revision_events');
select ok(not has_column_privilege('veni_theme_executor','private.themes',col,'UPDATE'),'immutable Theme identity: '||col)
from unnest(array['id','tenant_id','name','status','created_by_user_id','created_at']) col;
select ok(not has_table_privilege('veni_theme_executor','private.theme_revisions','UPDATE,DELETE,TRUNCATE'),
  'revision snapshots are append-only');
select ok(not has_table_privilege('veni_theme_executor','private.theme_revision_events','SELECT,UPDATE,DELETE,TRUNCATE'),
  'revision journal is append-only');

select columns_are('private','themes',array['id','tenant_id','name','status','draft_revision',
  'created_by_user_id','created_by_membership_id','created_at','updated_at']);
select columns_are('private','theme_revisions',array['id','tenant_id','theme_id','revision','schema_version',
  'tokens','source_revision','actor_user_id','actor_membership_id','created_at']);
select columns_are('private','theme_revision_events',array['id','tenant_id','theme_id','revision',
  'action','actor_user_id','actor_membership_id','occurred_at','correlation_id']);
select columns_are('private','published_theme_assignments',array['tenant_id','theme_id','revision',
  'generation','assigned_at','actor_user_id']);
select throws_ok($$truncate private.theme_revisions$$,'23514',null,'history cannot be truncated');
select throws_ok($$truncate private.theme_revision_events$$,'23514',null,'event journal cannot be truncated');
select is((select count(*) from private.published_theme_assignments),0::bigint,'no public assignment in draft slice');
select is((select count(*) from pg_proc where proname in ('list_tenant_themes','read_tenant_theme',
  'read_tenant_theme_revision','create_tenant_theme','save_tenant_theme_revision')),10::bigint,
  'five public invoker wrappers and five private restricted routines; no overloads');
select ok(prosecdef=(n.nspname='private') and proconfig=array['search_path=""'] and
  has_function_privilege('authenticated',p.oid,'EXECUTE') and not has_function_privilege('anon',p.oid,'EXECUTE'),
  'RPC guards and dedicated ownership: '||p.oid::regprocedure)
from pg_proc p join pg_namespace n on n.oid=p.pronamespace where proname in
  ('list_tenant_themes','read_tenant_theme','read_tenant_theme_revision','create_tenant_theme','save_tenant_theme_revision');
select is(private.normalized_theme_tokens('{"primary":"#ABCDEF","accent":"#000000","typography":"serif"}'::jsonb),
  '{"primary":"#abcdef","accent":"#000000","typography":"serif"}'::jsonb,'safe token canonicalization');
select is(private.normalized_theme_tokens('{"primary":"#abcdef","accent":"#000000","typography":"serif","css":"body{}"}'::jsonb),
  null::jsonb,'unknown CSS keys rejected');
select is(private.normalized_theme_tokens('{"primary":"#fff","accent":"red","typography":"serif"}'::jsonb),
  null::jsonb,'nonhex colours rejected');
select * from finish();
rollback;
