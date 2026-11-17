import { env } from "cloudflare:workers";
import type { LoaderFunctionArgs } from "react-router";
import { reserveAccount } from "../lib/reserve-account.server";
import { privateHeaders, unavailable } from "../lib/product-access.server";
import { tenantWorkspace } from "../lib/tenant-workspace.server";

export async function loader({ request, params }: LoaderFunctionArgs) {
  const account = reserveAccount(request, env);
  if (!account) return unavailable();
  const url = new URL(request.url);
  const error = (code: string, status: number) => Response.json({ error: code }, { status, headers: privateHeaders });
  if (request.method !== "GET" && (request.headers.get("Origin") !== url.origin ||
      !["same-origin", null].includes(request.headers.get("Sec-Fetch-Site")))) return error("origin_required", 403);
  const path = "/" + params["*"];
  if (path === "/logout") return account.signOut(request);
  const session = await account.currentSession(request);
  if (!session) return error("unauthenticated", 401);
  const secure = url.protocol === "https:";
  const name = secure ? "__Host-vr_setup_request" : "vr_setup_request";
  const receipts = (request.headers.get("Cookie") ?? "").split(";").map(v => v.trim()).filter(v => v.startsWith(name + "="));
  const key = receipts.length === 1 ? receipts[0].slice(name.length + 1) : "";
  const receipt = (v: string) => name + "=" + v + "; HttpOnly; SameSite=Strict; Path=/; Max-Age=3600" + (secure ? "; Secure" : "");
  try {
    if (request.body) {
      if (request.headers.get("Content-Type")?.split(";")[0].trim() !== "application/json") return error("unsupported_media_type", 415);
      // Bound streamed bodies too, including requests without Content-Length.
      const reader = request.body.getReader();
      const buffer = new Uint8Array(16384);
      let length = 0;
      try {
        for (;;) {
          const chunk = await reader.read();
          if (chunk.done) break;
          if (length + chunk.value.length > buffer.length) return error("body_too_large", 413);
          buffer.set(chunk.value, length);
          length += chunk.value.length;
        }
      } finally { reader.releaseLock(); }
      request = new Request(url, { method: request.method, headers: request.headers, body: buffer.subarray(0, length) });
    }
    return await tenantWorkspace(request, path, { id: session.id }, session.token, key, receipt, env,
      (name, token, body = {}) => fetch(env.SUPABASE_URL + "/rest/v1/rpc/reserve_" + name, {
        method: "POST", redirect: "manual", signal: AbortSignal.timeout(5000),
        headers: { apikey: env.SUPABASE_PUBLISHABLE_KEY!, Authorization: "Bearer " + token, "Content-Type": "application/json" },
        body: JSON.stringify(body) }));
  } catch { return error("dependency_unavailable", 503); }
}
export const action = loader;
