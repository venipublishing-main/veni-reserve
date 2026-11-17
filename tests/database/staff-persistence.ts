// Genuine local GoTrue + PostgREST proof; synthetic identities and data only.
import { randomUUID } from "node:crypto";
import console from "node:console";
import { object,sql } from "./security-local.mjs";

type Actor={id:string;token:string};
type Context={identity:(anonymous?:boolean)=>Promise<Actor>;
  api:(path:string,token?:string,method?:string,body?:object,headers?:Record<string,string>)=>Promise<Response>};
const receptionist="10000000-0000-4000-8000-000000000003";
const staff={
  name:"Dr Fictional Staff",public_display_name:"Dr F",biography:"Synthetic professional profile",
  status:"ACTIVE",public_visible:false,online_bookable:true,
  no_preference_eligible:true,sort_order:0,
};
const service={name:"Synthetic eye test",description:null,category:null,
  duration_minutes:45,price_minor_units:45000,currency_override:"ZAR",price_display:"AMOUNT",
  buffer_before_minutes:5,buffer_after_minutes:10,min_notice_minutes:null,max_advance_days:null,
  public_visible:true,online_bookable:true,sort_order:0,status:"ACTIVE"};
const location={name:"Fictional Branch",kind:"PHYSICAL",description:null,
  timezone_override:null,public_visible:true,sort_order:0,status:"ACTIVE"};
const link=(kind:string,member:string|null,offering:string|null,branch:string|null)=>({
  kind,staff_id:member,service_id:offering,location_id:branch,enabled:true,
  duration_override_minutes:null,price_override_minor_units:null,
  buffer_before_override_minutes:null,buffer_after_override_minutes:null,
  online_bookable_override:null,
});
export async function staffProof({identity,api}:Context){
  let assertions=0,phase="creating genuine synthetic Staff Auth identities";
  const check=(value:unknown,label:string)=>{
    if(!value){console.error("Staff/eligibility FAIL: "+label);throw new Error("Staff security failed");}
    assertions++;
  };
  try{
    const owner=await identity(),foreign=await identity(),reader=await identity(),
      outsider=await identity(),anonymous=await identity(true);
    const rpc=async(name:string,actor:Actor,body:object={})=>{
      const response=await api("/rest/v1/rpc/"+name,actor.token,"POST",body);
      return {status:response.status,data:object(await response.json())};
    };
    const bootstrap=async(actor:Actor)=>{
      const result=await rpc("bootstrap_setup_tenant",actor,{request_key:randomUUID()});
      check(result.status===200&&typeof result.data.tenant_id==="string","Owner bootstrap");
      return String(result.data.tenant_id);
    };
    const ta=await bootstrap(owner),tb=await bootstrap(foreign),membership=randomUUID();
    sql("begin isolation level serializable;insert into public.users(id) values('"+reader.id+
      "');insert into public.memberships(id,tenant_id,user_id,status) values('"+membership+
      "','"+ta+"','"+reader.id+"','ACTIVE');insert into public.membership_roles(membership_id,role_id) values('"+
      membership+"','"+receptionist+"');commit;");
    const listStaff=(actor:Actor,target=ta)=>rpc("list_tenant_staff",actor,{target});
    const listLinks=(actor:Actor,target=ta)=>rpc("list_tenant_eligibility",actor,{target});
    const saveStaff=(actor:Actor,target:string,id:string|null,expected:number,attributes:object)=>
      rpc("save_tenant_staff",actor,{target,staff:id,expected,attributes});
    const saveLink=(actor:Actor,target:string,id:string|null,expected:number,attributes:object)=>
      rpc("save_tenant_eligibility",actor,{target,link:id,expected,attributes});
    phase="creating Service, Location and independent Staff identity";
    check(((await listStaff(owner)).data.staff as unknown[]).length===0,"Fresh Tenant has no Staff");
    check(((await listLinks(owner)).data.eligibility as unknown[]).length===0,"Fresh Tenant has no eligibility");
    const locationR=await rpc("save_tenant_location",owner,
      {target:ta,location:null,expected:0,attributes:location});
    const serviceR=await rpc("save_tenant_service",owner,
      {target:ta,service:null,expected:0,attributes:service});
    const branch=String(locationR.data.location_id),offering=String(serviceR.data.service_id);
    check(locationR.data.revision===1&&serviceR.data.revision===1,
      "Location and Service exist as tenant-owned independent prerequisites");
    const created=await saveStaff(owner,ta,null,0,staff),member=String(created.data.staff_id);
    check(created.status===200&&created.data.revision===1&&/^[0-9a-f-]{36}$/.test(member),
      "Staff created without account invitation");
    check(((await listStaff(reader)).data.staff as unknown[]).length===1,
      "Reception staff.read permits roster without login authority");
    const view=object((created.data.staff as unknown[])[0]);
    check(view.public_visible===false&&view.online_bookable===true&&view.no_preference_eligible===true,
      "Public profile, online participant and automatic No Preference state remain independent");
    check(sql("select count(*) from public.memberships where tenant_id='"+ta+"'")==="2",
      "Creating Staff did not create an account or Membership");
    for(const actor of [reader,outsider,anonymous,foreign]){
      const result=await saveStaff(actor,ta,null,0,staff);
      check(["tenant_unavailable","unauthorized"].includes(String(result.data.error)),
        "Only Staff managers create Staff records");
    }
    check((await listStaff(foreign,ta)).data.error==="tenant_unavailable",
      "Foreign Tenant cannot list Staff");
    check((await listStaff(owner,tb)).data.error==="tenant_unavailable",
      "Owner cannot pivot to another Tenant");
    for(const bad of [
      {...staff,tenant_id:ta},{...staff,name:"<script>"},{...staff,status:"ARCHIVED"},
      {...staff,sort_order:10000},{...staff,no_preference_eligible:"true"},
      {...staff,biography:"Bad\u202e"},
    ])check((await saveStaff(owner,ta,null,0,bad)).data.error==="invalid_input",
      "Malformed Staff input fails closed");
    phase="three explicit relationship types and cross-tenant prevention";
    const ss=link("STAFF_SERVICE",member,offering,null),sl=link("STAFF_LOCATION",member,null,branch),
      vl=link("SERVICE_LOCATION",null,offering,branch);
    const createdLinks=[];
    for(const attrs of [ss,sl,vl]){
      const result=await saveLink(owner,ta,null,0,attrs);
      check(result.status===200&&result.data.revision===1&&typeof result.data.eligibility_id==="string",
        "Explicit relationship creation");
      createdLinks.push(String(result.data.eligibility_id));
    }
    const [ssId,slId,vlId]=createdLinks;
    check(((await listLinks(owner)).data.eligibility as unknown[]).length===3,
      "All three persisted tenant-scoped eligibility pairs visible");
    check(((await listLinks(reader)).data.eligibility as unknown[]).length===3,
      "Reception read-only eligibility projection");
    check((await saveLink(owner,ta,null,0,ss)).data.error==="relation_exists",
      "Cannot duplicate the same M:N relation");
    check((await saveLink(reader,ta,null,0,ss)).data.error==="tenant_unavailable",
      "Reception cannot mutate eligibility");
    check((await listLinks(foreign,ta)).data.error==="tenant_unavailable",
      "Foreign Tenant cannot read eligibility");
    for(const bad of [
      {...ss,kind:"UNKNOWN"},{...ss,location_id:branch},
      {...ss,staff_id:"not-uuid"},{...sl,duration_override_minutes:60},
      {...vl,online_bookable_override:false},{...ss,price_override_minor_units:1.5},
      {...ss,enabled:"true"},{...ss,duration_override_minutes:0},
    ])check((await saveLink(owner,ta,null,0,bad)).data.error==="invalid_input",
      "Malformed relationship shape or overrides denied");
    const cross=await saveLink(foreign,tb,null,0,ss);
    check(cross.data.error==="relation_unavailable",
      "Composite endpoint FKs deny creating a foreign Tenant eligibility pair");
    check((await saveLink(foreign,tb,ssId,1,ss)).data.error==="relation_unavailable",
      "Foreign Tenant cannot alter existing relationship by guessed UUID");
    phase="per-attribute overrides, optimistic edits and immutable audit history";
    const override={...ss,duration_override_minutes:60,price_override_minor_units:60000,
      buffer_after_override_minutes:15,online_bookable_override:false};
    const updated=await saveLink(owner,ta,ssId,1,override);
    check(updated.data.revision===2&&Array.isArray(updated.data.eligibility),
      "Staff-specific Service override advances only link revision");
    check(sql("select duration_minutes from private.services where id='"+offering+"'")==="45",
      "Staff override does not change Service duration");
    check(sql("select price_minor_units from private.services where id='"+offering+"'")==="45000",
      "Staff override does not change Service price");
    check((await saveLink(owner,ta,ssId,1,ss)).data.error==="revision_conflict",
      "Stale eligibility revision fails closed");
    const races=await Promise.all([
      saveLink(owner,ta,ssId,2,{...override,price_override_minor_units:61000}),
      saveLink(owner,ta,ssId,2,{...override,price_override_minor_units:62000}),
    ]);
    check(races.filter(x=>x.data.revision===3).length===1&&
      races.filter(x=>x.data.error==="revision_conflict").length===1,
      "Concurrent link edits commit exactly one revision");
    check(sql("select revision from private.eligibility_links where id='"+ssId+"'")==="3"&&
      sql("select count(*) from private.eligibility_events where eligibility_id='"+ssId+"'")==="3",
      "Three durable link events match three committed revisions");
    check((await saveLink(owner,ta,slId,1,{...sl,enabled:false})).data.revision===2,
      "Disabling link preserves identity and original endpoints");
    check(sql("select count(*) from private.eligibility_links where id='"+slId+"' and not enabled")==="1",
      "Disabled relationship remains persisted");
    check((await saveLink(owner,ta,vlId,1,{...vl,enabled:false})).data.revision===2,
      "Service–Location link may be disabled independently");
    sql("alter table private.eligibility_events add constraint eligibility_event_fault check(false) not valid");
    try{
      check((await saveLink(owner,ta,ssId,3,override)).data.error==="dependency_unavailable",
        "Journal failure gives redacted dependency error");
    }finally{sql("alter table private.eligibility_events drop constraint eligibility_event_fault");}
    check(sql("select revision from private.eligibility_links where id='"+ssId+"'")==="3"&&
      sql("select count(*) from private.eligibility_events where eligibility_id='"+ssId+"'")==="3",
      "Eligibility update rolled back when journal insert failed");
    const next=await saveStaff(owner,ta,member,1,{...staff,public_visible:true,biography:"Revised fake profile"});
    check(next.data.revision===2,"Staff profile CAS update");
    check((await saveStaff(owner,ta,member,1,staff)).data.error==="revision_conflict",
      "Stale Staff update rejected");
    sql("alter table private.staff_events add constraint staff_event_fault check(false) not valid");
    try{
      check((await saveStaff(owner,ta,member,2,staff)).data.error==="dependency_unavailable",
        "Staff journal failure returns redacted error");
    }finally{sql("alter table private.staff_events drop constraint staff_event_fault");}
    check(sql("select revision from private.staff_members where id='"+member+"'")==="2",
      "Failed Staff journal causes atomic profile rollback");
    check((await saveStaff(owner,ta,member,2,{...staff,status:"ARCHIVED"})).data.revision===3,
      "Archive Staff identity without deleting historical eligibility");
    check((await saveStaff(owner,ta,member,3,staff)).data.error==="staff_unavailable",
      "Archived Staff cannot silently reactivate");
    check(sql("select count(*) from private.eligibility_links where staff_id='"+member+"'")==="2",
      "Archived Staff keeps historical Staff–Service and Staff–Location links");
    let journalImmutable=false;
    try{sql("delete from private.eligibility_events where eligibility_id='"+ssId+"'");}
    catch{journalImmutable=true;}
    check(journalImmutable,"Privileged deletion of eligibility history rejected");
    for(const table of ["staff_members","staff_events","eligibility_links","eligibility_events"]){
      check((await api("/rest/v1/"+table,owner.token)).status===404,
        "Private operational table has no public REST path");
      check((await api("/rest/v1/"+table,owner.token,"GET",undefined,{"Accept-Profile":"private"})).status===406,
        "Private schema cannot be selected via Data API");
    }
    phase="revocation, logout and canonical cleanup";
    sql("begin isolation level serializable;update public.memberships set status='REVOKED' where id='"+
      membership+"';commit;");
    check((await listStaff(reader)).data.error==="tenant_unavailable",
      "Revoked Reception immediately loses Staff read");
    check((await listLinks(reader)).data.error==="tenant_unavailable",
      "Revoked Reception immediately loses eligibility read");
    check((await api("/auth/v1/logout?scope=local",owner.token,"POST")).ok,"Genuine Auth logout succeeds");
    check((await listStaff(owner)).data.error==="unauthorized",
      "Logged-out token cannot access Staff");
    check((await saveLink(owner,ta,ssId,3,override)).data.error==="unauthorized",
      "Logged-out token cannot update eligibility");
    console.log("Staff identity/eligibility/Auth/tenant/override/journal/CSRF-compatible proof: "+
      assertions+" PASS");
  }catch(error){console.error("Staff proof stopped during "+phase+" (details redacted)");throw error;}
}
