const MAX_TX_SECONDS = 300;
const MAX_SESSION_SECONDS = 300; // No refresh token persistence in this pilot.
const UUID = /^[a-f0-9]{8}(?:-[a-f0-9]{4}){3}-[a-f0-9]{12}$/i;
const TOKEN = /^[A-Za-z0-9_-]+\.[A-Za-z0-9_-]+\.[A-Za-z0-9_-]+$/;
const OPAQUE = /^[A-Za-z0-9_-]{20,200}$/;
const nextPaths = new Set(["/app", "/app/onboarding", "/app/customize", "/app/settings"]);

export type ReserveOAuthConfig = {
  appOrigin: string;
  providerOrigin: string;
  clientId: string;
  clientSecret: string;
  publishableKey: string;
  cookieKey: string; // 32 cryptographically random bytes, base64url; server-only.
};

type Dependencies = {
  fetcher?: typeof fetch;
  clock?: () => number;
  random?: (length: number) => Uint8Array<ArrayBuffer>;
};
type Tx = { kind: "tx"; state: string; verifier: string; next: string; expires: number };
type Session = { kind: "session"; token: string; subject: string; next: string; expires: number };

const privateHeaders = {
  "Cache-Control": "no-store, max-age=0",
  "Referrer-Policy": "no-referrer",
  "X-Robots-Tag": "noindex, nofollow",
  "X-Content-Type-Options": "nosniff"
};
const encoder = new TextEncoder();
const decoder = new TextDecoder();
const safeNext = (value: string | null) => value && nextPaths.has(value) ? value : "/app";
const fail = (status = 400) => Response.json({ error: "veni_account_oauth_unavailable" }, { status, headers: privateHeaders });
const bytes = (length: number) => crypto.getRandomValues(new Uint8Array(length));
const b64 = (u: Uint8Array) => btoa(String.fromCharCode(...u)).replace(/\+/g, "-").replace(/\//g, "_").replace(/=+$/, "");

function fromB64(value: string) {
  if (!/^[A-Za-z0-9_-]+$/.test(value) || value.length > 10000) throw new Error("invalid encoding");
  const raw = atob(value.replace(/-/g, "+").replace(/_/g, "/") + "=".repeat((4 - value.length % 4) % 4));
  return Uint8Array.from(raw, letter => letter.charCodeAt(0));
}

function readCookie(request: Request, name: string) {
  const pairs = (request.headers.get("Cookie") || "").split(";").map(part => part.trim());
  const found = pairs.filter(part => part.startsWith(`${name}=`));
  return found.length === 1 ? found[0].slice(name.length + 1) : "";
}
function redirect(location: string, cookies: string[] = []) {
  const response = new Response(null, { status: 303, headers: { ...privateHeaders, Location: location } });
  for (const setCookie of cookies) response.headers.append("Set-Cookie", setCookie);
  return response;
}

export const PRIMARY_PROVIDER = "https://droslqfcazwkwvqlbtsq.supabase.co";
export const STAGING_ORIGIN = "https://vf-reserve-stg.veni-reserve.workers.dev";
export const TEST_ORIGIN = "http://127.0.0.1:5193";
export const TEST_PROVIDER = "http://127.0.0.1:56321";

function validConfig(config: ReserveOAuthConfig) {
  if (!config || !((config.appOrigin === STAGING_ORIGIN && config.providerOrigin === PRIMARY_PROVIDER) ||
      (config.appOrigin === TEST_ORIGIN && config.providerOrigin === TEST_PROVIDER)) ||
      !UUID.test(config.clientId) || typeof config.clientSecret !== "string" ||
      config.clientSecret.length < 16 || config.clientSecret.length > 200 ||
      /[^\x21-\x7E]/.test(config.clientSecret) || typeof config.publishableKey !== "string" ||
      config.publishableKey.length < 12 || typeof config.cookieKey !== "string") return false;
  try { return fromB64(config.cookieKey).length === 32; } catch { return false; }
}

function boundedQuery(url: URL, allowed: readonly string[]) {
  if (url.search.length > 2048) return false;
  const seen = new Set<string>();
  for (const key of url.searchParams.keys()) {
    if (!allowed.includes(key) || seen.has(key)) return false;
    seen.add(key);
  }
  return true;
}

function jwtClaimsAfterAuthCheck(token: string) {
  if (token.length > 8192 || !TOKEN.test(token)) throw new Error("invalid token");
  const part = token.split(".")[1];
  const claims: unknown = JSON.parse(decoder.decode(fromB64(part)));
  if (!claims || typeof claims !== "object" || Array.isArray(claims)) throw new Error("invalid claims");
  return claims as Record<string, unknown>;
}

export function createReserveOAuth(config: ReserveOAuthConfig, { fetcher = fetch, clock = Date.now, random = bytes }: Dependencies = {}) {
  if (!validConfig(config)) throw new Error("Invalid Reserve OAuth configuration");
  const secure = config.appOrigin === STAGING_ORIGIN;
  const TX = (secure ? "__Host-" : "") + "vr_transaction";
  const SESSION = (secure ? "__Host-" : "") + "vr_session";
  const AUTH = config.providerOrigin + "/auth/v1";
  const CALLBACK = config.appOrigin + "/auth/veni/callback";
  function cookie(name: string, value: string, age: number) {
    return name + "=" + value + "; HttpOnly; SameSite=Lax; Path=/; Max-Age=" + age + (secure ? "; Secure" : "");
  }
  const now = () => Math.floor(clock() / 1000);
  const scopedKey = async () => crypto.subtle.importKey("raw", fromB64(config.cookieKey), "AES-GCM", false, ["encrypt", "decrypt"]);

  async function seal(value: Tx | Session, purpose: string) {
    const iv = random(12);
    if (iv.length !== 12) throw new Error("invalid IV");
    const encrypted = await crypto.subtle.encrypt({ name: "AES-GCM", iv: Uint8Array.from(iv),
      additionalData: encoder.encode(`reserve-oauth-v1|${purpose}|${config.appOrigin}|${config.clientId}`) },
    await scopedKey(), encoder.encode(JSON.stringify(value)));
    return `${b64(iv)}.${b64(new Uint8Array(encrypted))}`;
  }
  async function unseal(serialized: string, purpose: string): Promise<Tx | Session> {
    if (serialized.length > 4000 || !/^[A-Za-z0-9_-]+\.[A-Za-z0-9_-]+$/.test(serialized)) throw new Error("invalid cookie");
    const [a, b] = serialized.split(".");
    const decrypted = await crypto.subtle.decrypt({ name: "AES-GCM", iv: fromB64(a),
      additionalData: encoder.encode(`reserve-oauth-v1|${purpose}|${config.appOrigin}|${config.clientId}`) },
    await scopedKey(), fromB64(b));
    const value: unknown = JSON.parse(decoder.decode(decrypted));
    if (!value || typeof value !== "object" || Array.isArray(value)) throw new Error("invalid session data");
    return value as Tx | Session;
  }
  function allowed(request: Request) {
    const u = new URL(request.url);
    return u.origin === config.appOrigin && request.method === "GET";
  }
  function fetchProvider(path: string, init: RequestInit) {
    return fetcher(`${config.providerOrigin}${path}`, { ...init,
      // Never follow a provider redirect. Manual mode works in the local Worker
      // runtime; every 3xx is rejected below alongside other non-2xx statuses.
      redirect: "manual", signal: AbortSignal.timeout(5000) });
  }
  async function providerRequest(path: string, init: RequestInit) {
    const response = await fetchProvider(path, init);
    if (!response.ok) throw new Error("provider rejected");
    return response;
  }
  async function activeSubject(token: string) {
    const authResponse = await providerRequest("/auth/v1/user", { headers: {
      apikey: config.publishableKey, Authorization: `Bearer ${token}`
    }});
    const user: unknown = await authResponse.json();
    if (!user || typeof user !== "object" || Array.isArray(user) ||
        !UUID.test(String((user as Record<string, unknown>).id))) throw new Error("user verification failed");
    const subject = (user as Record<string, unknown>).id;

    // A signed JWT can survive logout: the database RPC checks auth.sessions.
    const liveResponse = await providerRequest("/rest/v1/rpc/reserve_current_reserve_user", {
      method: "POST", headers: { apikey: config.publishableKey,
        Authorization: `Bearer ${token}`, "Content-Type": "application/json" }, body: "{}"
    });
    const liveId: unknown = await liveResponse.json();
    if (liveId !== subject) throw new Error("revoked or unauthorized session");

    // Claim values are consumed ONLY after Auth and the RLS RPC validated this JWT.
    const claims = jwtClaimsAfterAuthCheck(token);
    if (claims.iss !== AUTH || claims.aud !== "authenticated" || claims.sub !== subject || claims.client_id !== config.clientId || !UUID.test(String(claims.session_id)) ||
        claims.role !== "authenticated" || claims.is_anonymous === true ||
        typeof claims.exp !== "number" || claims.exp <= now()) throw new Error("invalid verified JWT claims");
    return { subject: String(subject), expires: claims.exp };
  }

  async function begin(request: Request) {
    if (!allowed(request)) return fail(404);
    const url = new URL(request.url);
    if (!boundedQuery(url, ["next"])) return fail();
    const next = safeNext(url.searchParams.get("next"));
    const state = b64(random(32));
    const verifier = b64(random(32));
    if (!OPAQUE.test(state) || !/^[A-Za-z0-9_-]{43,128}$/.test(verifier)) return fail(503);
    const challenge = b64(new Uint8Array(await crypto.subtle.digest("SHA-256", encoder.encode(verifier))));
    const transaction: Tx = { kind: "tx", state, verifier, next, expires: now() + MAX_TX_SECONDS };
    const serialized = await seal(transaction, "tx");
    const authorization = new URL(`${AUTH}/oauth/authorize`);
    authorization.search = new URLSearchParams({ response_type: "code", client_id: config.clientId,
      redirect_uri: CALLBACK, state, code_challenge: challenge, code_challenge_method: "S256",
      scope: "email" }).toString();
    return redirect(authorization.href, [cookie(TX, serialized, MAX_TX_SECONDS)]);
  }

  async function callback(request: Request) {
    if (!allowed(request) || new URL(request.url).pathname !== "/auth/veni/callback") return fail(404);
    const clear = cookie(TX, "", 0);
    const failWithClear = (status: number) => { const r = fail(status); r.headers.append("Set-Cookie", clear); return r; };
    try {
      const url = new URL(request.url);
      if (!boundedQuery(url, ["code", "state", "iss", "error", "error_description", "error_uri"])) return failWithClear(400);
      if (url.searchParams.has("iss") && url.searchParams.get("iss") !== `${AUTH}`) return failWithClear(400);
      const state = url.searchParams.get("state");
      if (!state || !OPAQUE.test(state)) return failWithClear(400);
      const transaction = await unseal(readCookie(request, TX), "tx");
      if (transaction.kind !== "tx" || transaction.expires <= now() || transaction.state !== state ||
          !OPAQUE.test(transaction.state) || !/^[A-Za-z0-9_-]{43,128}$/.test(transaction.verifier)) return failWithClear(400);
      if (url.searchParams.has("error")) {
        if (url.searchParams.has("code") || url.searchParams.get("error") !== "access_denied") return failWithClear(400);
        return redirect("/", [clear]);
      }
      const code = url.searchParams.get("code");
      if (!code || !OPAQUE.test(code) || url.searchParams.has("error_description") ||
          url.searchParams.has("error_uri")) return failWithClear(400);
      const body = new URLSearchParams({ grant_type: "authorization_code", code,
        redirect_uri: CALLBACK, code_verifier: transaction.verifier });
      const credentials = btoa(`${config.clientId}:${config.clientSecret}`);
      const tokenResponse = await providerRequest("/auth/v1/oauth/token", { method: "POST", headers: {
        apikey: config.publishableKey, Authorization: `Basic ${credentials}`,
        "Content-Type": "application/x-www-form-urlencoded"
      }, body });
      const received: unknown = await tokenResponse.json();
      if (!received || typeof received !== "object" || Array.isArray(received)) return failWithClear(503);
      const values = received as Record<string, unknown>;
      const token = values.access_token;
      if (typeof token !== "string" || token.length > 8192 || !TOKEN.test(token) ||
          String(values.token_type).toLowerCase() !== "bearer") return failWithClear(503);
      const verified = await activeSubject(token);
      const lifetime = Math.min(MAX_SESSION_SECONDS, verified.expires - now());
      if (lifetime <= 0) return failWithClear(503);
      const session: Session = { kind: "session", token, subject: verified.subject,
        next: transaction.next, expires: now() + lifetime };
      const sealed = await seal(session, "session");
      if (sealed.length > 3800) return failWithClear(503);
      return redirect(transaction.next, [clear, cookie(SESSION, sealed, lifetime)]);
    } catch { return failWithClear(503); }
  }

  async function sessionFromCookie(request: Request) {
    if (new URL(request.url).origin !== config.appOrigin) return null;
    try {
      const session = await unseal(readCookie(request, SESSION), "session");
      if (session.kind !== "session" || session.expires <= now()) return null;
      return session;
    } catch { return null; }
  }
  async function currentSession(request: Request) {
    const session = await sessionFromCookie(request);
    if (!session) return null;
    try {
      const verified = await activeSubject(session.token);
      if (verified.subject !== session.subject) return null;
      return { id: verified.subject, token: session.token };
    } catch { return null; }
  }
  async function signOut(request: Request) {
    if (new URL(request.url).origin !== config.appOrigin || request.method !== "POST" ||
        request.headers.get("origin") !== config.appOrigin) return fail(403);
    // The sealed session identifies the token to revoke. An unavailable
    // identity lookup must never be mistaken for successful revocation.
    const session = await sessionFromCookie(request);
    if (session) {
      try {
        const response = await fetchProvider("/auth/v1/logout?scope=local", { method: "POST",
          headers: { apikey: config.publishableKey, Authorization: "Bearer " + session.token } });
        if (!response.ok) {
          if (response.status !== 401 && response.status !== 403) return fail(503);
          const { error_code } = await response.json() as { error_code?: string };
          if (error_code !== "session_not_found" && error_code !== "user_not_found" &&
              error_code !== "session_expired") return fail(503);
        }
      } catch { return fail(503); }
    }
    const receiptName = (secure ? "__Host-" : "") + "vr_setup_request";
    return redirect("/", [cookie(SESSION, "", 0), cookie(TX, "", 0), cookie(receiptName, "", 0)]);
  }
  return { begin, callback, currentSession, signOut };
}
