import assert from 'node:assert/strict';
import { execFileSync } from 'node:child_process';
import { randomUUID } from 'node:crypto';

// Only this disposable container accepts the test-only Account projection.
const sql = input => execFileSync('docker', ['exec', '-i', 'supabase_db_reserve_onboarding_test',
  'psql', '-XAtq', '-v', 'ON_ERROR_STOP=1', '-U', 'postgres'], { input, encoding: 'utf8' }).trim();
const details = { email: 'office@example.invalid', phone: '', hours: [['09:00','17:00'], ...Array(6).fill(null)],
  min_notice_minutes: 60, max_advance_days: 45 };
export async function verifyOnboarding({ a, b, tenant, call, ok, auth, resume }) {
  for (const id of [tenant, a.id, b.id]) assert.match(id, /^[0-9a-f-]{36}$/);
  const prefix = 'tenants/' + tenant + '/';
  const read = () => call(a, prefix + 'onboarding').then(r => ok(r, 'read draft'));
  const save = (actor, revision, input) => call(actor, prefix + 'onboarding', 'PUT', { expected_revision: revision, details: input });
  const activate = (actor, review) => call(actor, prefix + 'onboarding/activation', 'POST', { review_key: review.review_key });
  assert.equal(sql(`select count(*) from reserve.memberships m join reserve.membership_roles r on r.membership_id=m.id
    where m.user_id='${a.id}' and m.tenant_id='${tenant}' and m.status='ACTIVE' and r.role_id='10000000-0000-4000-8000-000000000001'`), '1');
  const other = await ok(await call(b, 'bootstrap', 'POST', {request_key:b.key}), 'second business');
  assert.notEqual(other.tenant_id, tenant);
  assert.equal((await read()).revision, 0);
  assert.equal((await save(b, 0, details)).status, 404);
  assert.equal((await save(a, 0, {...details,hours:[['17:00','09:00'], ...Array(6).fill(null)]})).status, 422);
  const persisted = await ok(await save(a, 0, details), 'save draft');
  assert.deepEqual(persisted.details, details);
  const returningOwner = await resume();
  assert.deepEqual(await ok(await call(returningOwner, prefix + 'onboarding'), 'resume in a new OAuth session'), persisted);
  assert.equal((await save(a, 0, details)).status, 409);
  assert.equal((await activate(a, persisted)).status, 422);
  assert.equal((await activate(b, persisted)).status, 404);
  const rpc = (actor, name, body) => auth('/rest/v1/rpc/reserve_' + name, { method:'POST',
    headers:{ 'Content-Type':'application/json', ...(actor && {Authorization:'Bearer ' + actor.token}) }, body:JSON.stringify(body) });
  assert.ok(!(await rpc(null, 'read_business_onboarding', {target:tenant})).ok);
  assert.deepEqual(await (await rpc(b, 'activate_business_onboarding', {target:tenant,review_key:persisted.review_key})).json(),
    {error:'tenant_unavailable'});
  assert.deepEqual(await (await rpc(a, 'save_business_onboarding', {target:tenant,expected:1,details:{...details,pilot:true}})).json(), {error:'invalid_input'});
  const create = (path, attributes, key = randomUUID()) => call(a, prefix + path, 'POST',
    { expected_revision:0, attributes }, { 'Idempotency-Key': key });
  const location = await ok(await create('locations',{name:'Consulting room',kind:'PHYSICAL',description:null,
    timezone_override:null,public_visible:true,sort_order:0,status:'ACTIVE'}), 'save location');
  const serviceAttrs = { name:'Consultation', description:null, category:null,duration_minutes:45,
    price_minor_units:null,currency_override:null,price_display:'ON_REQUEST',buffer_before_minutes:0,buffer_after_minutes:0,
    min_notice_minutes:null,max_advance_days:null,public_visible:true,online_bookable:true,sort_order:0,status:'ACTIVE' };
  assert.equal((await call(a, prefix + 'services', 'POST', {expected_revision:0,attributes:serviceAttrs})).status, 422);
  const key = randomUUID();
  const services = await Promise.all([create('services',serviceAttrs,key),create('services',serviceAttrs,key)]);
  const first = await ok(services[0], 'create service'), retry = await ok(services[1], 'concurrent replay');
  assert.equal(first.service_id, retry.service_id);
  assert.equal(retry.services.length, 1);
  assert.equal((await create('services',{...serviceAttrs,name:'Different intent'},key)).status, 409);
  const staff = await ok(await create('staff',{name:'Practitioner',public_display_name:null,biography:null,status:'ACTIVE',
    online_bookable:true,public_visible:true,no_preference_eligible:false,sort_order:0}), 'save practitioner');
  for (const [kind, staff_id, service_id, location_id] of [
    ['STAFF_SERVICE',staff.staff_id,first.service_id,null], ['STAFF_LOCATION',staff.staff_id,null,location.location_id],
    ['SERVICE_LOCATION',null,first.service_id,location.location_id],
  ]) await ok(await create('eligibility',{ kind, staff_id, service_id, location_id, enabled:true,
    duration_override_minutes:null,price_override_minor_units:null,buffer_before_override_minutes:null,
    buffer_after_override_minutes:null,online_bookable_override:null }), 'link ' + kind);
  assert.equal((await activate(a, persisted)).status, 409);
  let review = await read();
  assert.ok(Object.values(review.checks).every(Boolean));
  assert.equal(review.entitled,false);
  const pending = await ok(await activate(a, review), 'request activation');
  assert.equal(pending.status,'pending_entitlement');
  assert.deepEqual(await read(), pending);
  assert.equal(sql(`select status from reserve.tenants where id='${tenant}'`),'SETUP');

  // Model the agreed, private interface in this database only. Remove the fixture even on assertion failure.
  const original = sql("select pg_get_functiondef('reserve_internal.account_publish_entitlement(uuid)'::regprocedure)");
  function fixture(business, start, end, revoked = 'null::timestamptz') {
    sql(`create or replace function reserve_internal.account_publish_entitlement(target uuid)
      returns table(business_id uuid, product text, capability text, basis text, valid_from timestamptz, expires_at timestamptz, revoked_at timestamptz)
      language sql stable security invoker set search_path='' as $$ select '${business}'::uuid,'reserve','publish','free_pilot',
      now()+interval '${start}',now()+interval '${end}',${revoked} $$;`);
  }
  try {
    fixture(tenant, '-1 day','-1 hour');
    assert.equal((await read()).entitled,false);
    fixture(tenant, '1 hour','1 day');
    assert.equal((await read()).entitled,false);
    fixture(randomUUID(), '-1 hour','1 day');
    assert.equal((await read()).entitled,false);
    fixture(tenant, '-1 hour','1 day');
    review = await read();
    assert.equal(review.entitled,true);
    assert.equal(review.status,'pending_entitlement');
    // Same-tenant non-owner with real Auth and a Staff role cannot use the trusted entitlement.
    sql(`begin isolation level serializable;
      insert into reserve.users(id) values('${b.id}') on conflict do nothing;
      with member as (insert into reserve.memberships(tenant_id,user_id,status) values('${tenant}','${b.id}','ACTIVE') returning id)
      insert into reserve.membership_roles(membership_id,role_id) select id,'10000000-0000-4000-8000-000000000004' from member;
      commit;`);
    assert.equal((await activate(b, review)).status, 404);
    assert.equal((await save(b, review.revision, details)).status, 404);
    const active = await ok(await activate(a, review),'activate free pilot');
    assert.equal(active.status,'activated');
    assert.equal(sql(`select status from reserve.tenants where id='${tenant}'`),'ACTIVE');
    fixture(tenant,'-1 hour','1 day','now()');
    assert.equal((await read()).status,'pending_entitlement');
    fixture(tenant,'-1 day','-1 hour');
    assert.equal((await read()).status,'pending_entitlement');
    assert.equal(sql("select has_table_privilege('authenticated','reserve_internal.business_onboarding','UPDATE') or has_function_privilege('authenticated','reserve_internal.account_publish_entitlement(uuid)','EXECUTE')"),'f');
  } finally { sql(original); }
  globalThis.console.log('PASS shared DB owner, draft resume, atomic catalogue retry, cross-tenant and staff denial, pending/expired/revoked/free-pilot activation');
}
