import assert from 'node:assert/strict';
import { randomUUID } from 'node:crypto';
import { test } from 'node:test';
import { readPractitionerDay } from '../../app/lib/practitioner-schedule.server.ts';
import { authorize, createBusiness, newUser, ok, registerClient, request, rpc, signIn, sql, uuid } from './fixture.mjs';

const client = await registerClient();
const owner = await newUser(), admin = await newUser(), staff = await newUser(), outsider = await newUser();
const ownerToken = await authorize(client,owner.token);
const {target,practitioner,member} = await createBusiness(ownerToken);
const key = {target,practitioner};
const adminMember = randomUUID(), staffMember = randomUUID();
for (const [id,membership,role] of [[admin.id,adminMember,'2'],[staff.id,staffMember,'4']]) {
  sql(`begin isolation level serializable; insert into reserve.users(id) values ('${id}');
    insert into reserve.memberships(id,tenant_id,user_id,status) values ('${membership}','${target}','${id}','ACTIVE');
    insert into reserve.membership_roles(membership_id,role_id) values ('${membership}','10000000-0000-4000-8000-00000000000${role}'); commit;`);
}
const adminToken = await authorize(client,admin.token);
const staffToken = await authorize(client,staff.token);
const outsideToken = await authorize(client,outsider.token);
const other = await createBusiness(outsideToken);
const empty = [[],[],[],[],[],[],[]];
const sunday = [{opens:0,closes:360}];
const monday = [{opens:540,closes:720},{opens:780,closes:1020}];
const week = [sunday,monday,[],[],[],[],[]];
const read = (token,args=key) => rpc(token,'read_practitioner_schedule',args);
const save = (token,expected,periods=week,args=key) => rpc(token,'save_practitioner_schedule',{...args,expected,week:periods});
const count = () => Number(sql(`select count(*) from reserve_internal.practitioner_schedule_revisions where tenant_id='${target}'`));
const denied = async response => {
  assert.equal(response.status,403);
  assert.equal((await response.json()).code,'42501');
};
const rules = {earliest:0,interval:15,bufferBeforeMinutes:0,bufferAfterMinutes:0,durationMinutes:30,
  locationPeriods:[{opens:0,closes:1440}],occupied:[]};
const day = (date,token=ownerToken) => readPractitionerDay(args=>read(token,args),{...key,on_date:date},rules);

await test('unprovisioned client denied for read and save',async () => {
  await denied(await read(ownerToken)); await denied(await save(ownerToken,0));
});
try {
  // Privileged fixture configuration exists only on this explicitly identified disposable project.
  sql(`create or replace function reserve_internal.schedule_client_approved(client uuid) returns boolean
    language sql stable security invoker set search_path='' as $$select client='${uuid(client.client_id)}'::uuid$$`);
  await test('missing revision is a closed week even with an open location',async () => {
    const schedule = await ok(await read(ownerToken));
    assert.deepEqual(schedule.week,empty); assert.equal(schedule.revision,0);
    assert.deepEqual((await day('2026-11-23')).list(),[]);
  });
  await test('owner saves split Monday and new sign-in reads the exact committed week',async () => {
    const saved = await ok(await save(ownerToken,0)); assert.equal(saved.revision,1);
    const returning = await authorize(client,await signIn(owner));
    assert.deepEqual(await ok(await read(returning)), saved);
    assert.deepEqual((await ok(await read(returning,{...key,on_date:'2026-11-23'}))).periods,monday);
    assert.deepEqual((await day('2026-11-24')).list(),[]);
    const evaluator = await day('2026-11-23');
    assert.ok(evaluator.check(540).ok && evaluator.check(780).ok);
    assert.equal(evaluator.check(705).reason,'outside_staff_hours');
  });
  await test('DST gaps and repeated starts fail closed using the saved timezone',async () => {
    assert.equal((await day('2026-03-08')).check(150).reason,'invalid_local_time');
    assert.equal((await day('2026-11-01')).check(90).reason,'invalid_local_time');
    assert.ok((await day('2026-11-01')).check(240).ok);
  });
  await test('malformed, overlapping, adjacent, unsorted, fractional and overnight intervals rejected atomically',async () => {
    for (const invalid of [null,{},[],[null,...empty.slice(1)],
      ...[[{opens:0,closes:60},{opens:50,closes:90}], [{opens:0,closes:60},{opens:60,closes:90}],
        [...monday].reverse(),[{opens:15.5,closes:30}],[{opens:1300,closes:60}],[{opens:1,closes:1441}],
        [{opens:1,closes:1}],[{opens:-1,closes:30}],[{opens:0,closes:30,location:'x'}]].map(periods=>[periods,...empty.slice(1)])]) {
      assert.equal((await save(ownerToken,1,invalid)).status,400);
    }
    assert.equal(count(),1);
  });
  await test('an existing schedule keeps its timezone when the business default changes',async () => {
    await ok(await rpc(ownerToken,'save_tenant_business_settings',{target,expected_revision:1,display_name:'Synthetic business',
      timezone:'Africa/Johannesburg',default_locale:'en-ZA',default_currency:'ZAR',staff_member_singular:null,staff_member_plural:null}));
    assert.equal((await ok(await read(ownerToken))).timezone,'America/New_York');
  });
  await test('admin can save and explicit closure persists',async () => {
    const saved = await ok(await save(adminToken,1,empty)); assert.equal(saved.revision,2); assert.equal(saved.timezone,'America/New_York');
    assert.deepEqual((await day('2026-11-23')).list(),[]);
    assert.equal((await save(ownerToken,1)).status,409);
    assert.equal((await save(ownerToken,88)).status,409);
  });
  await test('two writers at the same revision produce exactly one committed snapshot',async () => {
    const different = [sunday,[],[],[],[],[],[]];
    const responses = await Promise.all([save(ownerToken,2),save(adminToken,2,different)]);
    assert.deepEqual(responses.map(r=>r.status).sort(),[200,409]);
    const winner = await ok(responses.find(r=>r.ok));
    assert.equal(winner.revision,3); assert.deepEqual(await ok(await read(ownerToken)),winner);
  });
  await test('audit snapshots retain actor, membership and original hours and reject mutation',() => {
    const rows = JSON.parse(sql(`select json_agg(r order by revision) from reserve_internal.practitioner_schedule_revisions r where tenant_id='${target}'`));
    assert.equal(rows.length,3);
    assert.deepEqual([rows[0].actor_user_id,rows[0].actor_membership_id,rows[0].week],[owner.id,member,week]);
    assert.deepEqual([rows[1].actor_user_id,rows[1].actor_membership_id,rows[1].week],[admin.id,adminMember,empty]);
    assert.ok(rows.every(r=>r.changed_at && r.timezone==='America/New_York'));
    for (const verb of ["update reserve_internal.practitioner_schedule_revisions set revision=revision where false",
      "delete from reserve_internal.practitioner_schedule_revisions where false","truncate reserve_internal.practitioner_schedule_revisions"]) {
      assert.throws(()=>sql('begin; '+verb+'; rollback;'));
    }
    assert.equal(sql("select relrowsecurity from pg_class where oid='reserve_internal.practitioner_schedule_revisions'::regclass"),'t');
    assert.equal(sql("select has_table_privilege('authenticated','reserve_internal.practitioner_schedule_revisions','select,insert,update,delete')"),'f');
  });
  await test('two synthetic tenants, unrelated users and own-only staff cannot read or write',async () => {
    for (const [token,args] of [[outsideToken,key],[staffToken,key],[ownerToken,{target,practitioner:other.practitioner}],
      [ownerToken,{target:other.target,practitioner}]]) {
      await denied(await read(token,args)); await denied(await read(token,{...args,on_date:'2026-11-23'}));
      await denied(await save(token,3,week,args));
    }
    await assert.rejects(day('2026-11-23',staffToken));
  });
  await test('Reception can read all schedules but cannot save one',async () => {
    const role = '10000000-0000-4000-8000-000000000003';
    sql(`begin isolation level serializable; insert into reserve.membership_roles(membership_id,role_id) values ('${staffMember}','${role}'); commit;`);
    assert.deepEqual(await ok(await read(staffToken)),await ok(await read(ownerToken)));
    await denied(await save(staffToken,3));
    sql(`begin isolation level serializable; delete from reserve.membership_roles where membership_id='${staffMember}' and role_id='${role}'; commit;`);
  });
  await test('inactive practitioners have no effective read or edit surface',async () => {
    await ok(await rpc(outsideToken,'save_tenant_staff',{target:other.target,staff:other.practitioner,expected:1,
      attributes:{name:'Synthetic practitioner',public_display_name:null,biography:null,status:'INACTIVE',public_visible:false,
        online_bookable:false,no_preference_eligible:false,sort_order:0}}));
    const inactive = {target:other.target,practitioner:other.practitioner};
    await denied(await read(outsideToken,inactive));
    await denied(await read(outsideToken,{...inactive,on_date:'2026-11-23'}));
    await denied(await save(outsideToken,0,week,inactive));
  });
  await test('membership suspension takes effect before the token expires', async () => {
    sql(`begin isolation level serializable; update reserve.memberships set status='SUSPENDED' where id='${adminMember}'; commit;`);
    await denied(await read(adminToken)); await denied(await save(adminToken,3));
    sql(`begin isolation level serializable; update reserve.memberships set status='ACTIVE' where id='${adminMember}'; commit;`);
    assert.equal((await ok(await read(adminToken))).revision,3);
  });
  await test('Website and sibling-client sessions of the same owner cannot access the schedule',async () => {
    const sibling = await authorize(await registerClient(),owner.token);
    for(const token of [sibling,owner.token]) {await denied(await read(token)); await denied(await save(token,3));}
  });
  await test('revoked sessions and withdrawn OAuth consent deny existing tokens',async () => {
    const logout = await request('/auth/v1/logout?scope=local',{method:'POST',headers:{Authorization:'Bearer '+adminToken}});
    assert.ok(logout.ok); await denied(await read(adminToken)); await denied(await save(adminToken,3));
    const revoked = await request('/auth/v1/user/oauth/grants?client_id='+client.client_id,
      {method:'DELETE',headers:{Authorization:'Bearer '+owner.token}});
    assert.equal(revoked.status,204); await denied(await read(ownerToken)); await denied(await save(ownerToken,3));
    assert.equal(count(),3);
  });
} finally {
  sql("create or replace function reserve_internal.schedule_client_approved(client uuid) returns boolean language sql stable security invoker set search_path='' as $$select false$$");
}
