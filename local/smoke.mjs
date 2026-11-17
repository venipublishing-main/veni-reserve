import assert from "node:assert/strict";
import console from "node:console";
import process from "node:process";
import { mkdir, readFile, writeFile } from "node:fs/promises";
/* global fetch */
const origin = "http://127.0.0.1:5192";
function browser() {
  const cookies = new Map();
  return { cookies, async api(path, method = "GET", body, extra = {}) {
    const response = await fetch(origin + "/development/local-api" + path, { method,
      headers: { Origin: origin, Cookie: [...cookies].map(([k,v]) => `${k}=${v}`).join("; "), "Content-Type": "application/json", ...extra },
      body: body === undefined ? undefined : JSON.stringify(body) });
    for (const cookie of response.headers.getSetCookie()) {
      assert(cookie.includes("HttpOnly") && cookie.includes("SameSite=Strict"));
      const [key,value] = cookie.split(";",1)[0].split("="); cookies.set(key,value);
    }
    assert.equal(response.headers.get("cache-control"), "no-store");
    const data = await response.json();
    assert(!JSON.stringify(data).match(/access_token|refresh_token|service_role|sb_secret_/));
    return { status: response.status, data };
  } };
}
const a = browser(), b = browser();
assert.equal((await a.api("/session")).status, 401);
assert.equal((await a.api("/signin", "POST", { fixture: "A" }, { Origin: "https://foreign.invalid" })).status, 403);
assert.equal((await a.api("/signin", "POST", { fixture: "C", user_id: "forged" })).status, 422);
assert.equal((await a.api("/signin", "POST", { fixture: "A" })).status, 200);
const session = (await a.api("/session")).data;
if (process.argv.includes("--resume")) {
  const evidence = JSON.parse(await readFile(".tmp/local-tenant-proof.json", "utf8"));
  assert.equal(session.user.id, evidence.user);
  assert(session.tenants.some(t => t.id === evidence.tenant));
  const restored = await a.api(`/tenants/${evidence.tenant}/settings`);
  assert.equal(restored.status, 200); assert.equal(restored.data.revision, 2);
  assert.deepEqual(restored.data.settings, evidence.settings);
  const locations = await a.api(`/tenants/${evidence.tenant}/locations`);
  assert.equal(locations.status,200); assert.equal(locations.data.locations.length,1);
  assert.equal(locations.data.locations[0].location_id,evidence.location);
  assert.equal(locations.data.locations[0].revision,2);
  assert.deepEqual(locations.data.locations[0].description,evidence.description);
  const services=await a.api(`/tenants/${evidence.tenant}/services`);
  assert.equal(services.status,200);assert.equal(services.data.services.length,1);
  assert.equal(services.data.services[0].service_id,evidence.service);
  assert.equal(services.data.services[0].revision,2);
  assert.equal(services.data.services[0].duration_minutes,evidence.duration);
  assert.equal(services.data.services[0].price_minor_units,evidence.price);
  const roster=await a.api(`/tenants/${evidence.tenant}/staff`);
  assert.equal(roster.status,200);assert.equal(roster.data.staff.length,1);
  assert.equal(roster.data.staff[0].staff_id,evidence.staff);
  assert.equal(roster.data.staff[0].revision,2);
  assert.equal(roster.data.staff[0].biography,evidence.biography);
  const links=await a.api(`/tenants/${evidence.tenant}/eligibility`);
  assert.equal(links.status,200);assert.equal(links.data.eligibility.length,3);
  assert.equal(links.data.eligibility.find(e=>e.kind==="STAFF_SERVICE").eligibility_id,evidence.staffService);
  assert.equal(links.data.eligibility.find(e=>e.kind==="STAFF_SERVICE").revision,2);
  assert.equal(links.data.eligibility.find(e=>e.kind==="STAFF_SERVICE").duration_override_minutes,75);
  assert.equal(links.data.eligibility.filter(e=>e.enabled).length,3);
  const theme = await a.api(`/tenants/${evidence.tenant}/themes/${evidence.theme}`);
  assert.equal(theme.status, 200); assert.equal(theme.data.current_revision, 2);
  assert.deepEqual(theme.data.tokens, evidence.tokens);
  assert.deepEqual(theme.data.history.map(h => h.revision), [2,1]);
  console.log("PASS business, Locations, Services, Staff, explicit eligibility and immutable Theme persistence after actual local restart and fresh genuine Auth sign-in");
  process.exit(0);
}
const [first, retry] = await Promise.all([a.api("/bootstrap", "POST", { request_key: session.request_key }), a.api("/bootstrap", "POST", { request_key: session.request_key })]);
assert.equal(first.status, 200); assert.equal(retry.status, 200); assert.equal(first.data.tenant_id, retry.data.tenant_id);
const tenant = first.data.tenant_id, path = `/tenants/${tenant}/settings`;
const settings = { display_name: "Fictional Local Persistence Review", timezone: "Africa/Johannesburg", default_locale: "en-ZA", default_currency: "ZAR", terminology: { staff_member: { singular: "Practitioner", plural: "Practitioners" } } };
assert.equal((await a.api(path)).data.revision, 0);
assert.equal((await a.api(path, "PUT", { expected_revision: 0, settings })).status, 201);
assert.equal((await a.api(path)).data.revision, 1);
assert.equal((await a.api(path, "PUT", { expected_revision: 0, settings })).status, 409);
settings.display_name = "Edited Fictional Local Persistence Review";
assert.equal((await a.api(path, "PUT", { expected_revision: 1, settings })).status, 200);
assert.deepEqual((await a.api(path)).data.settings, settings);
assert.equal((await a.api(path, "PUT", { expected_revision: 2, settings }, { Origin: "https://foreign.invalid" })).status, 403);
const locationsPath = `/tenants/${tenant}/locations`;
const attributes = {name:"Fictional Pretoria branch",kind:"PHYSICAL",description:null,
  timezone_override:null,public_visible:false,sort_order:0,status:"ACTIVE"};
assert.deepEqual((await a.api(locationsPath)).data.locations,[]);
const newLocation = await a.api(locationsPath,"POST",{expected_revision:0,attributes});
assert.equal(newLocation.status,201); assert.equal(newLocation.data.revision,1);
const locationId = newLocation.data.location_id;
const locationPath = `${locationsPath}/${locationId}`;
assert.equal((await a.api(locationsPath,"POST",{expected_revision:0,attributes})).status,409);
const editedLocation = {...attributes,description:"Fictional location details",public_visible:true};
assert.equal((await a.api(locationPath,"PUT",{expected_revision:1,attributes:editedLocation})).status,200);
assert.equal((await a.api(locationPath,"PUT",{expected_revision:1,attributes})).status,409);
assert.equal((await a.api(locationsPath)).data.locations[0].description,editedLocation.description);
assert.equal((await a.api(locationPath,"PUT",{expected_revision:2,attributes:editedLocation},
  {Origin:"https://foreign.invalid"})).status,403);
const servicesPath=`/tenants/${tenant}/services`;
const serviceAttributes={name:"Fictional eye examination",description:"Synthetic training service",category:"Consultations",
  duration_minutes:45,price_minor_units:45000,currency_override:null,price_display:"AMOUNT",
  buffer_before_minutes:5,buffer_after_minutes:10,min_notice_minutes:null,max_advance_days:null,
  public_visible:false,online_bookable:false,sort_order:0,status:"ACTIVE"};
assert.deepEqual((await a.api(servicesPath)).data.services,[]);
const newService=await a.api(servicesPath,"POST",{expected_revision:0,attributes:serviceAttributes});
assert.equal(newService.status,201);assert.equal(newService.data.revision,1);
const serviceId=newService.data.service_id,servicePath=`${servicesPath}/${serviceId}`;
const editedService={...serviceAttributes,duration_minutes:60,price_minor_units:50000,
  public_visible:true,online_bookable:true};
assert.equal((await a.api(servicePath,"PUT",{expected_revision:1,attributes:editedService})).status,200);
assert.equal((await a.api(servicePath,"PUT",{expected_revision:1,attributes:serviceAttributes})).status,409);
assert.equal((await a.api(servicesPath)).data.services[0].duration_minutes,60);
assert.equal((await a.api(servicePath,"PUT",{expected_revision:2,attributes:editedService},
  {Origin:"https://foreign.invalid"})).status,403);
const staffPath=`/tenants/${tenant}/staff`,eligibilityPath=`/tenants/${tenant}/eligibility`;
const staffAttributes={name:"Dr Synthetic Optometrist",public_display_name:"Dr Synthetic",
  biography:null,status:"ACTIVE",public_visible:false,online_bookable:true,
  no_preference_eligible:true,sort_order:0};
assert.deepEqual((await a.api(staffPath)).data.staff,[]);
const createdStaff=await a.api(staffPath,"POST",{expected_revision:0,attributes:staffAttributes});
assert.equal(createdStaff.status,201);assert.equal(createdStaff.data.revision,1);
const staffId=createdStaff.data.staff_id,staffDetailPath=`${staffPath}/${staffId}`;
assert.equal((await a.api(staffDetailPath,"PUT",{expected_revision:1,attributes:{...staffAttributes,
  biography:"For local synthetic testing only"}})).status,200);
assert.equal((await a.api(staffDetailPath,"PUT",{expected_revision:1,attributes:staffAttributes})).status,409);
assert.equal((await a.api(staffDetailPath,"PUT",{expected_revision:2,attributes:staffAttributes},
  {Origin:"https://foreign.invalid"})).status,403);
assert.deepEqual((await a.api(eligibilityPath)).data.eligibility,[]);
const pair=(kind,person,offering,branch)=>({kind,staff_id:person,service_id:offering,
  location_id:branch,enabled:true,duration_override_minutes:null,price_override_minor_units:null,
  buffer_before_override_minutes:null,buffer_after_override_minutes:null,
  online_bookable_override:null});
const ss=pair("STAFF_SERVICE",staffId,serviceId,null),
  sl=pair("STAFF_LOCATION",staffId,null,locationId),
  vl=pair("SERVICE_LOCATION",null,serviceId,locationId);
const createdLinks=[];
for(const attributes of [ss,sl,vl]){
  const result=await a.api(eligibilityPath,"POST",{expected_revision:0,attributes});
  assert.equal(result.status,201);assert.equal(result.data.revision,1);
  createdLinks.push(result.data.eligibility_id);
}
assert.equal((await a.api(eligibilityPath)).data.eligibility.length,3);
assert.equal((await a.api(eligibilityPath,"POST",{expected_revision:0,attributes:ss})).status,409);
const staffServicePath=`${eligibilityPath}/${createdLinks[0]}`;
const editedLink={...ss,duration_override_minutes:75,price_override_minor_units:65000};
assert.equal((await a.api(staffServicePath,"PUT",{expected_revision:1,attributes:editedLink})).status,200);
assert.equal((await a.api(staffServicePath,"PUT",{expected_revision:1,attributes:ss})).status,409);
assert.equal((await a.api(staffServicePath,"PUT",{expected_revision:2,attributes:editedLink},
  {Origin:"https://foreign.invalid"})).status,403);
assert.equal((await a.api(servicesPath)).data.services[0].duration_minutes,60);
const themesPath = `/tenants/${tenant}/themes`;
assert.deepEqual((await a.api(themesPath)).data.themes, []);
const starter = { primary: "#244b42", accent: "#d8e9d9", typography: "system" };
const created = await a.api(themesPath, "POST", { name: "Standard", tokens: starter });
assert.equal(created.status, 201); assert.equal(created.data.current_revision, 1);
const themeId = created.data.theme_id, themePath = `${themesPath}/${themeId}`;
assert.equal((await a.api(themesPath)).data.themes.length, 1);
assert.deepEqual((await a.api(themePath)).data.tokens, starter);
const nextTokens = { primary: "#ffffff", accent: "#004466", typography: "serif" };
const changed = await a.api(themePath, "PUT", { expected_revision: 1, tokens: nextTokens });
assert.equal(changed.status, 200); assert.equal(changed.data.current_revision, 2);
assert.equal((await a.api(themePath, "PUT", { expected_revision: 1, tokens: starter })).status, 409);
assert.deepEqual((await a.api(`${themePath}/revisions/1`)).data.tokens, starter);
assert.deepEqual((await a.api(`${themePath}/revisions/2`)).data.tokens, nextTokens);
assert.equal((await a.api(themePath, "PUT", { expected_revision: 2, tokens: { ...starter, css: "body{}" } })).status, 422);
assert.equal((await a.api(themesPath, "POST", { name: "Standard", tokens: starter })).status, 409);
assert.equal((await a.api(themePath)).data.current_revision, 2);
assert.equal((await b.api("/signin", "POST", { fixture: "B" })).status, 200);
assert(!(await b.api("/session")).data.tenants.some(t => t.id === tenant));
assert.equal((await b.api(path)).status, 404);
assert.equal((await b.api(path, "PUT", { expected_revision: 2, settings })).status, 404);
assert.equal((await b.api(themesPath)).status, 404);
assert.equal((await b.api(themePath)).status, 404);
assert.equal((await b.api(themePath, "PUT", { expected_revision: 2, tokens: starter })).status, 404);
assert.equal((await b.api(locationsPath)).status,404);
assert.equal((await b.api(locationPath,"PUT",{expected_revision:2,attributes})).status,404);
assert.equal((await b.api(servicesPath)).status,404);
assert.equal((await b.api(servicePath,"PUT",{expected_revision:2,attributes:editedService})).status,404);
assert.equal((await b.api(staffPath)).status,404);
assert.equal((await b.api(staffDetailPath,"PUT",{expected_revision:2,attributes:staffAttributes})).status,404);
assert.equal((await b.api(eligibilityPath)).status,404);
assert.equal((await b.api(staffServicePath,"PUT",{expected_revision:2,attributes:ss})).status,404);
const old = new Map(a.cookies);
assert.equal((await a.api("/logout", "POST")).status, 200);
a.cookies.clear(); for (const [k,v] of old) a.cookies.set(k,v);
assert.equal((await a.api(path, "PUT", { expected_revision: 2, settings })).status, 401);
assert.equal((await a.api(themePath)).status, 401);
assert.equal((await a.api(locationsPath)).status,401);
assert.equal((await a.api(servicesPath)).status,401);
assert.equal((await a.api(staffPath)).status,401);
assert.equal((await a.api(eligibilityPath)).status,401);
await mkdir(".tmp", { recursive: true });
// Non-secret synthetic receipt only. Never write cookies, keys or provider tokens.
await writeFile(".tmp/local-tenant-proof.json", JSON.stringify({ user: session.user.id, tenant, settings,
  theme: themeId, tokens: nextTokens,location:locationId,description:editedLocation.description,
  service:serviceId,duration:editedService.duration_minutes,price:editedService.price_minor_units,
  staff:staffId,biography:"For local synthetic testing only",staffService:createdLinks[0] }));
console.log("PASS real local HTTP: synthetic Auth, secure cookies, bootstrap/retry, business, Locations, Services, Staff, explicit eligibility and Theme revisions, stale conflicts, tenant isolation, CSRF and logout revocation");
