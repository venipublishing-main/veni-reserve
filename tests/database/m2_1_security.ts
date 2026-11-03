// Real local Auth, PostgREST and the built Worker. Never print session tokens or raw provider errors.
import { execFileSync } from "node:child_process";
import { randomUUID } from "node:crypto";
import { createRequire } from "node:module";
import { readFileSync } from "node:fs";
import { dirname,join } from "node:path";
import process from "node:process";
import { setTimeout as delay } from "node:timers/promises";
import console from "node:console";
import { createTestHarness } from "wrangler";
import { object, sql } from "./security-local.mjs";
import { connection } from "./m1_1b_concurrency.mjs";
import { issueNegativeToken } from "./settings-token-controls.ts";

type Actor={id:string;token:string};
type Context={identity:(anonymous?:boolean)=>Promise<Actor>;publishableKey:string;
  api:(path:string,token?:string,method?:string,body?:object,headers?:Record<string,string>)=>Promise<Response>};
const salon = {display_name:"Example Salon A",timezone:"America/Toronto",default_locale:"en-CA",default_currency:"CAD",
  terminology:{staff_member:{singular:"Stylist",plural:"Stylists"}}};
const vision = {display_name:"Example Vision B",timezone:"Africa/Johannesburg",default_locale:"af-ZA",default_currency:"ZAR",
  terminology:{staff_member:{singular:"Optometrist",plural:"Optometrists"}}};
type Profile=Omit<typeof salon,"terminology"> & {terminology:{staff_member?:{singular:string;plural:string}}};
const require=createRequire(import.meta.url);
const path="/rest/v1/rpc/";
const fn="tenant_business_settings";
const system=(n:number)=>"10000000-0000-4000-8000-00000000000"+n;
const mutate=(s:string)=>sql("begin isolation level serializable; "+s+"; commit;");
function argumentsFor(target:string,r:number,p:Profile) {
  const {terminology,...fields}=p;
  return {target,expected_revision:r,...fields,staff_member_singular:terminology.staff_member?.singular??null,
    staff_member_plural:terminology.staff_member?.plural??null};
}
function equal(a:unknown,b:unknown):boolean {
  if(a===b)return true;
  if(!a||!b||typeof a!=="object"||typeof b!=="object")return false;
  return Object.keys(a).length===Object.keys(b).length && Object.entries(a).every(([k,v])=>Object.hasOwn(b,k)&&equal(v,(b as Record<string,unknown>)[k]));
}

export async function settingsProof({api,identity,publishableKey}:Context, preflightOnly=false){
  let checks=0;
  function check(ok:unknown,label:string){if(!ok){console.error("M2.1 FAIL: "+label);throw new Error("Local settings assertion failed");} checks++;}
  if(process.env.CLOUDFLARE_ENV || !/^sb_publishable_/.test(publishableKey))throw new Error("Local DEV bindings required");
  const bin=join(dirname(require.resolve("@react-router/dev/package.json")),"bin.cjs");
  execFileSync(process.execPath,[bin,"build"],{stdio:"pipe",timeout:120000});
  const config=JSON.parse(readFileSync("build/server/wrangler.json","utf8"));
  if(config.name!=="vf-reserve-dev"||config.vars.VENI_ENV!=="dev"||config.vars.SUPABASE_URL) throw new Error("Unexpected build target");
  const server=createTestHarness({workers:[{configPath:"build/server/wrangler.json",
    vars:{SUPABASE_URL:"http://127.0.0.1:54321",SUPABASE_PUBLISHABLE_KEY:publishableKey}}]});
  try{
    await server.listen();
    const worker=server.getWorker(config.name);
    const a=await identity(),b=await identity(),admin=await identity(),staff=await identity(),reception=await identity(),
      zero=await identity(),none=await identity(),custom=await identity(),anon=await identity(true);
    const ta=randomUUID(),tb=randomUUID(),raceTenant=randomUUID(),role=randomUUID();
    const members=new Map<string,string>();
    for(const u of [a,b,admin,staff,reception,zero,custom,anon]) members.set(u.id,randomUUID());
    const mid=(u:Actor)=>members.get(u.id)!;
    const ra=randomUUID(),rb=randomUUID();
    mutate(`insert into public.users(id) values ${[a,b,admin,staff,reception,zero,none,custom,anon].map(u=>"('"+u.id+"')").join(",")};
      insert into public.tenants(id,status) values ('${ta}','SETUP'),('${tb}','ACTIVE'),('${raceTenant}','ACTIVE');
      insert into public.memberships(id,tenant_id,user_id,status) values
      ${[a,b,admin,staff,reception,zero,custom,anon].map(u=>`('${mid(u)}','${u===b?tb:ta}','${u.id}','ACTIVE')`).join(",")},
      ('${ra}','${raceTenant}','${a.id}','ACTIVE'),('${rb}','${raceTenant}','${admin.id}','ACTIVE');
      insert into public.roles(id,kind,tenant_id,code,display_name) values ('${role}','CUSTOM','${ta}','settings_ops','Settings operator');
      insert into public.role_permissions(role_id,permission_code) values ('${role}','tenant.settings_manage');
      insert into public.membership_roles(membership_id,role_id) values
      ${[[mid(a),system(1)],[mid(b),system(1)],[mid(admin),system(2)],[mid(staff),system(4)],[mid(reception),system(3)],[mid(custom),role],[mid(anon),system(2)],[ra,system(1)],[rb,system(2)]].map(([m,r])=>`('${m}','${r}')`).join(",")}`);
    const url=(target:string)=>"http://localhost/api/tenants/"+target+"/business-settings";
    const headers=(u:Actor)=>({Authorization:"Bearer "+u.token,"Content-Type":"application/json"});
    const read=(u:Actor,t:string)=>worker.fetch(url(t),{headers:headers(u)});
    const put=(u:Actor,t:string,r:number,p:Profile)=>worker.fetch(url(t),{method:"PUT",headers:headers(u),body:JSON.stringify({expected_revision:r,settings:p})});
    const rpc=(u:Actor,t:string,r?:number,p=salon)=>api(path+(r===undefined?"read_":"save_")+fn,u.token,"POST",r===undefined?{target:t}:argumentsFor(t,r,p));
    const state=()=>sql("select jsonb_build_array((select jsonb_agg(to_jsonb(p) order by tenant_id) from private.tenant_business_settings p),(select jsonb_agg(to_jsonb(e) order by tenant_id,revision) from private.tenant_business_settings_changes e))");
    async function exact(res:Response,status:number,data:unknown,label:string){
      check(res.status===status && res.headers.get("cache-control")==="no-store" && equal(await res.json(),data),label+" (HTTP "+res.status+")");
    }
    const unconfigured={state:"unconfigured",revision:0,settings:null};
    const configured=(revision:number,settings:Profile)=>({state:"configured",revision,settings});
    async function deny(u:Actor,target:string,code="tenant_unavailable",status=404){
      const before=state();
      await exact(await read(u,target),status,{error:{code}},"denied Worker read");
      await exact(await put(u,target,0,salon),status,{error:{code}},"denied Worker save");
      for(const rev of [undefined,0]){
        const res=await rpc(u,target,rev);check(res.ok && equal(await res.json(),{error:code}),"denied direct RPC");
      }
      check(state()===before,"denied calls preserve profiles and journals");
    }
    const m1=await api("/rest/v1/tenants?select=id&id=eq."+ta,a.token);
    check(m1.status===200 && equal(await m1.json(),[{id:ta}]),"M1 genuine SETUP Owner read");
    const direct=await rpc(a,ta);
    check(direct.status===200 && equal(await direct.json(),unconfigured),"M2 direct genuine SETUP Owner read (HTTP "+direct.status+")");
    await exact(await read(a,ta),200,unconfigured,"unconfigured Owner A");
    await deny(anon,ta,"unauthorized",403);
    console.log("AR-034 same genuine SETUP Owner bearer: M1 200, direct M2 200/rev0, built Worker 200/rev0; signed anonymous denied");
    if(preflightOnly)return;
    await exact(await read(admin,ta),200,unconfigured,"unconfigured Admin A");
    await exact(await put(a,ta,0,{...salon,default_locale:"EN-ca",default_currency:" cad "}),201,configured(1,salon),"create salon");
    await exact(await put(b,tb,0,vision),201,configured(1,vision),"create optometry");
    for(const [u,t,p] of [[a,ta,salon],[b,tb,vision]] as const){
      await exact(await read(u,t),200,configured(1,p),"read normalized");
      check(equal(await (await rpc(u,t)).json(),configured(1,p)),"direct readback");
    }
    const salon2={...salon,terminology:{}};
    await exact(await put(admin,ta,1,salon2),200,configured(2,salon2),"clear overrides");
    await exact(await put(b,tb,1,vision),200,configured(2,vision),"identical save increments");
    await exact(await read(a,ta),200,configured(2,salon2),"persisted salon revision 2");
    await exact(await read(b,tb),200,configured(2,vision),"persisted optometry revision 2");
    const before=state();
    await exact(await put(a,ta,1,salon),409,{error:{code:"revision_conflict"}},"stale save");
    check(state()===before,"stale preserves state");
    for(const u of [staff,reception,zero,none,b])await deny(u,ta);
    await deny(a,tb);await deny(b,randomUUID());await deny(anon,ta,"unauthorized",403);
    await exact(await worker.fetch(url(ta)),401,{error:{code:"unauthenticated"}},"missing bearer");
    check((await api(path+"read_"+fn,undefined,"POST",{target:ta})).status===401,"direct unauthenticated");
    const forged={...a,token:a.token.slice(0,a.token.lastIndexOf(".")+1)+"forged"};
    await exact(await read(forged,ta),401,{error:{code:"unauthenticated"}},"invalid signature");
    check((await rpc(forged,ta)).status===401,"direct invalid signature");
    const short=await issueNegativeToken("expired"), foreign=await issueNegativeToken("foreign");
    await exact(await read({...a,token:foreign.token},ta),401,{error:{code:"unauthenticated"}},"different local issuer and key");
    check((await rpc({...a,token:foreign.token},ta)).status===401,"direct foreign issuer denied");
    mutate(`update public.tenants set status='ACTIVE' where id='${ta}'`);
    await exact(await read(a,ta),200,configured(2,salon2),"Owner active tenant");
    await exact(await read(admin,ta),200,configured(2,salon2),"Admin active tenant");
    const literal={...salon,display_name:"Salon'); select pg_catalog.lo_from_bytea(0, 'x'); --"};
    const largeObjects=sql("select count(*) from pg_catalog.pg_largeobject_metadata");
    await exact(await put(a,ta,2,literal),200,configured(3,literal),"ACTIVE Owner save treats SQL-looking text as data");
    check(sql("select count(*) from pg_catalog.pg_largeobject_metadata")===largeObjects,"no large object side effect");
    check(equal(await(await rpc(admin,ta,3)).json(),configured(4,salon)),"ACTIVE Admin direct save");
    check(equal(await(await rpc(custom,ta,4)).json(),configured(5,salon)),"custom capability save");
    await deny(custom,tb);
    mutate(`insert into public.membership_roles values ('${mid(custom)}','${system(2)}')`);
    mutate(`delete from public.role_permissions where role_id='${role}' and permission_code='tenant.settings_manage'`);
    await exact(await read(custom,ta),200,configured(5,salon),"multi-role retains another mapping");
    mutate(`delete from public.membership_roles where membership_id='${mid(custom)}' and role_id='${system(2)}'`);
    await deny(custom,ta);
    for(const status of ["SUSPENDED","REVOKED"]){
      mutate(`update public.memberships set status='${status}' where id='${mid(admin)}'`);await deny(admin,ta);
    }
    for(const status of ["SUSPENDED","ARCHIVED"]){
      mutate(`update public.tenants set status='${status}' where id='${ta}'`);await deny(a,ta);
    }
    const guarded=state();
    for (const [body,media,status,code] of [
      ['{"expected_revision":2,"settings":{"terminology":{"staff_member":{"plural":"A","plural":"B"}}}}',"application/json",400,"malformed_request"],
      ["{","application/json",400,"malformed_request"],
      ["{}","text/plain",415,"unsupported_media_type"],
      [" ".repeat(8193),"application/json",413,"body_too_large"],
      [JSON.stringify({expected_revision:2,settings:{...vision,actor_user_id:a.id}}),"application/json",422,"invalid_input"],
      [JSON.stringify({expected_revision:2,settings:{...vision,terminology:{customer:"Client"}}}),"application/json",422,"invalid_input"],
    ] as const) {
      await exact(await worker.fetch(url(tb),{method:"PUT",headers:{...headers(b),"Content-Type":media},body}),
        status,{error:{code}},"runtime request boundary");
    }
    async function* oversizedBody(){
      yield new Uint8Array(4096);
      yield new Uint8Array(4097);
    }
    await exact(await worker.fetch(url(tb),{method:"PUT",headers:headers(b),body:oversizedBody(),duplex:"half"}),
      413,{error:{code:"body_too_large"}},"streamed oversized body without Content-Length");
    const method=await worker.fetch(url(tb),{method:"OPTIONS",headers:headers(b)});
    check(method.headers.get("Allow")==="GET, PUT","method allowlist");
    await exact(method,405,{error:{code:"method_not_allowed"}},"unsupported runtime verb");
    for(const [field,invalid] of Object.entries({
      display_name:["","  ","x".repeat(121),"a\u202eb","\u00a0x","{x}",123],
      timezone:["US/Eastern","america/Toronto","+02:00","EST"],default_locale:["zz-ZZ","en_CA","en-Latn","und"],
      default_currency:["XXX","ZZZ","123"],staff_member_singular:["",null,"x".repeat(41)],expected_revision:["2",-1,2.1]
    })){
      for(const value of invalid){
        const flat={...argumentsFor(tb,2,vision),[field]:value};
        const response=await api(path+"save_"+fn,b.token,"POST",flat);
        const reply=await response.json();
        check((response.ok && equal(reply,{error:"invalid_input"})) ||
          (response.status===400 && ["23514","22P02","22003"].includes(String(object(reply).code))),"direct validation "+field+" / "+response.status);
        const body={expected_revision:field==="expected_revision"?value:2,settings:
          field==="staff_member_singular"?{...vision,terminology:{staff_member:{singular:value,plural:"Plural"}}}:
          field==="expected_revision"?vision:{...vision,[field]:value}};
        await exact(await worker.fetch(url(tb),{method:"PUT",headers:headers(b),body:JSON.stringify(body)}),
          422,{error:{code:"invalid_input"}},"Worker validation "+field);
      }
    }
    check(state()===guarded,"shared invalid corpus leaves no mutation");
    const fakeHeaders={"request.jwt.claims":JSON.stringify({sub:b.id,role:"authenticated",is_anonymous:false})};
    const spoof=await api(path+"read_"+fn,none.token,"POST",{target:tb},fakeHeaders);
    check(spoof.ok && equal(await spoof.json(),{error:"tenant_unavailable"}),"client header cannot set identity");
    check((await api(path+"set_config",none.token,"POST",{})).status===404,"no request-context setter");
    for(const table of ["tenant_business_settings","tenant_business_settings_changes","settings_reference"]){
      for(const method of ["GET","POST","PATCH","DELETE"]){
        const res=await api("/rest/v1/"+table,b.token,method,method==="POST"||method==="PATCH"?{}:undefined);
        check(res.status===404,"raw table hidden");
      }
      const res=await api("/rest/v1/"+table,b.token,"GET",undefined,{"Accept-Profile":"private"});check(res.status===406,"private schema denied");
    }
    for(const [operation,args] of [["read_",{target:tb}],["save_",argumentsFor(tb,2,vision)]] as const){
      check((await api(path+operation+fn,b.token,"POST",args,{"Content-Profile":"private"})).status===406,
        "direct private "+operation+"RPC denied");
    }
    check((await api(path+"save_"+fn,b.token,"POST",{...argumentsFor(tb,2,vision),actor_user_id:a.id})).status===404,"RPC spoofed argument denied");
    const schema=await api("/graphql/v1",b.token,"POST",{query:"{ __schema { types { name fields { name } } } }"});
    const introspection=object(await schema.json());
    if(introspection.data) {
      check(schema.ok && !/tenant_business_settings_changes|settings_reference|tenant_?business_?settings_?collection|lo_from_bytea/i.test(JSON.stringify(introspection.data)),"GraphQL raw and ambient surfaces absent");
    } else {
      check(sql("select count(*) from pg_extension where extname='pg_graphql'")==="0" &&
        JSON.stringify(introspection.errors).includes("pg_graphql extension is not enabled"),"confirmed disabled GraphQL runtime");
    }
    for(const field of ["tenantBusinessSettingsCollection","tenantBusinessSettingsChangesCollection","settingsReferenceCollection","readTenantBusinessSettings","saveTenantBusinessSettings"]){
      const probe=await api("/graphql/v1",b.token,"POST",{query:"{ "+field+" { edges { node { __typename } } } }"});
      const body=object(await probe.json());
      check(!body.data && Array.isArray(body.errors) && body.errors.length>0,"GraphQL raw field denied");
    }
    for(const op of ["lo_from_bytea","lo_put","settings_text"]){
      check((await api(path+op,b.token,"POST",{})).status===404,"no provider/helper dispatch");
    }
    check(state()===guarded,"raw and spoof probes preserve state");
    // Deliberate journal failure in this disposable stack. The Worker must report
    // dependency failure without a partial profile update or leaking the constraint.
    sql("alter table private.tenant_business_settings_changes add constraint m21_fault check(false) not valid");
    try {
      await exact(await put(b,tb,2,vision),503,{error:{code:"dependency_unavailable"}},"journal failure fails closed");
      const directFailure=await rpc(b,tb,2,vision);
      check(directFailure.ok && equal(await directFailure.json(),{error:"dependency_unavailable"}),"direct journal failure sanitized");
    }
    finally {sql("alter table private.tenant_business_settings_changes drop constraint m21_fault");}
    check(state()===guarded,"forced journal failure rolls back profile and event");
    check(sql(`select count(*) from private.tenant_business_settings_changes where tenant_id='${ta}' and revision=2 and actor_user_id='${admin.id}' and actor_membership_id='${mid(admin)}'`)==="1","verified caller attribution");
    const catalog=JSON.parse(readFileSync("app/lib/settings-catalogue.json","utf8"));
    for(const kind of ["zone","language","region","currency"]){
      check(sql(`select string_agg(code,' ' order by code collate "C") from private.settings_reference where kind='${kind}'`)===catalog[kind],"complete "+kind+" parity");
    }
    // A third connection holds a table lock until two genuine PostgREST
    // transactions are waiting for write access. Never simulate caller claims.
    const barrier=connection();
    try {
      for(const r of [0,1]) {
        const lock=await barrier.command("begin; lock table private.tenant_business_settings in share mode;");
        check(lock.state==="00000","race barrier acquired");
        const responses=Promise.all([rpc(a,raceTenant,r,salon),rpc(admin,raceTenant,r,vision)]);
        let waiting=0;
        try {
          for(let n=0;n<40 && waiting<2;n++){
            await delay(50);
            waiting=Number(sql("select count(distinct pid) from pg_locks where relation='private.tenant_business_settings'::regclass and mode='RowExclusiveLock' and not granted"));
          }
        } finally {await barrier.command("rollback;");}
        const results=await Promise.all((await responses).map(async res=>({status:res.status,data:await res.json()})));
        check(waiting===2,"two independent genuine request backends contended");
        const winner=results.findIndex(x=>object(x.data).state==="configured");
        check(winner>=0 && results[winner].status===200 && equal(results[winner].data,configured(r+1,winner===0?salon:vision)),"one normalized winning revision");
        check(equal(results[1-winner].data,{error:"revision_conflict"}),"other request conflicts");
        const actor=winner===0?a:admin, membership=winner===0?ra:rb;
        check(sql(`select count(*) from private.tenant_business_settings_changes where tenant_id='${raceTenant}'`)===String(r+1),"exact total event count after race");
        check(sql(`select count(*) from private.tenant_business_settings_changes e join private.tenant_business_settings p using(tenant_id,revision)
          where e.tenant_id='${raceTenant}' and revision=${r+1} and actor_user_id='${actor.id}' and actor_membership_id='${membership}'
            and p.updated_at=e.occurred_at`)==="1","winning actor, membership, revision and timestamp match");
      }
    } finally {barrier.close();}
    // PostgREST allows a bounded clock-skew window. A real short-lived Auth
    // token must eventually be rejected by the provider rather than by a mock.
    await delay(Math.max(0,(short.expires+33)*1000-Date.now()));
    await exact(await read({...a,token:short.token},tb),401,{error:{code:"unauthenticated"}},"expired signed local token");
    check((await rpc({...a,token:short.token},tb)).status===401,"direct expired token denied");
    console.log("M2.1 genuine Auth, Worker, RPC, database and two-session race assertions: "+checks+" PASS");
  } finally {await server.close();}
}
