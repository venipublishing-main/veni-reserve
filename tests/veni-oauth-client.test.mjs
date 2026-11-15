// @ts-nocheck — Node 24 executes the TypeScript module directly; the repository
// typechecks its production TypeScript separately, while this .mjs mock suite is
// validated at runtime with node --experimental-strip-types --test.
import test from "node:test";
import assert from "node:assert/strict";
import { createHash, randomBytes } from "node:crypto";
import { readFileSync } from "node:fs";
import { createLocalVeniOAuth, LOCAL_APP_ORIGIN, LOCAL_SUPABASE_ORIGIN } from "../app/lib/veni-oauth-client.server.ts";

const CLIENT = "11111111-2222-4333-8444-555555555555";
const USER = "aaaaaaaa-bbbb-4ccc-8ddd-eeeeeeeeeeee";
const SESSION = "bbbbbbbb-cccc-4ddd-8eee-ffffffffffff";
const NOW = 1920000000000;
const COOKIE_KEY = randomBytes(32).toString("base64url");
const BASE = { appOrigin: LOCAL_APP_ORIGIN, providerOrigin: LOCAL_SUPABASE_ORIGIN,
  clientId: CLIENT, clientSecret: "fictional-local-secret-0123456789",
  publishableKey: "sb_publishable_fictional_local_example_only", cookieKey: COOKIE_KEY };
const json = (object, status = 200) => Response.json(object, { status });
const encode = (object) => Buffer.from(JSON.stringify(object)).toString("base64url");
const makeToken = (overrides = {}) => `${encode({ alg: "HS256", typ: "JWT" })}.${encode({
  sub: USER, client_id: CLIENT, session_id: SESSION, role: "authenticated",
  exp: NOW / 1000 + 3600, ...overrides
})}.fictionsignature`;
const getCookies = response => response.headers.getSetCookie().map(value => value.split(";")[0]);
const cookieValue = (response, name) => getCookies(response).find(value => value.startsWith(`${name}=`));
const request = (path, cookies = [], method = "GET") => new Request(`${LOCAL_APP_ORIGIN}${path}`, {
  method, headers: { Cookie: cookies.filter(Boolean).join("; ") }
});

function mockClient({ token = makeToken(), userId = USER, liveId = USER, tokenResponseStatus = 200,
  authStatus = 200, liveStatus = 200, clock = () => NOW, config = BASE } = {}) {
  const calls = [];
  const fetcher = async (url, init) => {
    calls.push({ url, init });
    assert.equal(init.redirect, "error");
    assert.ok(url.startsWith(`${LOCAL_SUPABASE_ORIGIN}/`), "no external network hosts");
    const endpoint = new URL(url).pathname;
    if (endpoint === "/auth/v1/oauth/token") return json({ access_token: token, token_type: "bearer" }, tokenResponseStatus);
    if (endpoint === "/auth/v1/user") return json({ id: userId, email: "never-expose@example.test" }, authStatus);
    if (endpoint === "/rest/v1/rpc/current_reserve_user") return json(liveId, liveStatus);
    throw Error(`Unexpected provider path: ${endpoint}`);
  };
  return { client: createLocalVeniOAuth(config, { fetcher, clock }), calls };
}

async function initiate(client, next = "/app") {
  const response = await client.begin(request(`/auth/veni/start?next=${encodeURIComponent(next)}`));
  assert.equal(response.status, 303);
  const loc = new URL(response.headers.get("Location"));
  assert.equal(loc.origin, LOCAL_SUPABASE_ORIGIN);
  assert.equal(loc.pathname, "/auth/v1/oauth/authorize");
  assert.equal(loc.searchParams.get("response_type"), "code");
  assert.equal(loc.searchParams.get("scope"), "email");
  assert.equal(loc.searchParams.get("client_id"), CLIENT);
  assert.equal(loc.searchParams.get("redirect_uri"), `${LOCAL_APP_ORIGIN}/auth/veni/callback`);
  assert.equal(loc.searchParams.get("code_challenge_method"), "S256");
  assert.match(loc.searchParams.get("code_challenge"), /^[\w-]{43}$/);
  const transactionCookie = cookieValue(response, "vr_local_oauth_transaction");
  assert.ok(transactionCookie);
  assert.ok(response.headers.getSetCookie()[0].includes("HttpOnly; SameSite=Lax; Path=/; Max-Age=300"));
  return { loc, transactionCookie };
}

async function finish(client, { loc, transactionCookie }, options = {}) {
  const callbackUrl = new URL("/auth/veni/callback", LOCAL_APP_ORIGIN);
  callbackUrl.searchParams.set("state", options.state ?? loc.searchParams.get("state"));
  callbackUrl.searchParams.set("code", options.code ?? "synthetic-once-only-code-123456");
  return client.callback(new Request(callbackUrl, { headers: { Cookie: transactionCookie } }));
}

test("never configures nonloopback origins, weak secrets, or incorrect key length", () => {
  for (const invalid of [
    { appOrigin: "https://reserve.example" }, { providerOrigin: "https://project.supabase.co" },
    { clientId: "bad" }, { clientSecret: "short" }, { cookieKey: "abcd" },
    { publishableKey: "short" }
  ]) assert.throws(() => createLocalVeniOAuth({ ...BASE, ...invalid }), /not approved/);
});

test("route manifest keeps OAuth exclusive to nonproduction, nonpreview local builds and before the blocked catchall", () => {
  const routes = readFileSync(new URL("../app/routes.ts", import.meta.url), "utf8");
  assert.match(routes, /VENI_LOCAL_OAUTH === "1"/);
  assert.match(routes, /NODE_ENV !== "production" && !preview/);
  assert.ok(routes.indexOf('route("auth/veni/callback"') < routes.indexOf('route("auth/*"'));
  const adapter = readFileSync(new URL("../app/lib/veni-oauth-config.server.ts", import.meta.url), "utf8");
  assert.match(adapter, /import\.meta\.env\.DEV/);
  assert.match(adapter, /env\.VENI_ENV !== "dev"/);
  assert.match(adapter, /url\.origin !== LOCAL_APP_ORIGIN/);
});

test("starts code+PKCE flow with opaque state and strictly bounded next", async () => {
  const { client } = mockClient();
  const first = await initiate(client, "/app/settings");
  const second = await initiate(client, "/app/settings");
  assert.notEqual(first.loc.searchParams.get("state"), second.loc.searchParams.get("state"));
  assert.notEqual(first.loc.searchParams.get("code_challenge"), second.loc.searchParams.get("code_challenge"));
  assert.doesNotMatch(first.transactionCookie, /synthetic|secret|verifier|settings/);
  const unsafe = await initiate(client, "https://attacker.test/callback");
  const result = await finish(client, unsafe);
  assert.equal(result.status, 303);
  const account = await client.status(request("/development/veni-account", [cookieValue(result, "vr_local_oauth_session")]));
  assert.equal((await account.json()).intendedDestination, "/app");
  assert.equal((await client.begin(request("/auth/veni/start?next=/app&next=/app"))).status, 400);
  assert.equal((await client.begin(request("/auth/veni/start?evil=1"))).status, 400);
  assert.equal((await client.begin(request("/auth/veni/start", [], "POST"))).status, 404);
  assert.equal((await client.begin(new Request("https://reserve.example/auth/veni/start"))).status, 404);
});

test("successful callback exchanges code with server-only credentials then verifies Auth and live RLS session", async () => {
  const { client, calls } = mockClient();
  const flow = await initiate(client, "/app/onboarding");
  const result = await finish(client, flow);
  assert.equal(result.status, 303);
  assert.equal(result.headers.get("Location"), "/development/veni-account");
  assert.deepEqual(calls.map(c => new URL(c.url).pathname), [
    "/auth/v1/oauth/token", "/auth/v1/user", "/rest/v1/rpc/current_reserve_user"
  ]);
  const tokenRequest = calls[0].init;
  assert.equal(tokenRequest.method, "POST");
  assert.equal(tokenRequest.headers.Authorization, `Basic ${Buffer.from(`${CLIENT}:${BASE.clientSecret}`).toString("base64")}`);
  assert.equal(tokenRequest.body.get("grant_type"), "authorization_code");
  assert.equal(tokenRequest.body.get("code"), "synthetic-once-only-code-123456");
  assert.equal(tokenRequest.body.get("redirect_uri"), `${LOCAL_APP_ORIGIN}/auth/veni/callback`);
  const verifier = tokenRequest.body.get("code_verifier");
  assert.match(verifier, /^[\w-]{43}$/);
  assert.equal(createHash("sha256").update(verifier).digest("base64url"), flow.loc.searchParams.get("code_challenge"));
  assert.equal(calls[1].init.headers.Authorization, `Bearer ${makeToken()}`);
  assert.equal(calls[2].init.method, "POST");
  assert.equal(calls[2].init.headers.apikey, BASE.publishableKey);
  const sessionCookie = cookieValue(result, "vr_local_oauth_session");
  assert.ok(sessionCookie);
  assert.ok(result.headers.getSetCookie().some(s => s.startsWith("vr_local_oauth_transaction=;")));
  const status = await client.status(request("/development/veni-account", [sessionCookie]));
  assert.equal(status.status, 200);
  assert.deepEqual(await status.json(), { connected: true, subject: USER,
    expiresAt: NOW / 1000 + 300, intendedDestination: "/app/onboarding", productAccess: "not_granted" });
  assert.doesNotMatch(JSON.stringify(await result.text()), /never-expose@example/);
});

test("rejects state mismatch, absent cookie, duplicate query, malformed and provider error results", async () => {
  const { client, calls } = mockClient();
  const flow = await initiate(client);
  assert.equal((await finish(client, flow, { state: "different-state-value-1234567890" })).status, 400);
  assert.equal(calls.length, 0, "no provider calls before state passes");
  const valid = `/auth/veni/callback?state=${flow.loc.searchParams.get("state")}&code=synthetic-once-only-code-123456`;
  assert.equal((await client.callback(request(valid))).status, 503);
  assert.equal((await client.callback(request(`${valid}&code=another-code-1234567890`, [flow.transactionCookie]))).status, 400);
  const denied = new URL("/auth/veni/callback", LOCAL_APP_ORIGIN);
  denied.searchParams.set("state", flow.loc.searchParams.get("state"));
  denied.searchParams.set("error", "access_denied");
  const deniedResult = await client.callback(new Request(denied, { headers: { Cookie: flow.transactionCookie } }));
  assert.equal(deniedResult.status, 303);
  assert.equal(deniedResult.headers.get("Location"), "/login");
  assert.equal(calls.length, 0);
});

test("never grants an account for unverified, revoked, expired, mismatched-client or anonymous tokens", async () => {
  const cases = [
    { options: { authStatus: 401 } },
    { options: { userId: "aaaaaaaa-bbbb-4ccc-8ddd-000000000000" } },
    { options: { liveId: null } },
    { options: { liveStatus: 403 } },
    { options: { token: makeToken({ client_id: "33333333-2222-4333-8444-555555555555" }) } },
    { options: { token: makeToken({ session_id: null }) } },
    { options: { token: makeToken({ exp: NOW / 1000 - 1 }) } },
    { options: { token: makeToken({ is_anonymous: true }) } },
    { options: { token: "not-a-jwt" } }
  ];
  for (const { options } of cases) {
    const { client } = mockClient(options);
    const flow = await initiate(client);
    const response = await finish(client, flow);
    assert.equal(response.status, 503, JSON.stringify(options));
    assert.equal(cookieValue(response, "vr_local_oauth_session"), undefined);
    assert.ok(cookieValue(response, "vr_local_oauth_transaction"));
  }
});

test("rejects tampered, expired and differently keyed session cookies, including revoked sessions after connection", async () => {
  let current = NOW;
  let revoked = false;
  const token = makeToken();
  const fetcher = async url => {
    const path = new URL(url).pathname;
    return path.endsWith("/oauth/token") ? json({ access_token: token, token_type: "bearer" }) :
      path.endsWith("/user") ? json({ id: USER }) : json(revoked ? null : USER);
  };
  const client = createLocalVeniOAuth(BASE, { fetcher, clock: () => current });
  const first = await finish(client, await initiate(client));
  const sessionCookie = cookieValue(first, "vr_local_oauth_session");
  assert.equal((await client.status(request("/development/veni-account", [sessionCookie]))).status, 200);
  revoked = true;
  assert.equal((await client.status(request("/development/veni-account", [sessionCookie]))).status, 401);
  revoked = false;
  const modified = `${sessionCookie.slice(0, -1)}${sessionCookie.endsWith("a") ? "b" : "a"}`;
  assert.equal((await client.status(request("/development/veni-account", [modified]))).status, 401);
  const other = createLocalVeniOAuth({ ...BASE, cookieKey: randomBytes(32).toString("base64url") }, { fetcher, clock: () => current });
  assert.equal((await other.status(request("/development/veni-account", [sessionCookie]))).status, 401);
  current += 301000;
  assert.equal((await client.status(request("/development/veni-account", [sessionCookie]))).status, 401);
  const lateFlow = await initiate(client);
  current += 301000;
  assert.equal((await finish(client, lateFlow)).status, 400);
});

test("never accepts remote, cross-origin, duplicate, non-GET or query-bearing status requests", async () => {
  const { client } = mockClient();
  assert.equal((await client.status(request("/development/veni-account?a=1"))).status, 404);
  assert.equal((await client.status(request("/development/veni-account", [], "POST"))).status, 404);
  assert.equal((await client.status(new Request("https://example.test/development/veni-account"))).status, 404);
  assert.equal((await client.status(request("/development/veni-account", [
    "vr_local_oauth_session=a", "vr_local_oauth_session=b"
  ]))).status, 401);
});
