import { rejectAccountWrite, requireProductSession } from "./product-access.server";

export const previewEnvironment = (environment: string) => environment === "app_preview";
export function previewHeaders(nonce: string) {
  return {
    "Cache-Control": "no-store",
    "X-Robots-Tag": "noindex, nofollow",
    "Content-Security-Policy": `default-src 'none'; script-src 'self' 'nonce-${nonce}'; style-src 'self' 'unsafe-inline'; img-src 'self' blob: data:; font-src 'self'; connect-src 'self'; object-src 'none'; base-uri 'none'; form-action 'none'; frame-ancestors 'none'`,
    "X-Content-Type-Options": "nosniff", "X-Frame-Options": "DENY",
    "Referrer-Policy": "no-referrer",
    "Strict-Transport-Security": "max-age=31536000",
    "Permissions-Policy": "camera=(), microphone=(), geolocation=(), payment=()",
  };
}
/** No credential parsing and no provider dispatch. Apply before React Router. */
export async function previewBoundary(request: Request, source: string): Promise<Response | null> {
  const path = new URL(request.url).pathname;
  if (!["GET", "HEAD"].includes(request.method)) return rejectAccountWrite(request);
  if (path === "/__preview/version") return Response.json({ source, artifact: "reserve-ssr-preview-v1" });
  if (path === "/health") return Response.json({ status: "ok", service: "veni-reserve", environment: "app_preview" });
  if (path === "/ready") return Response.json({ status: "unavailable", reason: "preview_has_no_backend" }, { status: 503 });
  if (/^\/app(?:\/|$)/i.test(path)) return requireProductSession(request);
  if (/^\/(?:api|auth|book)(?:\/|$)/i.test(path)) return Response.json({ error: { code: "preview_operation_disabled" } }, { status: 503 });
  if (/^\/development(?:\/|$)/i.test(path) || /(?:^|\/)(?:\.|wrangler|package|pnpm|workers|supabase|node_modules)/i.test(path) || path.endsWith(".map")) return new Response("Not found", { status: 404 });
  return null;
}
