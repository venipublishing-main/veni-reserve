begin isolation level serializable;
create extension if not exists pgtap with schema extensions;
set local search_path = public, extensions;
select no_plan();

-- Independent inventory: no policy on permissions or private history relations.
select results_eq($$select jsonb_build_array(schemaname,tablename,policyname,cmd,roles) from pg_policies
 where schemaname in ('public','private') order by tablename$$,
 $$values
 ('["public","audit_events","audit_events_select_authenticated","SELECT",["authenticated"]]'::jsonb),
 ('["public","membership_roles","membership_roles_select_authenticated","SELECT",["authenticated"]]'::jsonb),
 ('["public","memberships","memberships_select_authenticated","SELECT",["authenticated"]]'::jsonb),
 ('["public","role_permissions","role_permissions_select_authenticated","SELECT",["authenticated"]]'::jsonb),
 ('["public","roles","roles_select_authenticated","SELECT",["authenticated"]]'::jsonb),
 ('["public","tenants","tenants_select_authenticated","SELECT",["authenticated"]]'::jsonb),
 ('["public","users","users_select_authenticated","SELECT",["authenticated"]]'::jsonb)$$,
 'Exact seven SELECT-only authenticated policies');
select ok(bool_and(qual is not null and qual <> 'true' and with_check is null), 'No blanket or write predicates')
 from pg_policies where schemaname in ('public','private');

create temporary table app_relations(name text primary key, readable boolean);
insert into app_relations values ('public.tenants',true),('public.users',true),('public.memberships',true),
 ('public.roles',true),('public.role_permissions',true),('public.membership_roles',true),('public.audit_events',true),
 ('public.permissions',false),('private.invitations',false),('private.invitation_roles',false);
select ok(c.relrowsecurity, name||' RLS enabled') from app_relations join pg_class c on c.oid=name::regclass;
select is(has_table_privilege(r,name,'SELECT'),r='authenticated' and readable,r||' effective SELECT '||name)
 from app_relations cross join unnest(array['anon','authenticated','service_role']) r;
select ok(not has_table_privilege(r,name,'INSERT,UPDATE,DELETE,TRUNCATE,REFERENCES,TRIGGER'),r||' effective no writes/DDL '||name)
 from app_relations cross join unnest(array['anon','authenticated','service_role']) r;
select ok(not has_table_privilege(r,name,'SELECT WITH GRANT OPTION,INSERT WITH GRANT OPTION,UPDATE WITH GRANT OPTION,DELETE WITH GRANT OPTION,TRUNCATE WITH GRANT OPTION,REFERENCES WITH GRANT OPTION,TRIGGER WITH GRANT OPTION'),r||' no grant options '||name)
 from app_relations cross join unnest(array['anon','authenticated','service_role']) r;
select is((select count(*) from app_relations join pg_class c on c.oid=name::regclass,
 lateral aclexplode(coalesce(c.relacl,acldefault('r',c.relowner))) a where a.grantee=0),0::bigint,'No PUBLIC application grants');
select is((select count(*) from app_relations join pg_attribute a on a.attrelid=name::regclass
 where a.attnum>0 and not a.attisdropped and coalesce(cardinality(a.attacl),0)>0),0::bigint,'No hidden explicit column ACLs');
select ok(not has_any_column_privilege(r,name,'INSERT,UPDATE,REFERENCES'),r||' no effective column write privileges '||name)
 from app_relations cross join unnest(array['anon','authenticated','service_role']) r;
select is(has_any_column_privilege(r,name,'SELECT'),r='authenticated' and readable,r||' exact effective column reads '||name)
 from app_relations cross join unnest(array['anon','authenticated','service_role']) r;
select ok(has_schema_privilege(r,'public','USAGE') and not has_schema_privilege(r,'public','CREATE'),r||' public usage only')
 from unnest(array['anon','authenticated','service_role']) r;
select ok(has_schema_privilege(r,'private','USAGE')=(r='authenticated') and not has_schema_privilege(r,'private','CREATE'),r||' private usage exact')
 from unnest(array['anon','authenticated','service_role']) r;
select is((select count(*) from pg_namespace n,lateral aclexplode(coalesce(n.nspacl,acldefault('n',n.nspowner))) a
 where n.nspname='private' and a.grantee=0),0::bigint,'No PUBLIC private schema access');

create temporary table helpers(signature text primary key, definer boolean);
insert into helpers values ('private.business_user_id()',false),('private.current_membership_id(uuid)',true),
 ('private.has_active_membership(uuid)',true),('private.has_capability(uuid,text)',true),
 ('private.tenant_access_enabled(uuid)',true),('private.can_read_membership(uuid)',true),
 ('private.can_read_membership_roles(uuid)',true),('private.can_read_role(uuid)',true);
select is(p.prosecdef, h.definer, signature||' security mode') from helpers h join pg_proc p on p.oid=signature::regprocedure;
select ok(p.proowner='postgres'::regrole and p.provolatile='s' and p.proconfig=array['search_path=""'],signature||' trusted owner/STABLE/empty search_path')
 from helpers h join pg_proc p on p.oid=signature::regprocedure;
select ok(p.prosrc !~* '\m(execute|insert|update|delete|truncate|set[[:space:]]+role)\M',signature||' static read-only body')
 from helpers h join pg_proc p on p.oid=signature::regprocedure;
select is(has_function_privilege(r,signature,'EXECUTE'),r='authenticated',r||' exact helper EXECUTE '||signature)
 from helpers cross join unnest(array['anon','authenticated','service_role']) r;
select results_eq($$select p.oid::regprocedure::text from pg_proc p join pg_namespace n on n.oid=p.pronamespace
 where n.nspname='private' and has_function_privilege('authenticated',p.oid,'EXECUTE') order by 1$$,
 $$select signature from helpers order by 1$$,'Exactly eight executable signatures; integrity triggers not exposed');
select is((select count(*) from pg_proc p join pg_namespace n on n.oid=p.pronamespace,
 lateral aclexplode(coalesce(p.proacl,acldefault('f',p.proowner))) a where n.nspname='private' and (a.grantee=0 or a.is_grantable and a.grantee='authenticated'::regrole)),
 0::bigint,'No PUBLIC function execute or authenticated delegation');
select is((select count(*) from pg_proc p join pg_namespace n on n.oid=p.pronamespace
 where n.nspname='private' and p.prorettype='trigger'::regtype),10::bigint,'All ten integrity trigger functions retained');
select ok(not p.prosecdef and p.proconfig=array['search_path=""']
 and not has_function_privilege('anon',p.oid,'EXECUTE')
 and not has_function_privilege('authenticated',p.oid,'EXECUTE')
 and not has_function_privilege('service_role',p.oid,'EXECUTE'),p.proname||' remains internal invoker')
 from pg_proc p join pg_namespace n on n.oid=p.pronamespace where n.nspname='private' and p.prorettype='trigger'::regtype;
select ok((select prosrc !~* 'public\.' from pg_proc where oid='private.business_user_id()'::regprocedure),'Identity helper has no application graph query');

-- SQL structural identity tests supplement, never replace, genuine HTTP token tests.
select set_config('request.jwt.claims','{}',true);
select is(private.business_user_id(),null::uuid,'Missing claims fail closed');
select set_config('request.jwt.claims','{"sub":"__AUTH_USER_ID__"}',true);
select is(private.business_user_id(),null::uuid,'Missing anonymous classification fails closed');
select set_config('request.jwt.claims','{"sub":"__AUTH_USER_ID__","is_anonymous":"false"}',true);
select is(private.business_user_id(),null::uuid,'String classification fails closed');
select set_config('request.jwt.claims','{"sub":"__AUTH_USER_ID__","is_anonymous":true,"user_metadata":{"is_anonymous":false}}',true);
select is(private.business_user_id(),null::uuid,'Anonymous cannot spoof permanent classification through metadata');
select set_config('request.jwt.claims','{"sub":"__AUTH_USER_ID__","is_anonymous":false}',true);
select is(private.business_user_id(),'__AUTH_USER_ID__'::uuid,'Permanent identity');
select is(private.current_membership_id(null),null::uuid,'NULL tenant has no member');
select ok(not private.has_active_membership(null) and not private.has_capability(null,null)
 and not private.tenant_access_enabled(null) and not private.can_read_membership(null)
 and not private.can_read_membership_roles(null) and not private.can_read_role(null),'NULL predicate arguments fail closed');
select ok(not private.has_capability('99999999-0000-4000-8000-000000000000','tenant.read')
 and not private.can_read_role('99999999-0000-4000-8000-000000000000')
 and not private.can_read_membership('99999999-0000-4000-8000-000000000000'),'Unknown IDs fail closed');

insert into public.users(id) values ('__AUTH_USER_ID__'),('__AUTH_USER_ID_2__');
insert into public.tenants(id,status) values ('90000000-0000-4000-8000-000000000001','ACTIVE'),('90000000-0000-4000-8000-000000000002','ACTIVE');
insert into public.memberships(id,tenant_id,user_id,status) values
 ('91000000-0000-4000-8000-000000000001','90000000-0000-4000-8000-000000000001','__AUTH_USER_ID__','ACTIVE'),
 ('91000000-0000-4000-8000-000000000002','90000000-0000-4000-8000-000000000001','__AUTH_USER_ID_2__','ACTIVE'),
 ('91000000-0000-4000-8000-000000000003','90000000-0000-4000-8000-000000000002','__AUTH_USER_ID_2__','ACTIVE');
insert into public.membership_roles(membership_id,role_id) values
 ('91000000-0000-4000-8000-000000000002','10000000-0000-4000-8000-000000000001'),
 ('91000000-0000-4000-8000-000000000003','10000000-0000-4000-8000-000000000001');
select is(private.current_membership_id('90000000-0000-4000-8000-000000000001'),'91000000-0000-4000-8000-000000000001'::uuid,'Only caller active membership returned');
select ok(private.has_active_membership('90000000-0000-4000-8000-000000000001') and not private.has_capability('90000000-0000-4000-8000-000000000001','tenant.read'),'Zero-role active is not capability authority');
select ok(not private.tenant_access_enabled('90000000-0000-4000-8000-000000000002'),'Foreign tenant helper is caller safe');
select ok(private.can_read_membership('91000000-0000-4000-8000-000000000001') and not private.can_read_membership('91000000-0000-4000-8000-000000000002'),'Zero-role own status not directory');
insert into public.roles(id,kind,tenant_id,code,display_name) values
 ('92000000-0000-4000-8000-000000000001','CUSTOM','90000000-0000-4000-8000-000000000001','test_a','Test A'),
 ('92000000-0000-4000-8000-000000000002','CUSTOM','90000000-0000-4000-8000-000000000002','test_b','Test B');
insert into public.role_permissions values ('92000000-0000-4000-8000-000000000001','audit.read'),('92000000-0000-4000-8000-000000000002','members.read');
insert into public.membership_roles(membership_id,role_id) values
 ('91000000-0000-4000-8000-000000000001','92000000-0000-4000-8000-000000000001'),
 ('91000000-0000-4000-8000-000000000001','10000000-0000-4000-8000-000000000004');
select ok(private.has_capability('90000000-0000-4000-8000-000000000001','audit.read')
 and private.has_capability('90000000-0000-4000-8000-000000000001','tenant.read'),'Multi-role union includes custom and system grants');
select ok(private.has_capability('90000000-0000-4000-8000-000000000001','appointments.read_own')
 and not private.has_capability('90000000-0000-4000-8000-000000000001','appointments.read_all'),'Own mapping never upgrades to all');
select ok(not private.has_capability('90000000-0000-4000-8000-000000000001','unknown')
 and not private.has_capability('90000000-0000-4000-8000-000000000002','audit.read'),'Unknown capability and foreign authority fail closed');
select ok(private.can_read_role('92000000-0000-4000-8000-000000000001')
 and not private.can_read_role('92000000-0000-4000-8000-000000000002'),'Custom role scope');
select throws_ok($$insert into public.membership_roles(membership_id,role_id) values
 ('91000000-0000-4000-8000-000000000001','92000000-0000-4000-8000-000000000002')$$,'23514',null,'Foreign custom assignment remains structurally forbidden');

-- Restricted SQL role: genuine API coverage is in security.mjs.
set local role authenticated;
select is((select count(*) from public.users),1::bigint,'Restricted own global user only');
select is((select count(*) from public.memberships),1::bigint,'Restricted memberships no recursion');
select is((select count(*) from public.membership_roles),2::bigint,'Restricted assignments no recursion');
select is((select count(*) from public.roles),2::bigint,'Restricted roles no recursion');
select is((select count(*) from public.role_permissions),10::bigint,'Restricted mappings no recursion');
select throws_ok($$select * from public.permissions$$,'42501',null,'Catalogue table denied');
select throws_ok($$select * from private.invitations$$,'42501',null,'Private invitation table denied');
select throws_ok($$select * from private.invitation_roles$$,'42501',null,'Private intended role table denied');
reset role;
update public.memberships set status='SUSPENDED' where id='91000000-0000-4000-8000-000000000001';
select ok(private.can_read_membership('91000000-0000-4000-8000-000000000001')
 and not private.can_read_membership_roles('91000000-0000-4000-8000-000000000001')
 and not private.has_capability('90000000-0000-4000-8000-000000000001','tenant.read')
 and not private.can_read_role('92000000-0000-4000-8000-000000000001'),'Suspension leaves only self-status');
update public.memberships set status='REVOKED' where id='91000000-0000-4000-8000-000000000001';
select ok(private.can_read_membership('91000000-0000-4000-8000-000000000001')
 and private.current_membership_id('90000000-0000-4000-8000-000000000001') is null,'Revoked own status does not restore active membership');
set constraints all immediate;
select * from finish();
rollback;
