// LOCAL TEST HARNESS ONLY. Imported by Vite configuration, never by an app route.
import { execFileSync } from "node:child_process";
import { randomUUID } from "node:crypto";
import { existsSync } from "node:fs";
import { resolve } from "node:path";
import type { Plugin } from "vite";
import { businessSettings } from "../app/lib/business-settings.server";
import { newThemeInput, savedThemeInput, themeRecord, themeSummaries, themeVersion } from "../app/lib/theme-revisions";
import { guardEnvironment } from "../tests/database/ci.mjs";
const origin = "http://127.0.0.1:5192", provider = "http://127.0.0.1:54321";
const cookieName = "reserve_local_session", receiptName = "reserve_local_request";
const uuid = (s: unknown): s is string => typeof s === "string" && /^[a-f0-9]{8}(-[a-f0-9]{4}){3}-[a-f0-9]{12}$/i.test(s);
const object = (v: unknown): v is Record<string, unknown> => !!v && typeof v === "object" && !Array.isArray(v);
const headers = { "Cache-Control": "no-store", "X-Robots-Tag": "noindex, nofollow", "Referrer-Policy": "no-referrer" };
const reply = (value: unknown, status = 200) => Response.json(value, { status, headers });
function cookie(name: string, value: string, age = 3600) { return `${name}=${value}; HttpOnly; SameSite=Strict; Path=/development; Max-Age=${age}`; }
function readCookie(request: Request, name: string) {
  const matches = (request.headers.get("cookie") ?? "").split(";").map(s => s.trim()).filter(s => s.startsWith(`${name}=`));
  return matches.length === 1 ? matches[0].slice(name.length + 1) : "";
}
export function localHarnessAllowed(request: Request) {
  const u = new URL(request.url);
  return u.origin === origin && ["GET", "POST", "PUT"].includes(request.method)
    && (request.method === "GET" || request.headers.get("origin") === origin)
    && !["cross-site", "same-site"].includes(request.headers.get("sec-fetch-site") ?? "");
}
type State = { API_URL: string; ANON_KEY: string; PUBLISHABLE_KEY: string; SERVICE_ROLE_KEY: string };
export function createLocalHandler(state: State) {
  if (state.API_URL !== provider || !state.ANON_KEY || !state.SERVICE_ROLE_KEY || !state.PUBLISHABLE_KEY) throw new Error("Local provider configuration unavailable");
  async function api(path: string, token: string, method = "GET", body?: unknown) {
    return fetch(provider + path, { method, redirect: "error", signal: AbortSignal.timeout(5000),
      headers: { apikey: state.ANON_KEY, Authorization: `Bearer ${token}`, "Content-Type": "application/json" },
      body: body === undefined ? undefined : JSON.stringify(body) });
  }
  async function rpc(name: string, token: string, body: unknown = {}) { return api(`/rest/v1/rpc/${name}`, token, "POST", body); }
  /** Auth verifies the token; the database independently verifies the live session. */
  async function currentUser(token: string) {
    if (!/^[A-Za-z0-9_-]+\.[A-Za-z0-9_-]+\.[A-Za-z0-9_-]+$/.test(token) || token.length > 8192) return null;
    const response = await api("/auth/v1/user", token);
    if (!response.ok) return null;
    const user: unknown = await response.json();
    if (!object(user) || !uuid(user.id)) return null;
    const checked = await rpc("current_reserve_user", token);
    return checked.ok && await checked.json() === user.id ? { id: user.id } : null;
  }
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
  return async (request: Request): Promise<Response> => {
    if (!localHarnessAllowed(request)) return reply({ error: "local_origin_required" }, 403);
    const path = new URL(request.url).pathname.replace("/development/local-api", "");
    const token = readCookie(request, cookieName);
    try {
      if (path === "/signin" && request.method === "POST") {
        const input: unknown = await request.json();
        if (!object(input) || Object.keys(input).length !== 1 || !["A", "B"].includes(String(input.fixture))) return reply({ error: "fixture_required" }, 422);
        // Only two fixed fictional test identities. No arbitrary email/subject/role.
        const link = await api("/auth/v1/admin/generate_link", state.SERVICE_ROLE_KEY, "POST", { type: "magiclink", email: `reserve-local-${String(input.fixture).toLowerCase()}@example.invalid` });
        if (!link.ok) throw new Error("Local fixture unavailable");
        const issued = await link.json() as { hashed_token?: string };
        if (!issued.hashed_token) throw new Error("Local link unavailable");
        const auth = await api("/auth/v1/verify", state.ANON_KEY, "POST", { token_hash: issued.hashed_token, type: "email" });
        if (!auth.ok) throw new Error("Local Auth verification unavailable");
        const session = await auth.json() as { access_token?: string };
        if (!session.access_token || !await currentUser(session.access_token)) throw new Error("Local session rejected");
        const response = reply({ authenticated: true });
        response.headers.append("Set-Cookie", cookie(cookieName, session.access_token));
        response.headers.append("Set-Cookie", cookie(receiptName, randomUUID()));
        return response;
      }
      if (path === "/logout" && request.method === "POST") {
        if (token) { const response = await api("/auth/v1/logout?scope=local", token, "POST"); if (!response.ok && response.status !== 401) throw new Error("Logout unavailable"); }
        const response = reply({ authenticated: false });
        response.headers.append("Set-Cookie", cookie(cookieName, "", 0)); response.headers.append("Set-Cookie", cookie(receiptName, "", 0));
        return response;
      }
      const user = await currentUser(token);
      if (!user) return reply({ error: "unauthenticated" }, 401);
      if (path === "/session" && request.method === "GET") {
        const existing = readCookie(request, receiptName), key = uuid(existing) ? existing : randomUUID();
        const response = reply({ user, tenants: await tenants(token), request_key: key });
        if (!uuid(existing)) response.headers.append("Set-Cookie", cookie(receiptName, key));
        return response;
      }
      if (path === "/new-request" && request.method === "POST") {
        const key = randomUUID(), response = reply({ request_key: key });
        response.headers.append("Set-Cookie", cookie(receiptName, key)); return response;
      }
      if (path === "/bootstrap" && request.method === "POST") {
        const input: unknown = await request.json(), key = readCookie(request, receiptName);
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
        return businessSettings(forwarded, selected[1], { VENI_ENV: "dev", SUPABASE_URL: provider, SUPABASE_PUBLISHABLE_KEY: state.PUBLISHABLE_KEY });
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
    } catch { return reply({ error: "local_dependency_unavailable_retry_same_request" }, 503); }
  };
}
export function localTenantHarness(): Plugin {
  return { name: "local-tenant-harness", apply: "serve", async configureServer(server) {
    if (process.env.VENI_LOCAL_BOOTSTRAP !== "1" || server.config.server.host !== "127.0.0.1" || server.config.server.port !== 5192) throw new Error("Local harness must bind only 127.0.0.1:5192");
    guardEnvironment(process.env);
    for (const path of [".env", ".dev.vars", "supabase/.temp/project-ref"]) if (existsSync(resolve(path))) throw new Error("Unreviewed environment or hosted link present");
    function capture(file: string, args: string[]) {
      try { return execFileSync(file, args, { encoding: "utf8", stdio: ["ignore", "pipe", "pipe"], timeout: 15000 }).trim(); }
      catch { throw new Error("Local harness prerequisite unavailable; output withheld"); }
    }
    const context = capture("docker", ["context", "show"]);
    const endpoint = capture("docker", ["context", "inspect", context, "--format", "{{.Endpoints.docker.Host}}"]);
    if (!((process.platform === "win32" && endpoint === "npipe:////./pipe/dockerDesktopLinuxEngine") || (process.platform === "linux" && endpoint === "unix:///var/run/docker.sock"))) throw new Error("Nonlocal Docker denied");
    if (capture("docker", ["inspect", "supabase_db_veni-reserve", "--format", '{{index .Config.Labels "com.supabase.cli.project"}}/{{.State.Running}}']) !== "veni-reserve/true") throw new Error("Local DB identity mismatch");
    const state = JSON.parse(capture(process.execPath, ["node_modules/supabase/dist/supabase.js", "--workdir", process.cwd(), "status", "-o", "json"]));
    const handler = createLocalHandler(state);
    server.middlewares.use(async (req, res, next) => {
      if (!req.url?.startsWith("/development/local-api/")) return next();
      if (req.headers.host !== "127.0.0.1:5192" || !["127.0.0.1", "::ffff:127.0.0.1"].includes(req.socket.remoteAddress ?? "")) { res.statusCode = 403; res.end("Local origin required"); return; }
      try {
        const parts: Buffer[] = []; let size = 0;
        for await (const chunk of req) { size += chunk.length; if (size > 8192) { res.statusCode = 413; res.end("Request too large"); return; } parts.push(Buffer.from(chunk)); }
        const requestHeaders = new Headers();
        for (const [key, value] of Object.entries(req.headers)) if (value) requestHeaders.set(key, Array.isArray(value) ? value.join(",") : value);
        const response = await handler(new Request(origin + req.url, { method: req.method, headers: requestHeaders, body: ["GET", "HEAD"].includes(req.method ?? "GET") ? undefined : Buffer.concat(parts) }));
        res.statusCode = response.status;
        for (const [key, value] of response.headers) if (key !== "set-cookie") res.setHeader(key, value);
        if (response.headers.getSetCookie().length) res.setHeader("Set-Cookie", response.headers.getSetCookie());
        res.end(await response.text());
      } catch { res.statusCode = 503; res.end("Local harness unavailable"); }
    });
  } };
}
