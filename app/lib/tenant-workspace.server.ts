import { validDetails, validReview } from "./business-onboarding";
import { businessSettings } from "./business-settings.server";
import { locationAttributes, locationList, locationSaveResult } from "./locations";
import { serviceAttributes, serviceList, serviceSaveResult } from "./services";
import { staffAttributes,staffList,staffSaveResult,eligibilityAttributes,
  eligibilityList,eligibilitySaveResult } from "./staff";
import { newThemeInput, savedThemeInput, themeRecord, themeSummaries, themeVersion } from "./theme-revisions";
const uuid = (s: unknown): s is string => typeof s === "string" && /^[a-f0-9]{8}(-[a-f0-9]{4}){3}-[a-f0-9]{12}$/i.test(s);
const object = (v: unknown): v is Record<string, unknown> => !!v && typeof v === "object" && !Array.isArray(v);
const headers = { "Cache-Control": "no-store", "X-Robots-Tag": "noindex, nofollow", "Referrer-Policy": "no-referrer" };
const reply = (value: unknown, status = 200) => Response.json(value, { status, headers });

export async function tenantWorkspace(request: Request, path: string, user: { id: string }, token: string,
  requestKey: string, receiptCookie: (key: string) => string,
  settingsEnv: Parameters<typeof businessSettings>[2],
  rpc: (name: string, token: string, body?: object) => Promise<Response>): Promise<Response> {
  async function tenants(token: string): Promise<Array<{ id: string; status: string; display_name: string | null }>> {
    const response = await rpc("list_setup_tenants", token);
    if (!response.ok) throw new Error("Tenant lookup unavailable");
    const rows: unknown = await response.json();
    if (!Array.isArray(rows) || rows.some(row => !object(row) || !uuid(row.id))) throw new Error("Invalid tenant lookup");
    return rows;
  }
  const themeErrors: Record<string, number> = {
    unauthorized: 403, tenant_unavailable: 404, theme_unavailable: 404,
    invalid_input: 422, revision_conflict: 409, duplicate_name: 409, dependency_unavailable: 503,
  };
  async function themeCall(name: string, token: string, body: object,
    validate: (data: unknown) => boolean, successStatus = 200) {
    const result = await rpc(name, token, body);
    if (!result.ok) return reply({ error: "theme_dependency_unavailable" }, 503);
    const value: unknown = await result.json();
    if (object(value) && typeof value.error === "string" && Object.hasOwn(themeErrors, value.error))
      return reply({ error: value.error }, themeErrors[value.error]);
    return validate(value) ? reply(value, successStatus) : reply({ error: "theme_dependency_unavailable" }, 503);
  }
  async function locationCall(name: string, token: string, body: object,
    validate: (data: unknown) => boolean, successStatus = 200) {
    const response = await rpc(name, token, body);
    if (!response.ok) return reply({ error: "location_dependency_unavailable" }, 503);
    const value: unknown = await response.json();
    if (object(value) && typeof value.error === "string") {
      const codes: Record<string,number> = {
        unauthorized: 403, tenant_unavailable: 404, location_unavailable: 404,
        invalid_input: 422, revision_conflict: 409, duplicate_name: 409, dependency_unavailable: 503,
      };
      if (Object.hasOwn(codes,value.error)) return reply({ error: value.error }, codes[value.error]);
    }
    return validate(value) ? reply(value,successStatus) : reply({ error: "location_dependency_unavailable" }, 503);
  }
  async function serviceCall(name: string, token: string, body: object,
    validate: (data: unknown) => boolean, successStatus = 200) {
    const response=await rpc(name,token,body);
    if(!response.ok)return reply({error:"service_dependency_unavailable"},503);
    const value:unknown=await response.json();
    if(object(value)&&typeof value.error==="string"){
      const codes:Record<string,number>={
        unauthorized:403,tenant_unavailable:404,service_unavailable:404,
        invalid_input:422,revision_conflict:409,dependency_unavailable:503,
      };
      if(Object.hasOwn(codes,value.error))return reply({error:value.error},codes[value.error]);
    }
    return validate(value)?reply(value,successStatus):reply({error:"service_dependency_unavailable"},503);
  }
  async function staffCall(name:string,token:string,body:object,
    validate:(data:unknown)=>boolean,successStatus=200){
    const response=await rpc(name,token,body);
    if(!response.ok)return reply({error:"staff_dependency_unavailable"},503);
    const value:unknown=await response.json();
    if(object(value)&&typeof value.error==="string"){
      const codes:Record<string,number>={
        unauthorized:403,tenant_unavailable:404,staff_unavailable:404,
        relation_unavailable:404,relation_exists:409,revision_conflict:409,
        invalid_input:422,dependency_unavailable:503,
      };
      if(Object.hasOwn(codes,value.error))return reply({error:value.error},codes[value.error]);
    }
    return validate(value)?reply(value,successStatus):reply({error:"staff_dependency_unavailable"},503);
  }
  if (path === "/session" && request.method === "GET") {
    const existing = requestKey, key = uuid(existing) ? existing : crypto.randomUUID();
    const response = reply({ user, tenants: await tenants(token), request_key: key });
    if (!uuid(existing)) response.headers.append("Set-Cookie", receiptCookie(key));
    return response;
  }
  if (path === "/new-request" && request.method === "POST") {
    const key = crypto.randomUUID(), response = reply({ request_key: key });
    response.headers.append("Set-Cookie", receiptCookie(key)); return response;
  }
  if (path === "/bootstrap" && request.method === "POST") {
    const input: unknown = await request.json(), key = requestKey;
    if (!object(input) || Object.keys(input).length !== 1 || !uuid(key) || input.request_key !== key) return reply({ error: "request_key_required" }, 409);
    for (let attempt = 0; attempt < 3; attempt++) {
      const response = await rpc("bootstrap_setup_tenant", token, { request_key: key });
      const result: unknown = await response.json();
      if (object(result) && ["40001", "23505", "40P01"].includes(String(result.code))) continue;
      if (!response.ok) return reply({ error: "creation_uncertain_retry_same_request" }, 503);
      if (!object(result) || !uuid(result.tenant_id)) return reply({ error: "creation_rejected" }, 409);
      return reply({ tenant_id: result.tenant_id, replayed: result.replayed === true });
    }
    return reply({ error: "retry_same_request" }, 409);
  }
  const selected = /^\/tenants\/([a-f0-9-]{36})\/settings$/.exec(path);
  if (selected && ["GET", "PUT"].includes(request.method)) {
    // URL is an untrusted selector, never authorization.
    if (!(await tenants(token)).some(tenant => tenant.id === selected[1])) return reply({ error: "tenant_unavailable" }, 404);
    const forwarded = new Request(request, { headers: { "Content-Type": "application/json", Authorization: `Bearer ${token}` } });
    return businessSettings(forwarded, selected[1], settingsEnv);
  }
  const onboarding = /^\/tenants\/([a-f0-9-]{36})\/onboarding(\/activation)?$/.exec(path);
  if (onboarding && settingsEnv.VENI_ACCOUNT_MODE === "shared") {
    const [, target, activation] = onboarding;
    if (!uuid(target)) return reply({ error: "malformed_request" }, 400);
    let name = "read_business_onboarding";
    let body: object = { target };
    if (request.method === (activation ? "POST" : "PUT")) {
      let input: unknown;
      try { input = await request.json(); } catch { return reply({ error: "malformed_request" }, 400); }
      if (!object(input)) return reply({ error: "invalid_input" }, 422);
      if (activation) {
        if (Object.keys(input).length !== 1 || typeof input.review_key !== "string" || !/^[0-9a-f]{32}$/.test(input.review_key))
          return reply({ error: "invalid_input" }, 422);
        name = "activate_business_onboarding";
        body = { target, review_key: input.review_key };
      } else {
        if (Object.keys(input).length !== 2 || typeof input.expected_revision !== "number" ||
            !Number.isInteger(input.expected_revision) || input.expected_revision < 0 || input.expected_revision > 2147483646 ||
            !validDetails(input.details)) return reply({ error: "invalid_input" }, 422);
        name = "save_business_onboarding";
        body = { target, expected: input.expected_revision, details: input.details };
      }
    } else if (activation || request.method !== "GET") return reply({ error: "method_not_allowed" }, 405);
    const res = await rpc(name, token, body);
    const data: unknown = await res.json();
    if (object(data) && data.code === "40001") return reply({ error: "revision_conflict" }, 409);
    if (res.ok && validReview(data)) return reply(data);
    const errors: Record<string,number> = { tenant_unavailable: 404, revision_conflict: 409, incomplete: 422, invalid_input: 422 };
    if (res.ok && object(data) && typeof data.error === "string" && Object.hasOwn(errors, data.error))
      return reply({ error: data.error }, errors[data.error]);
    return reply({ error: "dependency_unavailable" }, 503);
  }
  const locationPath = /^\/tenants\/([a-f0-9-]{36})\/locations(?:\/([a-f0-9-]{36}))?$/.exec(path);
  if (locationPath) {
    const [,tenantId,locationId] = locationPath;
    if (!uuid(tenantId) || (locationId && !uuid(locationId))) return reply({ error: "malformed_request" },400);
    if (!(await tenants(token)).some(t => t.id === tenantId)) return reply({ error: "tenant_unavailable" },404);
    if (!locationId && request.method === "GET")
      return locationCall("list_tenant_locations",token,{ target: tenantId },locationList);
    if (["POST","PUT"].includes(request.method) &&
      ((request.method === "POST" && !locationId) || (request.method === "PUT" && !!locationId))) {
      let input: unknown;
      try { input = await request.json(); } catch { return reply({ error: "malformed_request" },400); }
      if (!object(input) || Object.keys(input).length !== 2 ||
        !Object.hasOwn(input,"expected_revision") || !Object.hasOwn(input,"attributes") ||
        !Number.isInteger(input.expected_revision) ||
        (input.expected_revision as number) < (locationId ? 1 : 0) ||
        (input.expected_revision as number) > 2147483646 ||
        (!locationId && input.expected_revision !== 0))
        return reply({ error: "invalid_input" },422);
      const attributes = locationAttributes(input.attributes);
      if (!attributes || (!locationId && attributes.status === "ARCHIVED")) return reply({ error: "invalid_input" },422);
      return locationCall("save_tenant_location",token,
        { target:tenantId,location:locationId ?? null,expected:input.expected_revision,attributes },
        locationSaveResult,locationId ? 200 : 201);
    }
    return reply({ error: "method_not_allowed" },405);
  }
  const servicePath=/^\/tenants\/([a-f0-9-]{36})\/services(?:\/([a-f0-9-]{36}))?$/.exec(path);
  if(servicePath){
    const [,tenantId,serviceId]=servicePath;
    if(!uuid(tenantId)||(serviceId&&!uuid(serviceId)))return reply({error:"malformed_request"},400);
    if(!(await tenants(token)).some(t=>t.id===tenantId))return reply({error:"tenant_unavailable"},404);
    if(!serviceId&&request.method==="GET")
      return serviceCall("list_tenant_services",token,{target:tenantId},serviceList);
    if(["POST","PUT"].includes(request.method)&&
      ((request.method==="POST"&&!serviceId)||(request.method==="PUT"&&!!serviceId))){
      let input:unknown;
      try{input=await request.json();}catch{return reply({error:"malformed_request"},400);}
      if(!object(input)||Object.keys(input).length!==2||
        !Object.hasOwn(input,"expected_revision")||!Object.hasOwn(input,"attributes")||
        !Number.isInteger(input.expected_revision)||
        (input.expected_revision as number)<(serviceId?1:0)||
        (input.expected_revision as number)>2147483646||
        (!serviceId&&input.expected_revision!==0))return reply({error:"invalid_input"},422);
      const attributes=serviceAttributes(input.attributes);
      if(!attributes||(!serviceId&&attributes.status==="ARCHIVED"))return reply({error:"invalid_input"},422);
      const requestKey = request.headers.get("Idempotency-Key");
      if (!serviceId && settingsEnv.VENI_ACCOUNT_MODE === "shared") {
        if (!uuid(requestKey)) return reply({ error: "invalid_input" }, 422);
        return serviceCall("create_catalogue_item", token,
          { target: tenantId, kind: "service", request_key: requestKey, attributes }, serviceSaveResult, 201);
      }
      return serviceCall("save_tenant_service",token,
        {target:tenantId,service:serviceId??null,expected:input.expected_revision,attributes},
        serviceSaveResult,serviceId?200:201);
    }
    return reply({error:"method_not_allowed"},405);
  }
  const staffPath=/^\/tenants\/([a-f0-9-]{36})\/staff(?:\/([a-f0-9-]{36}))?$/.exec(path);
  if(staffPath){
    const [,tenantId,staffId]=staffPath;
    if(!uuid(tenantId)||(staffId&&!uuid(staffId)))return reply({error:"malformed_request"},400);
    if(!(await tenants(token)).some(t=>t.id===tenantId))return reply({error:"tenant_unavailable"},404);
    if(!staffId&&request.method==="GET")
      return staffCall("list_tenant_staff",token,{target:tenantId},staffList);
    if(["POST","PUT"].includes(request.method)&&
      ((request.method==="POST"&&!staffId)||(request.method==="PUT"&&!!staffId))){
      let input:unknown;
      try{input=await request.json();}catch{return reply({error:"malformed_request"},400);}
      if(!object(input)||Object.keys(input).length!==2||
        !Object.hasOwn(input,"expected_revision")||!Object.hasOwn(input,"attributes")||
        !Number.isInteger(input.expected_revision)||
        (input.expected_revision as number)<(staffId?1:0)||
        (input.expected_revision as number)>2147483646||
        (!staffId&&input.expected_revision!==0))return reply({error:"invalid_input"},422);
      const attributes=staffAttributes(input.attributes);
      if(!attributes||(!staffId&&attributes.status==="ARCHIVED"))
        return reply({error:"invalid_input"},422);
      const requestKey = request.headers.get("Idempotency-Key");
      if (!staffId && settingsEnv.VENI_ACCOUNT_MODE === "shared") {
        if (!uuid(requestKey)) return reply({ error: "invalid_input" }, 422);
        return staffCall("create_catalogue_item", token,
          { target: tenantId, kind: "staff", request_key: requestKey, attributes }, staffSaveResult, 201);
      }
      return staffCall("save_tenant_staff",token,
        {target:tenantId,staff:staffId??null,expected:input.expected_revision,attributes},
        staffSaveResult,staffId?200:201);
    }
    return reply({error:"method_not_allowed"},405);
  }
  const eligibilityPath=/^\/tenants\/([a-f0-9-]{36})\/eligibility(?:\/([a-f0-9-]{36}))?$/.exec(path);
  if(eligibilityPath){
    const [,tenantId,linkId]=eligibilityPath;
    if(!uuid(tenantId)||(linkId&&!uuid(linkId)))return reply({error:"malformed_request"},400);
    if(!(await tenants(token)).some(t=>t.id===tenantId))return reply({error:"tenant_unavailable"},404);
    if(!linkId&&request.method==="GET")
      return staffCall("list_tenant_eligibility",token,{target:tenantId},eligibilityList);
    if(["POST","PUT"].includes(request.method)&&
      ((request.method==="POST"&&!linkId)||(request.method==="PUT"&&!!linkId))){
      let input:unknown;
      try{input=await request.json();}catch{return reply({error:"malformed_request"},400);}
      if(!object(input)||Object.keys(input).length!==2||
        !Object.hasOwn(input,"expected_revision")||!Object.hasOwn(input,"attributes")||
        !Number.isInteger(input.expected_revision)||
        (input.expected_revision as number)<(linkId?1:0)||
        (input.expected_revision as number)>2147483646||
        (!linkId&&input.expected_revision!==0))return reply({error:"invalid_input"},422);
      const attributes=eligibilityAttributes(input.attributes);
      if(!attributes)return reply({error:"invalid_input"},422);
      return staffCall("save_tenant_eligibility",token,
        {target:tenantId,link:linkId??null,expected:input.expected_revision,attributes},
        eligibilitySaveResult,linkId?200:201);
    }
    return reply({error:"method_not_allowed"},405);
  }
  const themePath = /^\/tenants\/([a-f0-9-]{36})\/themes(?:\/([a-f0-9-]{36})(?:\/revisions\/([0-9]+))?)?$/.exec(path);
  if (themePath) {
    const [, tenantId, themeId, revisionId] = themePath;
    if (!uuid(tenantId) || (themeId && !uuid(themeId))) return reply({ error: "malformed_request" }, 400);
    if (!(await tenants(token)).some(t => t.id === tenantId)) return reply({ error: "tenant_unavailable" }, 404);
    if (!themeId && request.method === "GET") return themeCall("list_tenant_themes", token, { target: tenantId }, themeSummaries);
    if (!themeId && request.method === "POST") {
      let input: unknown;
      try { input = await request.json(); } catch { return reply({ error: "malformed_request" }, 400); }
      const fields = newThemeInput(input);
      return fields ? themeCall("create_tenant_theme", token, { target: tenantId, ...fields }, themeRecord, 201)
        : reply({ error: "invalid_input" }, 422);
    }
    if (themeId && !revisionId && request.method === "GET")
      return themeCall("read_tenant_theme", token, { target: tenantId, theme: themeId }, themeRecord);
    if (themeId && !revisionId && request.method === "PUT") {
      let input: unknown;
      try { input = await request.json(); } catch { return reply({ error: "malformed_request" }, 400); }
      const fields = savedThemeInput(input);
      return fields ? themeCall("save_tenant_theme_revision", token,
        { target: tenantId, theme: themeId, ...fields }, themeRecord) : reply({ error: "invalid_input" }, 422);
    }
    if (themeId && revisionId && request.method === "GET") {
      const requested = Number(revisionId);
      if (!Number.isSafeInteger(requested) || requested < 1 || requested > 2147483646)
        return reply({ error: "invalid_input" }, 422);
      return themeCall("read_tenant_theme_revision", token,
        { target: tenantId, theme: themeId, requested }, themeVersion);
    }
    return reply({ error: "method_not_allowed" }, 405);
  }
  return reply({ error: "not_found" }, 404);
}
