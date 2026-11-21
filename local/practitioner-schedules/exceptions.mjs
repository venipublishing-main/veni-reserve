import assert from 'node:assert/strict';
import { randomUUID } from 'node:crypto';
import { test } from 'node:test';
import { readAvailabilityDay } from '../../app/lib/practitioner-schedule.server.ts';
import { authorize, createBusiness, createPractitioner, newUser, ok, registerClient, request, rpc, sql, uuid } from './fixture.mjs';

const client = await registerClient();
const owner = await newUser(), ownerToken = await authorize(client,owner.token);
const {target,practitioner,member} = await createBusiness(ownerToken,'Africa/Johannesburg');
const second = await createPractitioner(ownerToken,target,'Second practitioner');
const outsider = await newUser(), outsiderToken = await authorize(client,outsider.token);
const other = await createBusiness(outsiderToken);
async function assign(role) {
  const user = await newUser(), membership = randomUUID();
  sql(`begin isolation level serializable; insert into reserve.users(id) values ('${user.id}');
    insert into reserve.memberships(id,tenant_id,user_id,status) values ('${membership}','${target}','${user.id}','ACTIVE');
    insert into reserve.membership_roles(membership_id,role_id) values ('${membership}','10000000-0000-4000-8000-00000000000${role}'); commit;`);
  return {token:await authorize(client,user.token),id:user.id,membership};
}
const admin = await assign(2), reception = await assign(3), staff = await assign(4);
async function site(token,tenant,name,zone) {
  const result = await ok(await rpc(token,'save_tenant_location',{target:tenant,location:null,expected:0,
    attributes:{name,kind:'PHYSICAL',description:null,timezone_override:zone,public_visible:false,sort_order:0,status:'ACTIVE'}}));
  return uuid(result.location_id);
}
const location = await site(ownerToken,target,'Local office',null);
const ny = await site(ownerToken,target,'New York','America/New_York');
const foreign = await site(outsiderToken,other.target,'Another business',null);
const monday = '2026-11-23';
const key = {target,practitioner,location,on_date:monday};
const rules = {durationMinutes:10,bufferBeforeMinutes:0,bufferAfterMinutes:0,interval:20,earliest:0,occupied:[]};
const raw = (token,args=key) => rpc(token,'read_availability_day',args);
const day = (args=key,token=ownerToken) => readAvailabilityDay(q=>raw(token,q),args,rules);
const entry = (overrides={}) => ({target,entry:randomUUID(),practitioner,location:null,on_date:monday,
  expected:0,opens:null,closes:null,cancel:false,...overrides});
const save = (args,token=ownerToken) => rpc(token,'save_dated_exception',args);
const closure = (loc,date,values={}) => entry({practitioner:null,location:loc,on_date:date,...values});
const cancel = (args,expected=1) => save({...args,expected,opens:null,closes:null,cancel:true});
const denied = async result => { assert.equal(result.status,403); assert.equal((await result.json()).code,'42501'); };
const authorizedClient = uuid(client.client_id);
try {
  await test('empty approved-client predicate denies exception writes and combined reads',async()=>{
    await denied(await raw(ownerToken)); await denied(await save(entry()));
  });
  sql(`create or replace function reserve_internal.schedule_client_approved(client uuid) returns boolean
    language sql stable security invoker set search_path='' as $$select client='${authorizedClient}'::uuid$$`);
  const week = Array.from({length:7},()=>[{opens:0,closes:1440}]);
  week[1]=[{opens:540,closes:720}];
  for (const person of [practitioner,second]) await ok(await rpc(ownerToken,'save_practitioner_schedule',
    {target,practitioner:person,expected:0,week}));

  const partial = entry({opens:590,closes:650});
  await test('explicit absence preserves the 09:00 anchor and half-open boundaries',async()=>{
    assert.equal((await ok(await save(partial))).revision,1);
    const d=await day();
    assert.deepEqual(d.list(),[540,560,580,660,680,700]);
    const buffered = (before,after) => readAvailabilityDay(q=>raw(ownerToken,q),key,{
      ...rules,bufferBeforeMinutes:before,bufferAfterMinutes:after
    });
    assert.equal((await buffered(0,1)).check(580).reason,'practitioner_absent');
    assert.equal((await buffered(11,0)).check(660).reason,'practitioner_absent');
    assert.ok((await buffered(10,0)).check(660).ok);
    assert.equal(d.check(600).reason,'practitioner_absent');
    assert.equal(d.check(650).reason,'off_grid');
    assert.equal((await day({...key,practitioner:second})).check(600).ok,true);
  });

  const full=entry(), duplicate=entry(), room=closure(location,monday);
  await test('independent overlapping exclusions survive cancellation with stable reason precedence',async()=>{
    await ok(await save(full));
    assert.deepEqual((await day()).list(),[]);
    assert.ok((await day({...key,practitioner:second})).check(560).ok);
    await ok(await save(room,admin.token)); await ok(await save(duplicate));
    assert.deepEqual((await day()).list(),[]);
    assert.equal((await day()).check(560).reason,'practitioner_absent');
    assert.equal((await day({...key,practitioner:second})).check(560).reason,'location_closed');
    await ok(await cancel(full)); assert.equal((await day()).check(560).reason,'practitioner_absent');
    await ok(await cancel(duplicate)); assert.equal((await day()).check(560).reason,'location_closed');
    await ok(await cancel(room)); assert.equal((await day()).check(560).ok,true);
    assert.equal((await day()).check(600).reason,'practitioner_absent');
  });
  await test('one concurrent edit wins and superseded ranges cannot reappear',async()=>{
    const requests=[{opens:540,closes:560},{opens:560,closes:580}].map(change=>save({...partial,...change,expected:1}));
    const responses=await Promise.all(requests);
    assert.deepEqual(responses.map(r=>r.status).sort(),[200,409]);
    assert.equal((await save({...partial,expected:1})).status,409);
    assert.equal((await day()).check(600).ok,true);
    assert.equal((await cancel(partial,2)).status,200);
    assert.equal((await save({...partial,expected:3})).status,409);
  });
  await test('a New York closure crosses into the next Johannesburg calendar date',async()=>{
    const evening=closure(ny,'2026-11-24',{opens:1200,closes:1320}); // 01:00–03:00 UTC on Nov 25
    await ok(await save(evening));
    const d=await day({...key,location:ny,on_date:'2026-11-25'});
    assert.equal(d.check(180).reason,'location_closed'); assert.ok(d.check(300).ok);
    assert.ok((await day({...key,location:ny,on_date:'2026-11-24'})).check(180).ok);
    assert.ok((await day({...key,on_date:'2026-11-25'})).check(180).ok);
  });
  for(const [date,hours] of [['2026-03-08',23],['2026-11-01',25]]) {
    await test('all-day New York closure spans '+hours+' real hours on '+date,async()=>{
      const c=closure(ny,date); await ok(await save(c));
      const q={...key,location:ny,on_date:date};
      const rows=(await ok(await raw(ownerToken,q))).exclusions;
      const range=rows.find(r=>r.exception_id===c.entry);
      assert.equal(range.end-range.start,hours*3600000);
      assert.equal((await day(q)).check(720).reason,'location_closed');
      await ok(await cancel(c));
    });
  }
  await test('nonexistent partial endpoint widens to the day and repeated endpoints cover both folds',async()=>{
    const spring=closure(ny,'2026-03-08',{opens:135,closes:180});
    const fall=closure(ny,'2026-11-01',{opens:75,closes:105});
    for (const item of [spring,fall]) await ok(await save(item));
    const result=async item=>(await ok(await raw(ownerToken,{...key,location:ny,on_date:item.on_date}))).exclusions.find(e=>e.exception_id===item.entry);
    const gap=await result(spring), fold=await result(fall);
    assert.equal(gap.end-gap.start,23*3600000);
    assert.equal(fold.start,Date.parse('2026-11-01T05:15:00Z'));
    assert.equal(fold.end,Date.parse('2026-11-01T06:45:00Z'));
  });
  await test('Reception reads only; own-only Staff, foreign subjects, tenants and sibling clients are denied',async()=>{
    await ok(await raw(reception.token)); await denied(await save(entry(),reception.token));
    await denied(await raw(staff.token)); await denied(await save(entry(),staff.token));
    await denied(await raw(outsiderToken)); await denied(await save(entry(),outsiderToken));
    await denied(await raw(ownerToken,{...key,location:foreign}));
    await denied(await raw(ownerToken,{...key,practitioner:other.practitioner}));
    await denied(await save(closure(foreign,monday))); await denied(await save(entry({practitioner:other.practitioner})));
    const sibling=await authorize(await registerClient(),owner.token);
    for (const token of [owner.token,sibling]) {await denied(await raw(token)); await denied(await save(entry(),token));}
  });
  await test('invalid periods and subject changes do not append revisions',async()=>{
    for(const patch of [{opens:30},{opens:0,closes:0},{opens:1400,closes:15},{opens:-1,closes:30},
      {location},{practitioner:null},{cancel:true}]) assert.equal((await save(entry(patch))).status,400);
    const original=entry(); await ok(await save(original));
    assert.equal((await save({...original,practitioner:second,expected:1})).status,400);
    assert.equal((await save({...original,on_date:'2026-11-24',expected:1})).status,400);
    await ok(await cancel(original));
  });
  await test('history is immutable and contains the actual user and tenant membership',()=>{
    const table='reserve_internal.availability_exception_revisions';
    const history=id=>JSON.parse(sql(`select json_agg(e order by revision) from ${table} e where tenant_id='${target}' and exception_id='${uuid(id)}'`));
    const rows=history(partial.entry);
    assert.deepEqual(rows.map(e=>[e.revision,e.cancelled]),[[1,false],[2,false],[3,true]]);
    assert.deepEqual([rows[0].actor_user_id,rows[0].actor_membership_id,rows[0].opens,rows[0].closes],[owner.id,member,590,650]);
    assert.deepEqual([history(room.entry)[0].actor_user_id,history(room.entry)[0].actor_membership_id],[admin.id,admin.membership]);
    assert.equal(sql(`select has_table_privilege('authenticated','${table}','select,insert,update,delete')`),'f');
    for(const op of [`delete from ${table} where false`,`update ${table} set cancelled=true where false`,`truncate ${table}`])
      assert.throws(()=>sql('begin; '+op+'; rollback;'));
  });
  await test('revoked sessions and consent deny both new operations',async()=>{
    assert.ok((await request('/auth/v1/logout?scope=local',{method:'POST',headers:{Authorization:'Bearer '+admin.token}})).ok);
    await denied(await raw(admin.token)); await denied(await save(entry(),admin.token));
    assert.equal((await request('/auth/v1/user/oauth/grants?client_id='+authorizedClient,
      {method:'DELETE',headers:{Authorization:'Bearer '+owner.token}})).status,204);
    await denied(await raw(ownerToken)); await denied(await save(entry()));
  });
} finally {
  sql("create or replace function reserve_internal.schedule_client_approved(client uuid) returns boolean language sql stable security invoker set search_path='' as $$select false$$");
}
