/** CI-only disposable Supabase OAuth2 authorization-code/PKCE + Reserve HTTP proof.
 * Uses a real local GoTrue instance, fictional user, temporary OAuth client and
 * Worker development server. It NEVER accepts a hosted Supabase origin. */
import assert from "node:assert/strict";
import { spawn, execFileSync } from "node:child_process";
import console from "node:console";
import { randomBytes, randomUUID } from "node:crypto";
import { existsSync, writeFileSync, unlinkSync } from "node:fs";
import { createRequire } from "node:module";
import { dirname, join } from "node:path";
import process from "node:process";
import { setTimeout as delay } from "node:timers/promises";
import { fileURLToPath, URL } from "node:url";

const ROOT = fileURLToPath(new URL("../", import.meta.url));
const APP = "http://127.0.0.1:5193";
const PROVIDER = "http://127.0.0.1:54321";
const CALLBACK = `${APP}/auth/veni/callback`;
const DEV_VARS = join(ROOT, ".dev.vars");
const ID = /^[a-f0-9]{8}(?:-[a-f0-9]{4}){3}-[a-f0-9]{12}$/i;
const proofStages = new Set(["validate-callback", "exchange-oauth-code", "parse-oauth-token",
  "verify-auth-user", "verify-live-rpc", "verify-claims", "seal-local-session"]);
const safeProofStage = value => proofStages.has(value) ||
  /^token-http-(?:0|301|302|303|307|308|400|401|403|404|429|500|502|503)-(?:unclassified|invalid-client|invalid-grant|invalid-request|unauthorized-client|unsupported-grant-type|invalid-scope|server-error)$/.test(value) ||
  /^token-fetch-(?:type-error|timeout-error|abort-error|other)-(?:refused|dns|timeout|other)$/.test(value);
const require = createRequire(import.meta.url);
const cli = join(dirname(require.resolve("supabase/package.json")), "dist/supabase.js");
const flags = { redirect: "manual" };
let phase = "guard";
let apiKey = "";
let serviceKey = "";
let userId = "";
let clientId = "";
let appProcess;
let assertions = 0;
let createdDevVars = false;
let finished = false;
let proofTrace = "";
let outputTail = "";

function check(test, label) {
  assert.ok(test, label);
  assertions++;
}
function localUrl(path) {
  const u = new URL(path, PROVIDER);
  if (u.origin !== PROVIDER) throw Error("Refusing a remote provider URL");
  return u;
}
async function provider(path, init = {}) {
  return globalThis.fetch(localUrl(path), { ...flags, ...init,
    signal: globalThis.AbortSignal.timeout(8000),
    headers: { apikey: apiKey, ...init.headers } });
}
async function admin(path, method, body) {
  const response = await provider(path, { method, headers: {
    Authorization: `Bearer ${serviceKey}`, "Content-Type": "application/json"
  }, body: body === undefined ? undefined : JSON.stringify(body) });
  check(response.ok, `local admin ${method} endpoint`);
  return response;
}
function cookie(response, name) {
  const entry = response.headers.getSetCookie().find(value => value.startsWith(`${name}=`));
  return entry?.split(";")[0] ?? "";
}
function redirectUrl(response, origin) {
  check(response.status >= 300 && response.status < 400, "redirect status");
  const value = response.headers.get("Location");
  check(!!value, "location present");
  return new URL(value, origin);
}
async function browser(url, cookieHeader = "") {
  const resolved = new URL(url, APP);
  check(resolved.origin === APP, "browser request remains local to Reserve");
  return globalThis.fetch(resolved, { ...flags, signal: globalThis.AbortSignal.timeout(8000),
    headers: cookieHeader ? { Cookie: cookieHeader } : {} });
}
async function waitForApp() {
  for (let i = 0; i < 60; i++) {
    if (appProcess.exitCode !== null) throw Error("Reserve dev process exited");
    try {
      const response = await browser("/health");
      if (response.status === 200) return;
    } catch { /* Vite is still starting; never log request details. */ }
    await delay(1000);
  }
  throw Error("Reserve local app did not become ready");
}
async function beginAndInspect(firstPartyToken, expectedNext) {
  const start = await browser(`/auth/veni/start?next=${encodeURIComponent(expectedNext)}`);
  const authorize = redirectUrl(start, APP);
  check(authorize.origin === PROVIDER && authorize.pathname === "/auth/v1/oauth/authorize", "real provider authorize endpoint");
  check(authorize.searchParams.get("code_challenge_method") === "S256", "PKCE required");
  check(authorize.searchParams.get("scope") === "email", "local non-OIDC scope");
  check(authorize.searchParams.get("client_id") === clientId, "registered client only");
  const transaction = cookie(start, "vr_local_oauth_transaction");
  check(!!transaction, "encrypted state cookie present");

  phase = "real OAuth authorize redirect";
  const upstream = await provider(`${authorize.pathname}${authorize.search}`);
  const consent = redirectUrl(upstream, PROVIDER);
  check(consent.origin === "http://127.0.0.1:3000" && consent.pathname === "/account/authorize/", "parent consent destination");
  const authorizationId = consent.searchParams.get("authorization_id");
  check(!!authorizationId && /^[A-Za-z0-9._~-]{8,512}$/.test(authorizationId), "opaque authorization ID");

  phase = "real authorized consent details";
  const detailsResponse = await provider(`/auth/v1/oauth/authorizations/${encodeURIComponent(authorizationId)}`, {
    headers: { Authorization: `Bearer ${firstPartyToken}` }
  });
  check(detailsResponse.ok, "Auth exposes consent details for authenticated synthetic user");
  const details = await detailsResponse.json();
  check(details.authorization_id === authorizationId, "matching authorization ID");
  check(details.client?.id === clientId, "consent details bind client UUID");
  check(details.redirect_uri === CALLBACK, "consent details bind exact Reserve callback");
  check(details.scope.split(" ").includes("email"), "consent details include requested identity scope");
  return { transaction, authorize, authorizationId };
}
async function decideAuthorization(authorizationId, token, action) {
  phase = `real consent ${action}`;
  const response = await provider(`/auth/v1/oauth/authorizations/${encodeURIComponent(authorizationId)}/consent`, {
    method: "POST", headers: { Authorization: `Bearer ${token}`, "Content-Type": "application/json" },
    body: JSON.stringify({ action })
  });
  check(response.ok, `Auth ${action} response`);
  const value = await response.json();
  const redirect = new URL(value.redirect_url);
  check(redirect.origin === APP && redirect.pathname === "/auth/veni/callback", "returned to exact callback");
  return redirect;
}

try {
  phase = "CI-only local safeguards";
  check(process.env.GITHUB_ACTIONS === "true" && process.env.RUNNER_ENVIRONMENT === "github-hosted",
    "GitHub-hosted runner required");
  check(process.env.SUPABASE_EXPERIMENTAL_STACK === "0", "pinned CLI local runtime");
  check(!existsSync(DEV_VARS), "never overwrite an existing .dev.vars");
  check(process.platform === "linux" && process.versions.node.startsWith("24."), "Linux Node24 only");
  const status = JSON.parse(execFileSync(process.execPath, [cli, "status", "-o", "json"], {
    cwd: ROOT, encoding: "utf8", timeout: 30000, stdio: ["ignore", "pipe", "pipe"]
  }));
  check(status.API_URL === PROVIDER, "disposable local provider origin only");
  check(typeof status.SERVICE_ROLE_KEY === "string" && typeof status.ANON_KEY === "string", "local key material available in memory");
  apiKey = status.ANON_KEY;
  serviceKey = status.SERVICE_ROLE_KEY;

  phase = "register disposable confidential client";
  const newClient = await (await admin("/auth/v1/admin/oauth/clients", "POST", {
    name: `Reserve disposable OAuth proof ${randomUUID()}`,
    redirect_uris: [CALLBACK], client_type: "confidential",
    token_endpoint_auth_method: "client_secret_basic"
  })).json();
  check(ID.test(String(newClient.client_id)) && typeof newClient.client_secret === "string" &&
    newClient.client_secret.length >= 16, "valid confidential client registration");
  clientId = newClient.client_id;

  phase = "create fictional local Auth user";
  const email = `reserve-oauth-${randomUUID()}@example.invalid`;
  const password = `${randomBytes(28).toString("base64url")}Aa!9`;
  const user = await (await admin("/auth/v1/admin/users", "POST", { email, password, email_confirm: true })).json();
  check(ID.test(String(user.id)), "synthetic Auth ID");
  userId = user.id;
  const login = await provider("/auth/v1/token?grant_type=password", { method: "POST", headers: {
    "Content-Type": "application/json"
  }, body: JSON.stringify({ email, password }) });
  check(login.ok, "first-party local synthetic sign-in");
  const signedIn = await login.json();
  check(signedIn.user?.id === userId && typeof signedIn.access_token === "string", "real first-party session");

  phase = "start loopback Reserve SSR application";
  writeFileSync(DEV_VARS, [
    `VENI_OAUTH_CLIENT_ID=${JSON.stringify(clientId)}`,
    `VENI_OAUTH_CLIENT_SECRET=${JSON.stringify(newClient.client_secret)}`,
    `VENI_OAUTH_PUBLISHABLE_KEY=${JSON.stringify(apiKey)}`,
    `VENI_OAUTH_COOKIE_KEY=${JSON.stringify(randomBytes(32).toString("base64url"))}`,
    ""
  ].join("\n"), { flag: "wx", mode: 0o600 });
  createdDevVars = true;
  appProcess = spawn(process.execPath, ["local/veni-oauth-start.mjs"], {
    cwd: ROOT, detached: true, stdio: ["ignore", "pipe", "pipe"],
    env: { ...process.env, VENI_LOCAL_OAUTH: "1" }
  });
  // Consume but NEVER forward child logs. Extract only fixed categorical proof
  // stages so transient SSR failures can be classified without log leakage.
  for (const stream of [appProcess.stdout, appProcess.stderr]) {
    stream.on("data", chunk => {
      outputTail = (outputTail + String(chunk)).slice(-16384);
      const match = outputTail.match(/VENI-LOCAL-PROOF-STAGE:([a-z0-9-]+)/);
      if (match && safeProofStage(match[1])) proofTrace = match[1];
    });
  }
  await waitForApp();

  phase = "deny consent and preserve state";
  const denied = await beginAndInspect(signedIn.access_token, "/app/settings");
  const rejected = await decideAuthorization(denied.authorizationId, signedIn.access_token, "deny");
  check(rejected.searchParams.get("error") === "access_denied", "real denial error");
  check(rejected.searchParams.get("state") === denied.authorize.searchParams.get("state"), "denial state binding");
  const deniedCallback = await browser(rejected, denied.transaction);
  check(redirectUrl(deniedCallback, APP).pathname === "/login", "denial cannot establish a Reserve session");
  check(!cookie(deniedCallback, "vr_local_oauth_session"), "denial creates no session cookie");

  phase = "approve consent and exchange code with PKCE";
  const approved = await beginAndInspect(signedIn.access_token, "/app/onboarding");
  const accepted = await decideAuthorization(approved.authorizationId, signedIn.access_token, "approve");
  check(!!accepted.searchParams.get("code"), "real one-time authorization code");
  check(accepted.searchParams.get("state") === approved.authorize.searchParams.get("state"), "approval state binding");

  phase = "Reserve SSR callback and real Auth/RLS verification";
  const callback = await browser(accepted, approved.transaction);
  if (callback.status !== 303) await delay(100);
  const stage = callback.headers.get("X-Veni-Local-Proof-Stage");
  check(callback.status === 303, `callback HTTP status ${callback.status}, stage ${safeProofStage(stage) ? stage : proofTrace || "opaque"} (expected 303)`);
  check(redirectUrl(callback, APP).pathname === "/development/veni-account", "Reserve accepts only verified identity");
  const sessionCookie = cookie(callback, "vr_local_oauth_session");
  check(!!sessionCookie, "short-lived HttpOnly connected session");
  const statusPage = await browser("/development/veni-account", sessionCookie);
  check(statusPage.status === 200, "Reserve local account status HTTP 200");
  const body = await statusPage.text();
  check(body.includes(userId) && body.includes("not granted"), "connected UUID but no tenant permissions");
  check(!body.includes(email) && !body.includes(signedIn.access_token), "no private credentials in HTML");

  phase = "ensure protected business routes remain locked";
  const appGate = await browser("/app", sessionCookie);
  check(appGate.status >= 300 && appGate.status < 400 &&
    new URL(appGate.headers.get("Location"), APP).pathname === "/login", "OAuth identity never unlocks tenant business access");

  phase = "verify real session revocation";
  await admin(`/auth/v1/admin/users/${userId}`, "DELETE");
  userId = "";
  const afterRevoke = await browser("/development/veni-account", sessionCookie);
  const revokedHTML = await afterRevoke.text();
  check(afterRevoke.status === 200 && revokedHTML.includes("No verified local Veni Account session"),
    "deleted synthetic Auth user cannot reuse Reserve status cookie");
  finished = true;
} catch (error) {
  // Assertion labels are static except safe HTTP status codes. Never show raw
  // provider bodies, token material, URLs, stack traces or client secrets.
  const diagnostic = error?.code === "ERR_ASSERTION" ? ` (${error.message})` : " (unexpected local error)";
  console.error(`Real disposable OAuth2/PKCE + Reserve SSR: FAIL at ${phase}${diagnostic}; details withheld.`);
  process.exitCode = 1;
} finally {
  if (appProcess?.pid) {
    try { process.kill(-appProcess.pid, "SIGTERM"); } catch { /* Already stopped. */ }
  }
  if (createdDevVars) {
    try { unlinkSync(DEV_VARS); } catch { console.error("Failed to clear temporary .dev.vars"); process.exitCode = 1; }
  }
  // Best-effort precise fixture cleanup; the workflow also tears down this
  // entire disposable locally labelled Docker stack with an always() step.
  if (userId && serviceKey) {
    try { await admin(`/auth/v1/admin/users/${userId}`, "DELETE"); } catch { process.exitCode = 1; }
  }
  if (clientId && serviceKey) {
    try { await admin(`/auth/v1/admin/oauth/clients/${clientId}`, "DELETE"); } catch { process.exitCode = 1; }
  }
  if (finished && !process.exitCode)
    console.log(`Real disposable OAuth2/PKCE + Reserve SSR: PASS (${assertions} bounded assertions; no hosted access)`);
}
