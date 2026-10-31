-- Run via pnpm test:db: the wrapper provisions a real Auth Admin API fixture.
begin isolation level serializable;
create extension if not exists pgtap with schema extensions;
set local search_path = public, extensions;
select no_plan();

select has_table('public', 'tenants', 'Tenant table exists');
select has_table('public', 'users', 'Application User table exists');
select has_table('public', 'memberships', 'Membership table exists');
select columns_are('public', 'tenants', array['id', 'status', 'created_at'], 'Tenant has only identity/lifecycle fields');
select columns_are('public', 'users', array['id', 'created_at'], 'User has no Tenant/Staff/Customer/credential fields');
select columns_are('public', 'memberships', array['id', 'tenant_id', 'user_id', 'status', 'created_at'], 'Membership has no Role/Owner/Invitation fields');
select col_is_pk('public', 'tenants', 'id', 'Tenant UUID is primary key');
select col_is_pk('public', 'users', 'id', 'User UUID is primary key');
select col_is_pk('public', 'memberships', 'id', 'Membership UUID is primary key');
select col_type_is('public', t, 'id', 'uuid', t || ' identity uses UUID')
from unnest(array['tenants', 'users', 'memberships']) as t;
select fk_ok('public', 'users', 'id', 'auth', 'users', 'id', 'Application identity references Auth primary key');
select fk_ok('public', 'memberships', 'tenant_id', 'public', 'tenants', 'id', 'Membership references Tenant');
select fk_ok('public', 'memberships', 'user_id', 'public', 'users', 'id', 'Membership references application User');
select has_index('public', 'memberships', 'memberships_user_id_idx', array['user_id'], 'User-first Membership lookup is indexed');
select col_hasnt_default('public', 'tenants', 'status', 'Tenant state must be chosen explicitly');
select col_hasnt_default('public', 'memberships', 'status', 'Membership state must be chosen explicitly');

select throws_ok($$insert into public.users(id) values ('00000000-0000-4000-8000-000000000099')$$,
  '23503', null, 'An application User cannot exist without an Auth identity');
select lives_ok($$insert into public.users(id) values ('__AUTH_USER_ID__')$$,
  'Application projection accepts the real Auth identity');
select throws_ok($$insert into public.users(id) values ('__AUTH_USER_ID__')$$,
  '23505', null, 'Auth identity has at most one application projection');

select lives_ok(format('insert into public.tenants(status) values (%L)', state),
  'Tenant accepts ' || state)
from unnest(array['SETUP', 'ACTIVE', 'SUSPENDED', 'ARCHIVED']) as state;
select throws_ok($$insert into public.tenants(status) values ('TRIAL')$$,
  '23514', null, 'Tenant rejects a noncanonical commercial state');
select throws_ok($$insert into public.tenants(status) values ('active')$$,
  '23514', null, 'Tenant state vocabulary is case-sensitive');
select throws_ok($$insert into public.tenants default values$$,
  '23502', null, 'Tenant requires an explicit lifecycle value');

insert into public.tenants(id, status) values
  ('00000000-0000-4000-8000-000000000001', 'SETUP'),
  ('00000000-0000-4000-8000-000000000002', 'ACTIVE');
select lives_ok($$insert into public.memberships(id, tenant_id, user_id, status) values
  ('00000000-0000-4000-8000-000000000011', '00000000-0000-4000-8000-000000000001', '__AUTH_USER_ID__', 'ACTIVE'),
  ('00000000-0000-4000-8000-000000000012', '00000000-0000-4000-8000-000000000002', '__AUTH_USER_ID__', 'ACTIVE')$$,
  'One User can hold independent Memberships in two Tenants');
select is((select count(*) from public.memberships where user_id = '__AUTH_USER_ID__'), 2::bigint,
  'Both Tenant relationships are persisted');
select throws_ok($$insert into public.memberships(tenant_id, user_id, status)
  values ('00000000-0000-4000-8000-000000000001', '__AUTH_USER_ID__', 'ACTIVE')$$,
  '23505', null, 'Duplicate Tenant/User relationship is rejected');

-- Exercise lifecycle storage, not transition authorization or M1.1B workflows.
select lives_ok(format('update public.memberships set status = %L where id = %L',
  state, '00000000-0000-4000-8000-000000000011'), 'Membership accepts ' || state)
from unnest(array['SUSPENDED', 'REVOKED', 'ACTIVE']) as state;
select is((select id::text from public.memberships where tenant_id = '00000000-0000-4000-8000-000000000001'
  and user_id = '__AUTH_USER_ID__'), '00000000-0000-4000-8000-000000000011',
  'Lifecycle updates retain the durable Membership identity');
update public.memberships set status = 'REVOKED' where id = '00000000-0000-4000-8000-000000000011';
select throws_ok($$insert into public.memberships(tenant_id, user_id, status)
  values ('00000000-0000-4000-8000-000000000001', '__AUTH_USER_ID__', 'ACTIVE')$$,
  '23505', null, 'Revocation does not allow a second identity for the pair');
select throws_ok(format('update public.memberships set status = %L where id = %L',
  state, '00000000-0000-4000-8000-000000000011'), '23514', null,
  'Membership rejects noncanonical state ' || state)
from unnest(array['INVITED', 'PENDING', 'active']) as state;

select throws_ok($$insert into public.memberships(user_id, status) values ('__AUTH_USER_ID__', 'ACTIVE')$$,
  '23502', null, 'Membership requires Tenant');
select throws_ok($$insert into public.memberships(tenant_id, status) values ('00000000-0000-4000-8000-000000000001', 'ACTIVE')$$,
  '23502', null, 'Membership requires User');
select throws_ok($$insert into public.memberships(tenant_id, user_id) values ('00000000-0000-4000-8000-000000000001', '__AUTH_USER_ID__')$$,
  '23502', null, 'Membership requires explicit state');
select throws_ok($$insert into public.memberships(tenant_id, user_id, status) values
  ('00000000-0000-4000-8000-000000000099', '__AUTH_USER_ID__', 'ACTIVE')$$,
  '23503', null, 'Membership rejects a missing Tenant');
select throws_ok($$insert into public.memberships(tenant_id, user_id, status) values
  ('00000000-0000-4000-8000-000000000001', '00000000-0000-4000-8000-000000000099', 'ACTIVE')$$,
  '23503', null, 'Membership rejects a missing application User');

select throws_ok($$delete from public.tenants where id = '00000000-0000-4000-8000-000000000001'$$,
  '23503', null, 'Even revoked Membership history blocks Tenant deletion');
select throws_ok($$delete from public.users where id = '__AUTH_USER_ID__'$$,
  '23503', null, 'Retained Memberships block application User deletion');
select throws_ok($$delete from auth.users where id = '__AUTH_USER_ID__'$$,
  '23503', null, 'Auth identity deletion cannot cascade business history');
select is((select count(*) from public.memberships where user_id = '__AUTH_USER_ID__'), 2::bigint,
  'All retained Memberships survive failed parent deletions');

select col_not_null('public', t, 'created_at', t || ' creation time is required')
from unnest(array['tenants', 'users', 'memberships']) as t;
select col_type_is('public', t, 'created_at', 'timestamp with time zone', t || ' creation time is timezone-aware')
from unnest(array['tenants', 'users', 'memberships']) as t;
select ok((select created_at = transaction_timestamp() from public.users where id = '__AUTH_USER_ID__'),
  'User creation timestamp defaults to the database transaction time');
select ok((select bool_and(created_at = transaction_timestamp()) from public.tenants),
  'Tenant creation timestamps default to database time');
select ok((select bool_and(created_at = transaction_timestamp()) from public.memberships),
  'Membership creation timestamps default to database time');

select ok(c.relrowsecurity, c.relname || ' has structural RLS enabled')
from pg_class c join pg_namespace n on n.oid = c.relnamespace
where n.nspname = 'public' and c.relname in ('tenants', 'users', 'memberships') order by c.relname;
select is((select count(*) from pg_policies where schemaname = 'public'
  and tablename in ('tenants', 'users', 'memberships')), 3::bigint,
  'AR-028 adds exactly three foundation read policies (full inventory tested in M1.2)');
select ok(not has_table_privilege(r, 'public.' || t, 'INSERT,UPDATE,DELETE,TRUNCATE,REFERENCES,TRIGGER')
  and has_table_privilege(r, 'public.' || t, 'SELECT') = (r = 'authenticated'),
  r || ' has exact AR-028 read-only privileges on ' || t)
from unnest(array['anon', 'authenticated']) as r
cross join unnest(array['tenants', 'users', 'memberships']) as t;

-- Preserve all 67 original assertions above; finish each Tenant coherently
-- under AR-027 before testing deferred integrity, then roll everything back.
update public.memberships set status='ACTIVE';
insert into public.memberships(tenant_id,user_id,status)
select t.id,'__AUTH_USER_ID__','ACTIVE' from public.tenants t
where not exists(select 1 from public.memberships m where m.tenant_id=t.id);
insert into public.membership_roles(membership_id,role_id)
select id,'10000000-0000-4000-8000-000000000001' from public.memberships;
set constraints all immediate;
select * from finish();
rollback;
