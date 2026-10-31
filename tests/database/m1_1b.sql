-- Real PostgreSQL structural tests. Auth UUIDs supplied by the local wrapper.
begin isolation level serializable;
create extension if not exists pgtap with schema extensions;
set local search_path=public,extensions;
select no_plan();
create function pg_temp.checked(statement text) returns void language plpgsql as $$
begin execute statement; set constraints all immediate; set constraints all deferred; end $$;
create temporary table expected_permissions(code text primary key);
insert into expected_permissions values
('tenant.read'),
('tenant.settings_manage'),
('members.read'),
('members.invite'),
('members.manage'),
('ownership.manage'),
('calendar.read_all'),
('calendar.read_own'),
('appointments.read_all'),
('appointments.read_own'),
('appointments.create'),
('appointments.update_all'),
('appointments.update_own'),
('appointments.cancel_all'),
('appointments.cancel_own'),
('customers.read_all'),
('customers.read_assigned'),
('customers.create'),
('customers.update'),
('customers.export'),
('staff.read'),
('staff.manage'),
('services.read'),
('services.manage'),
('availability.read_all'),
('availability.read_own'),
('availability.manage_all'),
('availability.manage_own'),
('resources.manage'),
('communications.read'),
('communications.manage'),
('communications.send'),
('templates.manage'),
('themes.read'),
('themes.edit'),
('themes.publish'),
('brand_assets.manage'),
('integrations.read'),
('integrations.manage'),
('exports.create'),
('exports.create_full'),
('imports.view'),
('imports.manage'),
('imports.execute'),
('imports.reverse'),
('reports.view'),
('reports.view_team'),
('reports.view_client_detail'),
('reports.view_value'),
('reports.export'),
('audit.read'),
('billing.read'),
('billing.manage');
select results_eq('select code from public.permissions order by code',
  'select code from expected_permissions order by code','Exact approved catalogue, no missing/extra codes');
select is((select count(*) from public.permissions),53::bigint,'53 capabilities');
select is((select count(*) from public.permissions where code in ('customers.read','reports.read')),0::bigint,'Draft aliases absent');
select results_eq($$select code||':'||display_name from public.roles where kind='SYSTEM' order by code$$,
  $$values ('admin:Admin'),('owner:Owner'),('reception:Reception'),('staff:Staff')$$,'Four exact standard presets');
select is((select count(*) from public.role_permissions),132::bigint,'132 explicit mappings');
-- Independent expected role lists, not copied from migration seed pairs.
create temporary table expected_matrix(role_code text, permission_code text);
insert into expected_matrix select 'owner',code from expected_permissions;
insert into expected_matrix select 'admin',code from expected_permissions where code not in
 ('ownership.manage','customers.export','exports.create_full','imports.execute','imports.reverse','billing.read','billing.manage');
insert into expected_matrix select 'reception',unnest(array[
 'tenant.read','calendar.read_all','calendar.read_own','appointments.read_all','appointments.read_own',
 'appointments.create','appointments.update_all','appointments.update_own','appointments.cancel_all',
 'appointments.cancel_own','customers.read_all','customers.read_assigned','customers.create','customers.update',
 'staff.read','services.read','availability.read_all','availability.read_own','availability.manage_own',
 'communications.read','communications.send','themes.read','reports.view','reports.view_team']);
insert into expected_matrix select 'staff',unnest(array[
 'tenant.read','calendar.read_own','appointments.read_own','appointments.update_own','appointments.cancel_own',
 'customers.read_assigned','services.read','availability.read_own','availability.manage_own']);
select results_eq(
 'select r.code,p.permission_code from public.role_permissions p join public.roles r on r.id=p.role_id order by 1,2',
 'select role_code,permission_code from expected_matrix order by 1,2','Independent full matrix detects extra and missing grants');
select is((select count(*) from public.role_permissions p join public.roles r on r.id=p.role_id where r.code=x.code),
 x.n::bigint,x.code||' grant count') from (values ('owner',53),('admin',46),('reception',24),('staff',9)) x(code,n);
select throws_ok($$update public.roles set code='boss' where code='owner'$$,'23514',null,'Owner identity protected');
select throws_ok($$delete from public.roles where code='staff'$$,'23514',null,'System role deletion protected');
select throws_ok($$delete from public.role_permissions where permission_code='tenant.read'$$,'23514',null,'System mappings protected');
select throws_ok($$update public.permissions set code='tenant.view' where code='tenant.read'$$,'23514',null,'Capability identity immutable');
select throws_ok($$insert into public.roles(kind,code,display_name) values('CUSTOM','custom','Custom')$$,'23514',null,'Custom role needs Tenant');
select throws_ok($$insert into public.roles(kind,code,display_name) values('SYSTEM','other','Other')$$,'23514',null,'No extra system role via normal mutation');
insert into public.users(id) values('__AUTH_USER_ID__'),('__AUTH_USER_ID_2__');
insert into public.tenants(id,status) values
 ('20000000-0000-4000-8000-000000000001','ACTIVE'),
 ('20000000-0000-4000-8000-000000000002','SETUP');
insert into public.memberships(id,tenant_id,user_id,status) values
 ('30000000-0000-4000-8000-000000000001','20000000-0000-4000-8000-000000000001','__AUTH_USER_ID__','ACTIVE'),
 ('30000000-0000-4000-8000-000000000002','20000000-0000-4000-8000-000000000001','__AUTH_USER_ID_2__','ACTIVE'),
 ('30000000-0000-4000-8000-000000000003','20000000-0000-4000-8000-000000000002','__AUTH_USER_ID__','ACTIVE');
insert into public.membership_roles values
 ('30000000-0000-4000-8000-000000000001','10000000-0000-4000-8000-000000000001',now()),
 ('30000000-0000-4000-8000-000000000003','10000000-0000-4000-8000-000000000001',now());
select lives_ok($$set constraints all immediate$$,'Coherent first Owner bootstrap');
set constraints all deferred;
select throws_ok($$select pg_temp.checked('insert into public.tenants(status) values (''SETUP'')')$$,'23514',null,'Ownerless Tenant cannot finish');
select lives_ok($$insert into public.membership_roles(membership_id,role_id) values
 ('30000000-0000-4000-8000-000000000001','10000000-0000-4000-8000-000000000002')$$,'Multiple roles including Owner');
select throws_ok($$insert into public.membership_roles(membership_id,role_id) values
 ('30000000-0000-4000-8000-000000000001','10000000-0000-4000-8000-000000000002')$$,'23505',null,'Duplicate assignment fails');
select lives_ok($$select pg_temp.checked('delete from public.membership_roles where membership_id=''30000000-0000-4000-8000-000000000001'' and role_id=''10000000-0000-4000-8000-000000000002''')$$,'Remove non-Owner role while Owner remains');
select throws_ok($$select pg_temp.checked('delete from public.membership_roles where membership_id=''30000000-0000-4000-8000-000000000001''')$$,'23514',null,'Final Owner assignment cannot be deleted');
select throws_ok(format('select pg_temp.checked(%L)',format(
 'update public.memberships set status=%L where id=%L',s,'30000000-0000-4000-8000-000000000001')),
 '23514',null,'Final Owner cannot become '||s) from unnest(array['SUSPENDED','REVOKED']) s;
select throws_ok($$delete from public.memberships where id='30000000-0000-4000-8000-000000000001'$$,'23503',null,'Owner relationship retained by restrictive FK');
select lives_ok($$select pg_temp.checked('insert into public.membership_roles(membership_id,role_id) values
 (''30000000-0000-4000-8000-000000000002'',''10000000-0000-4000-8000-000000000001'')')$$,'Multiple active Owners permitted');
select lives_ok($$select pg_temp.checked('delete from public.membership_roles where membership_id=''30000000-0000-4000-8000-000000000002''')$$,'Remove one of multiple Owners');
select lives_ok($$select pg_temp.checked('insert into public.membership_roles(membership_id,role_id) values
 (''30000000-0000-4000-8000-000000000002'',''10000000-0000-4000-8000-000000000001'');
 delete from public.membership_roles where membership_id=''30000000-0000-4000-8000-000000000001''')$$,'Atomic ownership transfer');
select throws_ok($$select pg_temp.checked('delete from public.membership_roles where membership_id=''30000000-0000-4000-8000-000000000002''')$$,'23514',null,'Failed transfer rolls back');
select is((select count(*) from public.membership_roles where membership_id='30000000-0000-4000-8000-000000000002'),1::bigint,'Failed transfer retains assignment');
insert into public.roles(id,kind,tenant_id,code,display_name) values
 ('40000000-0000-4000-8000-000000000001','CUSTOM','20000000-0000-4000-8000-000000000001','custom_one','Custom one');
select lives_ok($$insert into public.role_permissions values('40000000-0000-4000-8000-000000000001','tenant.read')$$,'Custom approved capability');
select throws_ok($$insert into public.role_permissions values('40000000-0000-4000-8000-000000000001','tenant.read')$$,'23505',null,'Duplicate mapping rejected');
select throws_ok($$insert into public.role_permissions values('40000000-0000-4000-8000-000000000001','ownership.manage')$$,'23514',null,'Custom ownership delegation rejected');
select throws_ok($$insert into public.roles(kind,tenant_id,code,display_name) values
 ('CUSTOM','20000000-0000-4000-8000-000000000001','owner','Impersonation')$$,'23514',null,'Reserved preset code rejected');
select throws_ok($$insert into public.roles(kind,tenant_id,code,display_name) values
 ('CUSTOM','20000000-0000-4000-8000-000000000001','custom_one','Duplicate')$$,'23505',null,'Custom scoped code unique');
select lives_ok($$insert into public.membership_roles(membership_id,role_id) values
 ('30000000-0000-4000-8000-000000000001','40000000-0000-4000-8000-000000000001')$$,'Same Tenant custom assignment');
select throws_ok($$insert into public.membership_roles(membership_id,role_id) values
 ('30000000-0000-4000-8000-000000000003','40000000-0000-4000-8000-000000000001')$$,'23514',null,'Cross-Tenant custom assignment fails');
select throws_ok($$update public.roles set tenant_id='20000000-0000-4000-8000-000000000002'
 where id='40000000-0000-4000-8000-000000000001'$$,'23514',null,'Parent scope immutable');
select throws_ok($$update public.memberships set tenant_id='20000000-0000-4000-8000-000000000002'
 where id='30000000-0000-4000-8000-000000000002'$$,'23514',null,'Membership parent scope immutable');
select lives_ok($$select pg_temp.checked('update public.memberships set status=''REVOKED'' where id=''30000000-0000-4000-8000-000000000001''')$$,'Non-owner revocation preserves identity');
select is((select count(*) from public.membership_roles where membership_id='30000000-0000-4000-8000-000000000001'),1::bigint,'Revocation retains role relationship');
select lives_ok($$update public.memberships set status='ACTIVE' where id='30000000-0000-4000-8000-000000000001'$$,'Durable Membership reactivated, not duplicated');
select throws_ok($$insert into public.memberships(tenant_id,user_id,status)
 values('20000000-0000-4000-8000-000000000001','__AUTH_USER_ID__','ACTIVE')$$,'23505',null,'Reactivation cannot duplicate durable pair');

-- Test-only issuer: safe synthetic verifier bytes, never a token or provider claim.
create function pg_temp.invite(i uuid, tid uuid, member uuid, email text, role uuid, born timestamptz default now())
returns void language plpgsql as $$
begin
 insert into private.invitations(id,tenant_id,target_email,inviter_user_id,inviter_membership_id,
 created_at,expires_at,request_key,request_fingerprint,token_verifier)
 select i,tid,email,user_id,member,born,born+interval '168 hours',i,
 decode(repeat('00',32),'hex'),decode(replace(i::text,'-','')||replace(i::text,'-',''),'hex')
 from public.memberships where id=member;
 if role is not null then insert into private.invitation_roles values(i,role); end if;
end $$;
select lives_ok($$select pg_temp.checked('select pg_temp.invite(
 ''50000000-0000-4000-8000-000000000001'',''20000000-0000-4000-8000-000000000001'',
 ''30000000-0000-4000-8000-000000000002'',''test+tag@example.invalid'',''10000000-0000-4000-8000-000000000004'')')$$,'Invitation plus intended role completes');
select throws_ok($$select pg_temp.checked('select pg_temp.invite(
 ''50000000-0000-4000-8000-000000000002'',''20000000-0000-4000-8000-000000000001'',
 ''30000000-0000-4000-8000-000000000002'',''empty@example.invalid'',null)')$$,'23514',null,'Empty role set rejected');
select throws_ok($$select pg_temp.invite(
 '50000000-0000-4000-8000-000000000002','20000000-0000-4000-8000-000000000001',
 '30000000-0000-4000-8000-000000000002','owner@example.invalid','10000000-0000-4000-8000-000000000001')$$,'23514',null,'Normal invitation cannot grant Owner');
select throws_ok($$select pg_temp.invite(
 '50000000-0000-4000-8000-000000000002','20000000-0000-4000-8000-000000000002',
 '30000000-0000-4000-8000-000000000003','foreign@example.invalid','40000000-0000-4000-8000-000000000001')$$,'23514',null,'Foreign custom invitation role rejected');
select throws_ok($$insert into private.invitation_roles values
 ('50000000-0000-4000-8000-000000000001','10000000-0000-4000-8000-000000000004')$$,'23505',null,'Duplicate intended role rejected');
select throws_ok($$delete from private.invitation_roles$$,'23514',null,'Intended role removal forbidden');
select throws_ok($$select pg_temp.invite(
 '50000000-0000-4000-8000-000000000002','20000000-0000-4000-8000-000000000001',
 '30000000-0000-4000-8000-000000000002','test+tag@example.invalid','10000000-0000-4000-8000-000000000004')$$,'23505',null,'One outstanding tenant/email');
select lives_ok($$select pg_temp.invite(
 '50000000-0000-4000-8000-000000000002','20000000-0000-4000-8000-000000000002',
 '30000000-0000-4000-8000-000000000003','test+tag@example.invalid','10000000-0000-4000-8000-000000000004')$$,'Same email different Tenant independent');
select throws_ok($$update private.invitations set expires_at=created_at where id='50000000-0000-4000-8000-000000000001'$$,'23514',null,'Expiry cannot be changed after issuance');
select throws_ok($$select pg_temp.invite(
 '50000000-0000-4000-8000-000000000003','20000000-0000-4000-8000-000000000001',
 '30000000-0000-4000-8000-000000000002',' Mixed@Example.invalid ','10000000-0000-4000-8000-000000000004')$$,'23514',null,'Unnormalized email rejected');
select is((select target_email from private.invitations where id='50000000-0000-4000-8000-000000000001'),
 'test+tag@example.invalid','Plus tag preserved');
select lives_ok($$update private.invitations set revoked_at=clock_timestamp(),
 revoked_by_membership_id='30000000-0000-4000-8000-000000000002',revocation_reason='SUPERSEDED'
 where id='50000000-0000-4000-8000-000000000001'$$,'Issuance can be revoked');
select throws_ok($$update private.invitations set revoked_at=null,revoked_by_membership_id=null,revocation_reason=null
 where id='50000000-0000-4000-8000-000000000001'$$,'23514',null,'Terminal receipt cannot reopen');
select lives_ok($$select pg_temp.invite(
 '50000000-0000-4000-8000-000000000003','20000000-0000-4000-8000-000000000001',
 '30000000-0000-4000-8000-000000000002','test+tag@example.invalid','10000000-0000-4000-8000-000000000004')$$,'Reissue frees outstanding slot');
select throws_ok($$delete from private.invitations where id='50000000-0000-4000-8000-000000000001'$$,'23514',null,'Historical issuance cannot be erased');
select ok(not exists(select 1 from information_schema.columns where table_schema='private' and table_name='invitations'
 and column_name in ('token','raw_token','secret','status')),'No raw token or contradictory status column');
select ok((select bool_and(octet_length(token_verifier)=32) from private.invitations),'Verifier has required digest shape');
select lives_ok($$select pg_temp.invite(
 '50000000-0000-4000-8000-000000000004','20000000-0000-4000-8000-000000000001',
 '30000000-0000-4000-8000-000000000002','expired@example.invalid','10000000-0000-4000-8000-000000000004',now()-interval '8 days')$$,'Expired issuance represented without writable status');
insert into public.membership_roles(membership_id,role_id) values
 ('30000000-0000-4000-8000-000000000001','10000000-0000-4000-8000-000000000004');
select throws_ok($$update private.invitations set accepted_at=created_at+interval '1 day',
 accepted_user_id='__AUTH_USER_ID__',accepted_membership_id='30000000-0000-4000-8000-000000000001'
 where id='50000000-0000-4000-8000-000000000004'$$,'23514',null,'Expired receipt cannot backdate acceptance');
select throws_ok($$update private.invitations set accepted_at=clock_timestamp(),
 accepted_user_id='__AUTH_USER_ID__',accepted_membership_id='30000000-0000-4000-8000-000000000001',
 revoked_at=clock_timestamp(),revoked_by_membership_id='30000000-0000-4000-8000-000000000002',revocation_reason='CANCELLED'
 where id='50000000-0000-4000-8000-000000000003'$$,'23514',null,'Accepted/revoked contradiction rejected');
select lives_ok($$update private.invitations set accepted_at=clock_timestamp(),
 accepted_user_id='__AUTH_USER_ID__',accepted_membership_id='30000000-0000-4000-8000-000000000001'
 where id='50000000-0000-4000-8000-000000000003'$$,'Structural receipt for existing ACTIVE Membership');
select throws_ok($$update private.invitations set accepted_at=clock_timestamp()
 where id='50000000-0000-4000-8000-000000000003'$$,'23514',null,'Receipt replay cannot mutate');
-- Audit accepts all bounded actions and enforces safe actor/target shapes.
create function pg_temp.event(a text, meta jsonb default '{}') returns void language plpgsql as $$
begin
 insert into public.audit_events(tenant_id,action,actor_type,actor_user_id,actor_membership_id,target_type,target_id,correlation_id,metadata)
 values('20000000-0000-4000-8000-000000000001',a,'USER','__AUTH_USER_ID__',
 '30000000-0000-4000-8000-000000000001',
 case when a like 'invitation.%' then 'invitation' else 'membership' end,
 case when a like 'invitation.%' then '50000000-0000-4000-8000-000000000001'::uuid else '30000000-0000-4000-8000-000000000001'::uuid end,
 '60000000-0000-4000-8000-000000000001',meta);
end $$;
select lives_ok(format('select pg_temp.event(%L)',a),'Audit action '||a) from unnest(array[
 'invitation.created','invitation.revoked','invitation.accepted','membership.activated','membership.suspended',
 'membership.revoked','role.assigned','role.removed','ownership.granted','ownership.removed','ownership.transferred']) a;
select is((select count(*) from public.audit_events where correlation_id='60000000-0000-4000-8000-000000000001'),11::bigint,'Multiple correlated events allowed');
select throws_ok(format('select pg_temp.event(''role.assigned'',%L::jsonb)',jsonb_build_object(k,'unsafe')::text),
 '23514',null,'Unsafe audit key rejected: '||k) from unnest(array['token','token_verifier','password','jwt','authorization','request_body','note']) k;
select throws_ok($$select pg_temp.event('role.assigned','{"role_id":"free text"}')$$,'23514',null,'Allowed key cannot carry arbitrary free text');
select throws_ok($$select pg_temp.event('role.assigned','[]')$$,'23514',null,'Array metadata rejected');
select lives_ok($$select pg_temp.event('membership.activated','{"old_status":"REVOKED","new_status":"ACTIVE"}')$$,'Safe lifecycle metadata');
select throws_ok($$update public.audit_events set metadata='{}'$$,'23514',null,'Audit UPDATE forbidden');
select throws_ok($$delete from public.audit_events$$,'23514',null,'Audit DELETE forbidden');
select throws_ok($$truncate public.audit_events$$,'23514',null,'Audit TRUNCATE forbidden');
select throws_ok($$insert into public.audit_events(tenant_id,action,actor_type,actor_user_id,actor_membership_id,target_type,target_id,correlation_id)
 values('20000000-0000-4000-8000-000000000002','role.assigned','USER','__AUTH_USER_ID__',
 '30000000-0000-4000-8000-000000000001','membership','30000000-0000-4000-8000-000000000003',gen_random_uuid())$$,
 '23514',null,'Wrong actor Tenant rejected');
select throws_ok($$insert into public.audit_events(tenant_id,action,actor_type,actor_user_id,target_type,target_id,correlation_id)
 values('20000000-0000-4000-8000-000000000002','role.assigned','USER','__AUTH_USER_ID__',
 'membership','30000000-0000-4000-8000-000000000001',gen_random_uuid())$$,
 '23514',null,'Wrong target Tenant rejected');
select lives_ok($$insert into public.audit_events(tenant_id,action,actor_type,service_actor,reason_code,target_type,target_id,correlation_id)
 values('20000000-0000-4000-8000-000000000001','ownership.granted','SERVICE','trusted_bootstrap','BOOTSTRAP',
 'membership','30000000-0000-4000-8000-000000000002',gen_random_uuid())$$,'Explicit SERVICE actor without fabricated User');
select throws_ok($$insert into public.audit_events(tenant_id,action,actor_type,actor_user_id,service_actor,reason_code,target_type,target_id,correlation_id)
 values('20000000-0000-4000-8000-000000000001','ownership.granted','SERVICE','__AUTH_USER_ID__','trusted_bootstrap','BOOTSTRAP',
 'membership','30000000-0000-4000-8000-000000000002',gen_random_uuid())$$,'23514',null,'SERVICE cannot fabricate USER attribution');
select throws_ok($$delete from public.users where id='__AUTH_USER_ID__'$$,'23503',null,'User history restricted');
select throws_ok($$delete from public.tenants where id='20000000-0000-4000-8000-000000000001'$$,'23503',null,'Tenant history restricted');
select ok(c.relrowsecurity,n.nspname||'.'||c.relname||' has RLS')
 from pg_class c join pg_namespace n on n.oid=c.relnamespace
 where (n.nspname='public' and c.relname in ('permissions','roles','role_permissions','membership_roles','audit_events'))
 or (n.nspname='private' and c.relname in ('invitations','invitation_roles'));
select is((select count(*) from pg_policies where schemaname in ('public','private')),0::bigint,'Zero operative policies');
select ok(not has_table_privilege(r,t,'SELECT,INSERT,UPDATE,DELETE,TRUNCATE,REFERENCES,TRIGGER'),r||' denied '||t)
 from unnest(array['anon','authenticated']) r cross join unnest(array[
 'public.permissions','public.roles','public.role_permissions','public.membership_roles',
 'private.invitations','private.invitation_roles','public.audit_events']) t;
select ok(not has_schema_privilege(r,'private','USAGE'),r||' denied private schema') from unnest(array['anon','authenticated']) r;
select is((select count(*) from pg_proc p join pg_namespace n on n.oid=p.pronamespace,
 lateral aclexplode(coalesce(p.proacl,acldefault('f',p.proowner))) a
 where n.nspname='private' and a.grantee=0 and a.privilege_type='EXECUTE'),0::bigint,'No PUBLIC function EXECUTE');
select is((select count(*) from pg_class c join pg_namespace n on n.oid=c.relnamespace,
 lateral aclexplode(coalesce(c.relacl,acldefault('r',c.relowner))) a
 where n.nspname in ('public','private') and c.relkind='r' and a.grantee=0),0::bigint,'No PUBLIC table privileges');
-- Additional structural edge cases (no fabricated provider authentication).
select fk_ok('public','audit_events','target_membership_id','public','memberships','id',
 'Generated Membership target has restrictive real FK');
select fk_ok('public','audit_events','target_invitation_id','private','invitations','id',
 'Generated Invitation target has restrictive real FK');
select results_eq($$select code,id::text from public.roles where kind='SYSTEM' order by code$$,
 $$values ('admin','10000000-0000-4000-8000-000000000002'),
 ('owner','10000000-0000-4000-8000-000000000001'),
 ('reception','10000000-0000-4000-8000-000000000003'),
 ('staff','10000000-0000-4000-8000-000000000004')$$,'Exact immutable system UUIDs');
select throws_ok($$insert into private.invitations(tenant_id,target_email,inviter_user_id,inviter_membership_id,
 created_at,expires_at,request_key,request_fingerprint,token_verifier)
 values('20000000-0000-4000-8000-000000000001','duration@example.invalid','__AUTH_USER_ID__',
 '30000000-0000-4000-8000-000000000001',now(),now()+interval '8 days',gen_random_uuid(),
 decode(repeat('01',32),'hex'),decode(repeat('02',32),'hex'))$$,'23514',null,'Issuance cannot exceed exact seven UTC days');
select throws_ok($$insert into private.invitations(tenant_id,target_email,inviter_user_id,inviter_membership_id,
 expires_at,request_key,request_fingerprint,token_verifier)
 values('20000000-0000-4000-8000-000000000001','digest@example.invalid','__AUTH_USER_ID__',
 '30000000-0000-4000-8000-000000000001',now()+interval '7 days',gen_random_uuid(),
 decode(repeat('01',32),'hex'),decode('00','hex'))$$,'23514',null,'Malformed verifier rejected');
select throws_ok($$insert into private.invitations(tenant_id,target_email,inviter_user_id,inviter_membership_id,
 expires_at,request_key,request_fingerprint,token_verifier)
 values('20000000-0000-4000-8000-000000000001','reused@example.invalid','__AUTH_USER_ID__',
 '30000000-0000-4000-8000-000000000001',now()+interval '7 days',gen_random_uuid(),
 decode(repeat('01',32),'hex'),
 (select token_verifier from private.invitations where id='50000000-0000-4000-8000-000000000001'))$$,
 '23505',null,'Verifier reuse rejected');
select throws_ok($$insert into private.invitations(tenant_id,target_email,inviter_user_id,inviter_membership_id,
 expires_at,request_key,request_fingerprint,token_verifier)
 values('20000000-0000-4000-8000-000000000001','changed-request@example.invalid','__AUTH_USER_ID__',
 '30000000-0000-4000-8000-000000000001',now()+interval '7 days','50000000-0000-4000-8000-000000000001',
 decode(repeat('05',32),'hex'),decode(repeat('06',32),'hex'))$$,
 '23505',null,'Tenant idempotency key cannot create changed request');
select throws_ok($$update private.invitations set request_fingerprint=decode(repeat('09',32),'hex')
 where id='50000000-0000-4000-8000-000000000004'$$,'23514',null,'Request fingerprint immutable');
select throws_ok($$update private.invitations set issuance_xid='1'::xid8
 where id='50000000-0000-4000-8000-000000000004'$$,'23514',null,'Issuance transaction provenance cannot be rewritten');
select throws_ok($$insert into private.invitation_roles values
 ('50000000-0000-4000-8000-000000000003','10000000-0000-4000-8000-000000000002')$$,
 '23514',null,'Accepted issuance cannot gain roles');
select throws_ok($$update private.invitation_roles set role_id='10000000-0000-4000-8000-000000000002'
 where invitation_id='50000000-0000-4000-8000-000000000001'$$,'23514',null,'Intended role UPDATE rejected');
select lives_ok($$insert into private.invitations(id,tenant_id,target_email,inviter_user_id,inviter_membership_id,
 expires_at,request_key,request_fingerprint,token_verifier,supersedes_id)
 values('50000000-0000-4000-8000-000000000005','20000000-0000-4000-8000-000000000001','test+tag@example.invalid',
 '__AUTH_USER_ID__','30000000-0000-4000-8000-000000000001',now()+interval '7 days',gen_random_uuid(),
 decode(repeat('05',32),'hex'),decode(repeat('07',32),'hex'),'50000000-0000-4000-8000-000000000001');
 insert into private.invitation_roles values('50000000-0000-4000-8000-000000000005','10000000-0000-4000-8000-000000000004')$$,
 'Explicit supersession retains prior receipt with new verifier');
select lives_ok($$update public.memberships set status='SUSPENDED' where id='30000000-0000-4000-8000-000000000001'$$,
 'Non-owner can be suspended');
select throws_ok($$update private.invitations set accepted_at=clock_timestamp(),
 accepted_user_id='__AUTH_USER_ID__',accepted_membership_id='30000000-0000-4000-8000-000000000001'
 where id='50000000-0000-4000-8000-000000000005'$$,'23514',null,'Receipt cannot accept a SUSPENDED Membership');
update public.memberships set status='ACTIVE' where id='30000000-0000-4000-8000-000000000001';
select throws_ok($$select pg_temp.checked('
 select pg_temp.event(''membership.suspended'');
 update public.memberships set status=''SUSPENDED'' where id=''30000000-0000-4000-8000-000000000002'';')$$,
 '23514',null,'State and audit rollback together when Owner validation fails');
select is((select count(*) from public.audit_events where action='membership.suspended'),1::bigint,
 'Failed mutation does not leave partial success audit');
select is((select status from public.memberships where id='30000000-0000-4000-8000-000000000002'),'ACTIVE',
 'Failed audited mutation retains active Owner');
set constraints all immediate;
select * from finish();
rollback;
