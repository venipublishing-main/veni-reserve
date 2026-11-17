// Genuine disposable Supabase Auth + PostgREST proof. All names and identities synthetic.
import { randomUUID } from "node:crypto";
import console from "node:console";
import { object, sql } from "./security-local.mjs";

type Actor = { id: string; token: string };
type Context = { identity: (anonymous?: boolean) => Promise<Actor>;
  api: (path: string, token?: string, method?: string, body?: object, headers?: Record<string,string>) => Promise<Response> };
const reception = "10000000-0000-4000-8000-000000000003";
const location = {
  name:"Main branch",kind:"PHYSICAL",description:"Fictional test address",
  timezone_override:null,public_visible:false,sort_order:0,status:"ACTIVE",
};

export async function locationProof({ identity,api }: Context) {
  let assertions = 0;
  let phase = "creating genuine Auth identities";
  const check = (ok: unknown, label: string) => {
    if (!ok) { console.error("Location security FAIL: " + label);throw new Error("Location proof failed"); }
    assertions++;
  };
  try {
    const owner = await identity(), foreign = await identity(), reader = await identity();
    const withoutMembership = await identity(), anon = await identity(true);
    const rpc = async (name: string, actor: Actor, body: object = {}) => {
      const response = await api("/rest/v1/rpc/" + name,actor.token,"POST",body);
      return { status:response.status,data:object(await response.json()) };
    };
    const bootstrap = async (actor: Actor) => {
      const result = await rpc("bootstrap_setup_tenant",actor,{ request_key:randomUUID() });
      check(result.status===200 && typeof result.data.tenant_id==="string","Owner bootstrap in disposable local Auth");
      return String(result.data.tenant_id);
    };
    const ta = await bootstrap(owner), tb = await bootstrap(foreign);
    const readerMembership = randomUUID();
    phase = "assigning read-only Reception membership";
    sql("begin isolation level serializable; insert into public.users(id) values('" + reader.id +
      "'); insert into public.memberships(id,tenant_id,user_id,status) values('" + readerMembership +
      "','" + ta + "','" + reader.id + "','ACTIVE'); insert into public.membership_roles(membership_id,role_id) values('" +
      readerMembership + "','" + reception + "'); commit;");
    const list = (actor: Actor,target=ta) => rpc("list_tenant_locations",actor,{target});
    const save = (actor: Actor,target: string,locationId: string | null,expected: number,attributes: object) =>
      rpc("save_tenant_location",actor,{target,location:locationId,expected,attributes});
    const create = (actor: Actor,target: string,attributes: object=location) => save(actor,target,null,0,attributes);
    phase = "creating and reading private Location";
    const empty = (await list(owner)).data.locations;
    check(Array.isArray(empty) && empty.length===0,"Fresh business has no locations");
    const created = await create(owner,ta);
    const loc = String(created.data.location_id);
    check(created.status===200 && /^[0-9a-f-]{36}$/.test(loc) && created.data.revision===1,
      "Owner created Location revision 1");
    const owned = (await list(owner)).data.locations as unknown[];
    check(owned.length===1 && object(owned[0]).location_id===loc,"Owner sees persisted Location");
    check(((await list(reader)).data.locations as unknown[]).length===1,
      "Reception with tenant.read can view Location but not manage");
    for (const actor of [reader,withoutMembership,anon,foreign]) {
      const result = await create(actor,ta);
      check(["tenant_unavailable","unauthorized"].includes(String(result.data.error)),
        "Unauthorized member cannot insert Location");
    }
    check((await list(foreign,ta)).data.error==="tenant_unavailable",
      "Foreign Owner cannot list this tenant's Locations");
    check((await list(owner,tb)).data.error==="tenant_unavailable",
      "Own Owner credential cannot select a different tenant");
    check((await save(foreign,tb,loc,1,location)).data.error==="location_unavailable",
      "Foreign Location UUID cannot be updated through another tenant context");
    check((await save(reader,ta,loc,1,location)).data.error==="tenant_unavailable",
      "Read-only Reception cannot edit Location");
    check((await create(owner,ta)).data.error==="duplicate_name","Live duplicate Location name rejected");
    for (const bad of [
      {...location,html:"script"}, {...location,name:"<b>Main</b>"},
      {...location,timezone_override:"Unsafe/Unknown"}, {...location,sort_order:10000},
      {...location,public_visible:"yes"}, {...location,status:"ARCHIVED"},
    ]) check((await create(owner,ta,bad)).data.error==="invalid_input",
      "Unknown fields, unsafe types and invalid publication states rejected");
    const modified = {...location,description:"A room in a fictional building",
      timezone_override:"Africa/Johannesburg",public_visible:true,sort_order:2};
    const updated = await save(owner,ta,loc,1,modified);
    check(updated.data.revision===2 && Array.isArray(updated.data.locations),"Owner updated revision 2");
    check((await save(owner,ta,loc,1,location)).data.error==="revision_conflict",
      "Stale edit is rejected");
    const races = await Promise.all([
      save(owner,ta,loc,2,{...location,name:"A main branch"}),
      save(owner,ta,loc,2,{...location,name:"B main branch"}),
    ]);
    check(races.filter(r=>r.data.revision===3).length===1 &&
      races.filter(r=>r.data.error==="revision_conflict").length===1,
      "Concurrent edits advance one revision only");
    check(sql("select revision from private.locations where id='" + loc + "'")==="3",
      "Exactly one serialized Location update committed");
    check(sql("select count(*) from private.location_events where location_id='" + loc + "'")==="3",
      "Three actor-attributed immutable Location journal rows");
    phase = "journal-rollback and tenant-boundary inspection";
    sql("alter table private.location_events add constraint location_event_fault check(false) not valid");
    try {
      check((await save(owner,ta,loc,3,modified)).data.error==="dependency_unavailable",
        "Forced journal failure is sanitized");
    } finally {sql("alter table private.location_events drop constraint location_event_fault");}
    check(sql("select revision from private.locations where id='" + loc + "'")==="3" &&
      sql("select count(*) from private.location_events where location_id='" + loc + "'")==="3",
      "Journal failure atomically rolls back Location edit");
    let crossTenantDenied = false;
    try { sql("insert into private.location_events(tenant_id,location_id,revision,action,actor_user_id,actor_membership_id) " +
      "values('" + tb + "','" + loc + "',99,'location.updated','" + foreign.id +
      "',(select id from public.memberships where user_id='" + foreign.id + "' and tenant_id='" + tb + "'))"); }
    catch { crossTenantDenied = true; }
    check(crossTenantDenied,"Composite foreign key blocks foreign Tenant journal injection");
    for (const table of ["locations","location_events"]) {
      check((await api("/rest/v1/" + table,owner.token)).status===404,
        "No public REST table for private " + table);
      check((await api("/rest/v1/" + table,owner.token,"GET",undefined,{"Accept-Profile":"private"})).status===406,
        "Private schema cannot be queried directly via REST");
    }
    phase = "archiving, revocation and immutable history";
    const archive = await save(owner,ta,loc,3,{...location,status:"ARCHIVED"});
    check(archive.data.revision===4,"Location archived with a new revision");
    check((await save(owner,ta,loc,4,location)).data.error==="location_unavailable",
      "Archived Location cannot be silently reactivated");
    check(sql("select count(*) from private.location_events where location_id='" + loc +
      "' and action='location.archived' and actor_user_id='" + owner.id + "'")==="1",
      "Archived history retained and attributed");
    let appendOnly = false;
    try {sql("delete from private.location_events where location_id='" + loc + "'");}
    catch {appendOnly=true;}
    check(appendOnly,"Journal trigger prevents privileged deletion");
    sql("begin isolation level serializable; update public.memberships set status='REVOKED' where id='" +
      readerMembership + "'; commit;");
    check((await list(reader)).data.error==="tenant_unavailable",
      "Revoked read-only member loses access");
    check((await api("/auth/v1/logout?scope=local",owner.token,"POST")).ok,
      "Local provider logout succeeds");
    check((await list(owner)).data.error==="unauthorized",
      "Old JWT cannot read after live session logout");
    check((await create(owner,ta)).data.error==="unauthorized",
      "Old JWT cannot create after live session logout");
    console.log("Location Auth/RLS/archive/journal/concurrency proof: " + assertions + " PASS");
  } catch(error) {
    console.error("Location proof stopped during " + phase + " (details redacted)");
    throw error;
  }
}
