import { settingsInput } from "./business-settings";
export { settingsInput } from "./business-settings";
const record = (v: unknown): v is Record<string, unknown> => v !== null && typeof v === "object" && !Array.isArray(v);

class RequestFault extends Error {
  constructor(readonly status: number, readonly code: string) { super(code); }
}

async function readInput(request: Request) {
  if (request.headers.get("Content-Type")?.split(";")[0].trim().toLowerCase() !== "application/json")
    throw new RequestFault(415, "unsupported_media_type");
  if (Number(request.headers.get("Content-Length")) > 8192)
    throw new RequestFault(413, "body_too_large");
  const fault = new RequestFault(400, "malformed_request");
  const reader = request.body?.getReader();
  if (!reader) throw fault;
  const buffer = new Uint8Array(8192);
  let size = 0;
  try {
    for (;;) {
      const {done, value} = await reader.read();
      if (done) break;
      if (size + value.length > buffer.length) {
        // In workerd cancelling the inbound stream can tear down the connection
        // before the 413 response is delivered. Stop reading and release the lock.
        throw new RequestFault(413, "body_too_large");
      }
      buffer.set(value, size);
      size += value.length;
    }
    const src = new TextDecoder("utf-8",{fatal:true}).decode(buffer.subarray(0,size));
    // Scan strings as indivisible tokens. A colon following a string identifies an
    // object key in any valid JSON document. Compare decoded keys, including escapes.
    const objects: Set<string>[] = [];
    for (const token of src.matchAll(/"(?:[^"\\]|\\[\s\S])*"[\t\r\n ]*:?|[{}]/g)) {
      const t = token[0];
      if (t === "{") objects.push(new Set());
      else if (t === "}") objects.pop();
      else if (t.endsWith(":")) {
        const key: string = JSON.parse(t.slice(0,-1));
        const seen = objects.at(-1);
        if (!seen || seen.has(key)) throw fault;
        seen.add(key);
      }
    }
    return JSON.parse(src) as unknown;
  } catch (e) { throw e instanceof RequestFault ? e : fault; }
  finally { reader.releaseLock(); }
}

const statusCodes = { unauthorized:403, tenant_unavailable:404, invalid_input:422, revision_conflict:409, dependency_unavailable:503 };
function reply(data: unknown, status: number, headers?: Record<string,string>) {
  return Response.json(data, {status,headers:{"Cache-Control":"no-store",...headers}});
}
const failure = (code: string,status: number) => reply({error:{code}},status);

export async function businessSettings(request: Request, target: string, env: {
  VENI_ENV: string; SUPABASE_URL?: string; SUPABASE_PUBLISHABLE_KEY?: string;
}): Promise<Response> {
  if (!["GET","PUT"].includes(request.method)) return reply({error:{code:"method_not_allowed"}},405,{Allow:"GET, PUT"});
  if (!/^[0-9a-f]{8}-(?:[0-9a-f]{4}-){3}[0-9a-f]{12}$/i.test(target)) return failure("malformed_request",400);
  const bearer = request.headers.get("Authorization");
  if (!bearer || !/^Bearer [A-Za-z0-9_-]+\.[A-Za-z0-9_-]+\.[A-Za-z0-9_-]+$/i.test(bearer)) return failure("unauthenticated",401);
  const save = request.method === "PUT";
  const controller = new AbortController();
  let timer: ReturnType<typeof setTimeout> | undefined;
  try {
    const input = save ? settingsInput(await readInput(request)) : null;
    if (save && !input) return failure("invalid_input",422);
    const base = new URL(env.SUPABASE_URL ?? "");
    const local = env.VENI_ENV === "dev" && base.origin === "http://127.0.0.1:54321";
    if ((!local && base.protocol !== "https:") || base.username || base.password || base.pathname !== "/" || base.search || base.hash ||
      !env.SUPABASE_PUBLISHABLE_KEY || !/^sb_publishable_[A-Za-z0-9_-]+$/.test(env.SUPABASE_PUBLISHABLE_KEY)) return failure("dependency_unavailable",503);
    timer = setTimeout(() => controller.abort(),5000);
    const res = await fetch(new URL("/rest/v1/rpc/" + (save ? "save" : "read") + "_tenant_business_settings",base), {
      method:"POST",redirect:"manual",signal:controller.signal,
      headers:{"Content-Type":"application/json",apikey:env.SUPABASE_PUBLISHABLE_KEY,Authorization:bearer},
      body:JSON.stringify({target,...input}),
    });
    const data: unknown = await res.json();
    if (!res.ok) {
      if (res.status === 401 && record(data) && ["PGRST301","PGRST303"].includes(String(data.code)))
        return failure("unauthenticated",401);
      return failure("dependency_unavailable",503);
    }
    if (record(data) && typeof data.error === "string" && Object.hasOwn(statusCodes,data.error))
      return failure(data.error,statusCodes[data.error as keyof typeof statusCodes]);
    if (!save && record(data) && data.state==="unconfigured" && data.revision===0 && data.settings===null)
      return reply({state:"unconfigured",revision:0,settings:null},200);
    if (record(data) && data.state==="configured" && Number.isInteger(data.revision) && typeof data.revision==="number"
      && data.revision>0 && data.revision<=2147483647 && (!save || data.revision===input!.expected_revision+1)) {
      const parsed = settingsInput({expected_revision:0,settings:data.settings});
      if (parsed) {
        const {display_name,timezone,default_locale,default_currency,staff_member_singular,staff_member_plural} = parsed;
        return reply({state:"configured",revision:data.revision,settings:{display_name,timezone,default_locale,default_currency,
          terminology:staff_member_singular ? {staff_member:{singular:staff_member_singular,plural:staff_member_plural}} : {}}},
          save && input!.expected_revision===0 ? 201 : 200);
      }
    }
    return failure("dependency_unavailable",503);
  } catch(e) { return e instanceof RequestFault ? failure(e.code,e.status) : failure("dependency_unavailable",503); }
  finally {clearTimeout(timer);}
}
