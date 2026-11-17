// Synthetic genuine GoTrue + PostgREST proof. No hosted connection or real customers.
import { randomUUID } from "node:crypto";
import console from "node:console";
import { object,sql } from "./security-local.mjs";

type Actor={id:string;token:string};
type Context={identity:(anonymous?:boolean)=>Promise<Actor>;
  api:(path:string,token?:string,method?:string,body?:object,headers?:Record<string,string>)=>Promise<Response>};
const receptionist="10000000-0000-4000-8000-000000000003";
const service={name:"Fictional consultation",description:"Private synthetic offering",category:"Consultation",
  duration_minutes:45,price_minor_units:45000,currency_override:"ZAR",price_display:"AMOUNT",
  buffer_before_minutes:10,buffer_after_minutes:15,min_notice_minutes:null,max_advance_days:null,
  public_visible:false,online_bookable:false,sort_order:0,status:"ACTIVE"};

export async function serviceProof({identity,api}:Context){
  let assertions=0,phase="creating genuine synthetic Auth users";
  const check=(valid:unknown,label:string)=>{
    if(!valid){console.error("Service security FAIL: "+label);throw new Error("Service proof failed");}
    assertions++;
  };
  try{
    const owner=await identity(),foreign=await identity(),reader=await identity(),
      unaffiliated=await identity(),anonymous=await identity(true);
    const rpc=async (name:string,actor:Actor,body:object={})=>{
      const response=await api("/rest/v1/rpc/"+name,actor.token,"POST",body);
      return{status:response.status,data:object(await response.json())};
    };
    const bootstrap=async (actor:Actor)=>{
      const result=await rpc("bootstrap_setup_tenant",actor,{request_key:randomUUID()});
      check(result.status===200&&typeof result.data.tenant_id==="string","Genuine Auth Owner bootstrap");
      return String(result.data.tenant_id);
    };
    const ta=await bootstrap(owner),tb=await bootstrap(foreign),membership=randomUUID();
    phase="assigning read-only services.read membership";
    sql("begin isolation level serializable; insert into public.users(id) values('"+reader.id+
      "'); insert into public.memberships(id,tenant_id,user_id,status) values('"+membership+
      "','"+ta+"','"+reader.id+"','ACTIVE'); insert into public.membership_roles(membership_id,role_id) values('"+
      membership+"','"+receptionist+"'); commit;");
    const list=(actor:Actor,target=ta)=>rpc("list_tenant_services",actor,{target});
    const save=(actor:Actor,target:string,serviceId:string|null,expected:number,attributes:object)=>
      rpc("save_tenant_service",actor,{target,service:serviceId,expected,attributes});
    const create=(actor:Actor,target:string,attributes:object=service)=>save(actor,target,null,0,attributes);
    phase="creating and reading two tenant-private Services";
    check(Array.isArray((await list(owner)).data.services)&&
      ((await list(owner)).data.services as unknown[]).length===0,"Fresh Tenant has no Services");
    const created=await create(owner,ta),id=String(created.data.service_id);
    check(created.status===200&&/^[0-9a-f-]{36}$/.test(id)&&created.data.revision===1,
      "Owner creates first Service with revision 1");
    const duplicate=await create(owner,ta,{...service,category:"Another category"});
    check(duplicate.data.revision===1&&duplicate.data.service_id!==id,
      "Service names need not be unique across categories; identity is UUID");
    check(((await list(owner)).data.services as unknown[]).length===2,
      "Two persisted Services remain independently identifiable");
    check(((await list(reader)).data.services as unknown[]).length===2,
      "Reception services.read permits catalogue read");
    for(const actor of [reader,unaffiliated,anonymous,foreign]){
      const result=await create(actor,ta);
      check(["tenant_unavailable","unauthorized"].includes(String(result.data.error)),
        "Nonmanager cannot create Services in target Tenant");
    }
    check((await list(foreign,ta)).data.error==="tenant_unavailable",
      "Foreign Owner cannot list another Tenant's Services");
    check((await list(owner,tb)).data.error==="tenant_unavailable",
      "Own Owner cannot request foreign Tenant catalogue");
    check((await save(foreign,tb,id,1,service)).data.error==="service_unavailable",
      "Foreign Service UUID is not writable in another Tenant context");
    check((await save(reader,ta,id,1,service)).data.error==="tenant_unavailable",
      "Reception cannot edit Services");
    for(const bad of [
      {...service,tenant_id:ta},{...service,name:"<script>"},{...service,duration_minutes:0},
      {...service,duration_minutes:"45"},{...service,price_minor_units:1.25},
      {...service,price_display:"AMOUNT",price_minor_units:null},
      {...service,currency_override:"ZZZ"},{...service,buffer_after_minutes:1441},
      {...service,min_notice_minutes:525601},{...service,max_advance_days:0},
      {...service,online_bookable:"true"},{...service,status:"ARCHIVED"},
    ])check((await create(owner,ta,bad)).data.error==="invalid_input",
      "Malformed Service inputs, invalid ISO currencies and reserved states rejected");
    phase="independent publication dimensions and optimistic concurrency";
    const edited={...service,description:"Updated fictional offering",duration_minutes:60,
      public_visible:false,online_bookable:true,price_display:"FROM",price_minor_units:50000,
      min_notice_minutes:120,max_advance_days:180};
    const updated=await save(owner,ta,id,1,edited);
    check(updated.data.revision===2&&Array.isArray(updated.data.services),"Owner edits Service revision 2");
    const stored=object((updated.data.services as unknown[]).find(item=>object(item).service_id===id));
    check(stored.online_bookable===true&&stored.public_visible===false&&stored.price_display==="FROM",
      "Public visibility and online-bookable are independent, and price presentation persists");
    check((await save(owner,ta,id,1,service)).data.error==="revision_conflict","Stale edit rejected");
    const races=await Promise.all([
      save(owner,ta,id,2,{...service,name:"Variant A"}),
      save(owner,ta,id,2,{...service,name:"Variant B"}),
    ]);
    check(races.filter(v=>v.data.revision===3).length===1&&
      races.filter(v=>v.data.error==="revision_conflict").length===1,
      "Concurrent writes advance exactly one revision");
    check(sql("select revision from private.services where id='"+id+"'")==="3",
      "Only one Service update committed");
    check(sql("select count(*) from private.service_events where service_id='"+id+"'")==="3",
      "Three immutable actor-attributed journal entries recorded");
    phase="journal failure atomic rollback and cross-Tenant FK";
    sql("alter table private.service_events add constraint service_event_fault check(false) not valid");
    try{
      check((await save(owner,ta,id,3,edited)).data.error==="dependency_unavailable",
        "Journal error returns redacted dependency code");
    }finally{sql("alter table private.service_events drop constraint service_event_fault");}
    check(sql("select revision from private.services where id='"+id+"'")==="3"&&
      sql("select count(*) from private.service_events where service_id='"+id+"'")==="3",
      "Failed journal insertion rolls back Service update atomically");
    let crossTenantBlocked=false;
    try{sql("insert into private.service_events(tenant_id,service_id,revision,action,actor_user_id,actor_membership_id) values('"+
      tb+"','"+id+"',99,'service.updated','"+foreign.id+"',(select id from public.memberships where user_id='"+
      foreign.id+"' and tenant_id='"+tb+"'))");}
    catch{crossTenantBlocked=true;}
    check(crossTenantBlocked,"Composite FK forbids foreign Tenant journal insertion");
    for(const table of ["services","service_events"]){
      check((await api("/rest/v1/"+table,owner.token)).status===404,
        "Private Service relation has no public REST route");
      check((await api("/rest/v1/"+table,owner.token,"GET",undefined,{"Accept-Profile":"private"})).status===406,
        "Private schema cannot be directly queried through REST");
    }
    phase="archive, revocation and immutable history";
    check((await save(owner,ta,id,3,{...service,status:"ARCHIVED"})).data.revision===4,
      "Owner archives Service without deleting history");
    check((await save(owner,ta,id,4,service)).data.error==="service_unavailable",
      "Archived Service cannot silently reactivate");
    check(sql("select count(*) from private.service_events where service_id='"+id+
      "' and action='service.archived' and actor_user_id='"+owner.id+"'")==="1",
      "Archive journal retained with attributed actor");
    let historyImmutable=false;
    try{sql("delete from private.service_events where service_id='"+id+"'");}catch{historyImmutable=true;}
    check(historyImmutable,"Journal trigger prevents privileged deletion");
    sql("begin isolation level serializable;update public.memberships set status='REVOKED' where id='"+
      membership+"';commit;");
    check((await list(reader)).data.error==="tenant_unavailable",
      "Revoked Reception loses read access immediately");
    check((await api("/auth/v1/logout?scope=local",owner.token,"POST")).ok,
      "Local Auth logout succeeds");
    check((await list(owner)).data.error==="unauthorized",
      "Old JWT cannot read after session logout");
    check((await create(owner,ta)).data.error==="unauthorized",
      "Old JWT cannot create after session logout");
    console.log("Service Auth/RLS/price/permission/archive/journal/concurrency proof: "+assertions+" PASS");
  }catch(error){console.error("Service proof stopped during "+phase+" (details redacted)");throw error;}
}
