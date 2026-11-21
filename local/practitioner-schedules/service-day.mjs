import assert from 'node:assert/strict';
import { randomUUID } from 'node:crypto';
import { test } from 'node:test';
import { readServiceDay } from '../../app/lib/practitioner-schedule.server.ts';
import { authorize, createBusiness, newUser, ok, registerClient, request, rpc, sql, uuid } from './fixture.mjs';

const client = await registerClient();
const owner = await newUser();
const token = await authorize(client, owner.token);
const { target, practitioner } = await createBusiness(token, 'Africa/Johannesburg');

// Keep only the caller's latest committed M2 revision for edits through the normal catalogue APIs.
function catalogueRecord(kind, key, attributes, id = null, revision = 0) {
  return {
    get id() { return id; },
    async save(patch = {}) {
      const next = { ...attributes, ...patch };
      const saved = await ok(await rpc(token, 'save_tenant_' + kind, { target, [key]: id, expected: revision, attributes: next }));
      id = uuid(saved[kind + '_id']);
      revision = saved.revision;
      attributes = next;
    }
  };
}
const member = catalogueRecord('staff', 'staff', { name:'Test practitioner', public_display_name:null,
  biography:null, status:'ACTIVE', public_visible:false, online_bookable:true, no_preference_eligible:true, sort_order:0 }, practitioner, 1);
const serviceAttributes = { name:'Synthetic service', description:null, category:null,
  duration_minutes:30, price_minor_units:null, currency_override:null, price_display:'HIDDEN',
  buffer_before_minutes:10, buffer_after_minutes:5, min_notice_minutes:120, max_advance_days:7,
  public_visible:false, online_bookable:true, sort_order:0, status:'ACTIVE' };
const locationAttributes = {name:'Private office',kind:'PHYSICAL',description:null,
  timezone_override:null,public_visible:false,sort_order:0,status:'ACTIVE'};
const offering = catalogueRecord('service','service',serviceAttributes);
const site = catalogueRecord('location','location',locationAttributes);
await site.save();
await offering.save();
const key = { target, practitioner, service:offering.id, location:site.id, on_date:'2026-11-23', mode:'NO_PREFERENCE' };
function link(kind, staff_id, service_id, location_id) {
  return catalogueRecord('eligibility','link',{kind, staff_id, service_id, location_id, enabled:true,
    online_bookable_override:null, duration_override_minutes:null, buffer_before_override_minutes:null,
    buffer_after_override_minutes:null, price_override_minor_units:null});
}
const ss = link('STAFF_SERVICE',practitioner,offering.id,null);
const sl = link('STAFF_LOCATION',practitioner,null,site.id);
const vl = link('SERVICE_LOCATION',null,offering.id,site.id);
const context = { earliest:0, interval:10, occupied:[] };
const raw = (q=key, credential=token) => rpc(credential,'read_service_day',q);
const read = (patch={}, credential=token) => readServiceDay(q=>raw(q,credential),{...key,...patch},context);
async function rejected(reason, patch={}) {
  const day = await read(patch);
  assert.equal(day.eligible,false);
  assert.deepEqual(day.list(),[]);
  assert.deepEqual(day.check(600),{ok:false,reason});
}
async function denied(response) {
  assert.equal(response.status,403);
  assert.equal((await response.json()).code,'42501');
}
const reception = await newUser();
const receptionToken = await authorize(client,reception.token);
const membership = randomUUID();
sql(`begin isolation level serializable; insert into reserve.users(id) values ('${uuid(reception.id)}');
  insert into reserve.memberships(id,tenant_id,user_id,status) values ('${membership}','${target}','${reception.id}','ACTIVE');
  insert into reserve.membership_roles(membership_id,role_id) values ('${membership}','10000000-0000-4000-8000-000000000003'); commit;`);
try {
  await test('a fresh stack denies day reads until its Reserve client is approved',async()=> {
    await denied(await raw());
  });
  sql(`create or replace function reserve_internal.schedule_client_approved(client uuid) returns boolean
    language sql stable security invoker set search_path='' as $$select client='${uuid(client.client_id)}'::uuid$$`);

  // Build each missing-link case with the other two links present.
  await sl.save(); await vl.save();
  await test('absent Staff–Service link denies both modes',async()=> {
    await member.save({public_visible:true});
    for (const mode of ['NAMED','NO_PREFERENCE']) await rejected('staff_service_unavailable',{mode});
  });
  await ss.save();
  await test('absent Staff–Location and Service–Location links independently deny both modes',async()=> {
    const extra = catalogueRecord('location','location',{...locationAttributes,name:'Second office'});
    await extra.save();
    await link('SERVICE_LOCATION',null,offering.id,extra.id).save();
    for (const mode of ['NAMED','NO_PREFERENCE']) await rejected('staff_location_unavailable',{location:extra.id,mode});
    const third = catalogueRecord('location','location',{...locationAttributes,name:'Third office'});
    await third.save();
    await link('STAFF_LOCATION',practitioner,null,third.id).save();
    for (const mode of ['NAMED','NO_PREFERENCE']) await rejected('service_location_unavailable',{location:third.id,mode});
  });
  await test('each disabled link removes eligibility from both modes',async()=> {
    for (const [pair,reason] of [[ss,'staff_service_unavailable'],[sl,'staff_location_unavailable'],[vl,'service_location_unavailable']]) {
      await pair.save({enabled:false});
      for (const mode of ['NAMED','NO_PREFERENCE']) await rejected(reason,{mode});
      await pair.save({enabled:true});
    }
  });
  await test('eligible combination with no schedule has zero starts',async()=> {
    const day = await read();
    assert.equal(day.eligible,true); assert.deepEqual(day.list(),[]);
    assert.equal(day.check(600).reason,'outside_staff_hours');
  });
  await ok(await rpc(token,'save_practitioner_schedule',{target,practitioner,expected:0,week:[[],[{opens:540,closes:660}],[],[],[],[],[]]}));
  await test('private service and location inherit M2 defaults and preserve service notice and horizon',async()=> {
    const day = await read({mode:'NAMED'});
    assert.deepEqual(day.serviceRules,{durationMinutes:30,bufferBeforeMinutes:10,bufferAfterMinutes:5,
      onlineBookable:true,minNoticeMinutes:120,maxAdvanceDays:7});
    assert.deepEqual(day.list(),[550,560,570,580,590,600,610,620]);
    const decision = day.check(600);
    assert.equal(decision.start,Date.parse('2026-11-23T08:00:00Z'));
    assert.equal(decision.start-decision.occupiedStart,10*60000);
    assert.equal(decision.occupiedEnd-decision.serviceEnd,5*60000);
  });
  await test('explicit zero buffers and duration override change actual starts on the same grid',async()=> {
    await ss.save({buffer_before_override_minutes:0,buffer_after_override_minutes:0,duration_override_minutes:60});
    assert.deepEqual((await read()).list(),[540,550,560,570,580,590,600]);
    await ss.save({duration_override_minutes:null});
    assert.deepEqual((await read()).list(),[540,550,560,570,580,590,600,610,620,630]);
    await offering.save({duration_minutes:40,min_notice_minutes:null,max_advance_days:null});
    const day = await read();
    assert.equal(day.serviceRules.durationMinutes,40);
    assert.equal(day.serviceRules.minNoticeMinutes,null); assert.equal(day.serviceRules.maxAdvanceDays,null);
    assert.equal(day.list().at(-1),620);
  });
  await test('service off is binding even with true override, and false vetoes an enabled service',async()=> {
    await offering.save({online_bookable:false});
    await rejected('service_offline');
    await ss.save({online_bookable_override:true}); await rejected('service_offline');
    await offering.save({online_bookable:true}); assert.equal((await read()).eligible,true);
    await ss.save({online_bookable_override:false}); await rejected('staff_service_offline');
    await ss.save({online_bookable_override:null});
  });
  await test('named visibility and independent No Preference participation use current staff settings',async()=> {
    await member.save({public_visible:false});
    await rejected('practitioner_hidden',{mode:'NAMED'}); assert.ok((await read()).check(540).ok);
    await member.save({public_visible:true,no_preference_eligible:false});
    await rejected('no_preference_disabled'); assert.ok((await read({mode:'NAMED'})).check(540).ok);
    await member.save({online_bookable:false}); await rejected('practitioner_offline',{mode:'NAMED'});
    await member.save({online_bookable:true,no_preference_eligible:true});
  });
  await test('inactive staff, service and location independently remove otherwise available starts',async()=> {
    for (const [resource,reason] of [[member,'practitioner_inactive'],[offering,'service_inactive'],[site,'location_inactive']]) {
      await resource.save({status:'INACTIVE'}); await rejected(reason); await resource.save({status:'ACTIVE'});
    }
  });
  await test('resolved occupied interval meets dated absence and closure at exact half-open edges',async()=> {
    await offering.save({duration_minutes:20});
    await ss.save({buffer_before_override_minutes:10,buffer_after_override_minutes:10});
    for (const [person,place,reason] of [[practitioner,null,'practitioner_absent'],[null,site.id,'location_closed']]) {
      const args = {target,entry:randomUUID(),practitioner:person,location:place,on_date:key.on_date,expected:0,cancel:false};
      await ok(await rpc(token,'save_dated_exception',{...args,opens:600,closes:610}));
      const day = await read();
      assert.ok(day.check(570).ok); assert.equal(day.check(580).reason,reason);
      assert.equal(day.check(610).reason,reason); assert.ok(day.check(620).ok);
      await ok(await rpc(token,'save_dated_exception',{...args,opens:null,closes:null,expected:1,cancel:true}));
    }
  });
  await test('other tenants, unrelated users, wrong clients and malformed requests cannot obtain rules',async()=> {
    const outsider = await newUser(), outsideToken = await authorize(client,outsider.token);
    await denied(await raw(key,outsideToken));
    const other = await createBusiness(outsideToken);
    await denied(await raw({...key,target:other.target})); await denied(await raw({...key,practitioner:other.practitioner}));
    for (const [field, attributes] of [['service',serviceAttributes],['location',locationAttributes]]) {
      const foreign = await ok(await rpc(outsideToken,'save_tenant_'+field,
        {target:other.target,[field]:null,expected:0,attributes}));
      await denied(await raw({...key,[field]:uuid(foreign[field+'_id'])}));
    }
    for (const field of ['service','location']) await denied(await raw({...key,[field]:randomUUID()}));
    await denied(await raw(key,owner.token));
    await denied(await raw(key,await authorize(await registerClient(),owner.token)));
    assert.equal((await raw({...key,mode:'ANY'})).status,400);
    assert.equal((await raw({...key,duration_minutes:1})).status,404);
  });
  await test('Reception reads privately and cannot change eligibility or schedules; revocation is immediate',async()=> {
    assert.equal((await read({},receptionToken)).eligible,true);
    const write = await rpc(receptionToken,'save_tenant_eligibility',{target,link:ss.id,expected:0,attributes:{}});
    assert.ok(['unauthorized','tenant_unavailable'].includes((await write.json()).error));
    await denied(await rpc(receptionToken,'save_practitioner_schedule',{target,practitioner,expected:1,week:[[],[],[],[],[],[],[]]}));
    sql(`begin isolation level serializable; update reserve.memberships set status='REVOKED' where id='${membership}'; commit;`);
    await denied(await raw(key,receptionToken));
  });
  await test('own-only Staff and direct private catalogue reads remain restricted',async()=> {
    const staff = await newUser(), staffMembership = randomUUID();
    sql(`begin isolation level serializable; insert into reserve.users(id) values ('${uuid(staff.id)}');
      insert into reserve.memberships(id,tenant_id,user_id,status) values ('${staffMembership}','${target}','${staff.id}','ACTIVE');
      insert into reserve.membership_roles(membership_id,role_id) values ('${staffMembership}','10000000-0000-4000-8000-000000000004'); commit;`);
    await denied(await raw(key,await authorize(client,staff.token)));
    for (const table of ['services','eligibility_links','staff_members','locations']) {
      assert.equal(sql(`select has_any_column_privilege('authenticated','reserve_internal.${table}','select')`),'f');
    }
  });
  await test('archived subjects stay ineligible',async()=> {
    // Archive in reverse reason precedence so each status is observed.
    for (const [resource,reason] of [[site,'location_inactive'],[member,'practitioner_inactive'],[offering,'service_inactive']]) {
      await resource.save({status:'ARCHIVED'}); await rejected(reason);
    }
  });
  await test('a revoked Reserve session or withdrawn consent denies the same reader',async()=> {
    const secondToken = await authorize(client,owner.token);
    assert.ok((await request('/auth/v1/logout?scope=local',{method:'POST',headers:{Authorization:'Bearer '+secondToken}})).ok);
    await denied(await raw(key,secondToken));
    await ok(await raw());
    assert.equal((await request('/auth/v1/user/oauth/grants?client_id='+client.client_id,
      {method:'DELETE',headers:{Authorization:'Bearer '+owner.token}})).status,204);
    await denied(await raw());
  });
} finally {
  sql("create or replace function reserve_internal.schedule_client_approved(client uuid) returns boolean language sql stable security invoker set search_path='' as $$select false$$");
}
