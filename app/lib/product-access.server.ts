import { accountEntry, safeReturnPath } from "../features/site/navigation";

export const privateHeaders = { "Cache-Control": "no-store", "Referrer-Policy": "no-referrer", "X-Robots-Tag": "noindex, nofollow" };

/** Intentionally no provider adapter yet. Cookies, bearer tokens, emails and client
 * tenant/role claims cannot unlock these routes. Replace only after identity review. */
export async function requireProductSession(request: Request) {
  if (!["GET", "HEAD"].includes(request.method)) return rejectAccountWrite(request);
  const next = safeReturnPath(new URL(request.url).pathname);
  return new Response(null, { status: 302, headers: { ...privateHeaders, Location: accountEntry("login", next) } });
}
export function unavailable() {
  return Response.json({ error: { code: "shared_identity_not_configured" } }, { status: 503, headers: privateHeaders });
}
export function localReviewAllowed(request: Request, developmentBuild: boolean, environment: string) {
  const u = new URL(request.url);
  return developmentBuild && environment === "dev" && ["127.0.0.1", "localhost", "[::1]"].includes(u.hostname)
    && u.protocol === "http:" && ["GET", "HEAD"].includes(request.method);
}

/** Consume a bounded opaque rejected body without parsing, retaining or logging it.
 * Returning before small POST bodies finish can poison local workerd keep-alive. */
export async function rejectAccountWrite(request: Request) {
  const reader = request.body?.getReader();
  if (!reader) return unavailable();
  let size = 0;
  try {
    for (;;) {
      const { done, value } = await reader.read();
      if (done) break;
      size += value.byteLength;
      if (size > 8192) return Response.json({ error: { code: "body_too_large" } }, { status: 413, headers: privateHeaders });
    }
    return unavailable();
  } catch { return unavailable(); }
  finally { reader.releaseLock(); }
}
