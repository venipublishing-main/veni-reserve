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
  const theme = await a.api(`/tenants/${evidence.tenant}/themes/${evidence.theme}`);
  assert.equal(theme.status, 200); assert.equal(theme.data.current_revision, 2);
  assert.deepEqual(theme.data.tokens, evidence.tokens);
  assert.deepEqual(theme.data.history.map(h => h.revision), [2,1]);
  console.log("PASS business and immutable Theme persistence after actual local application restart and fresh genuine Auth sign-in");
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
const old = new Map(a.cookies);
assert.equal((await a.api("/logout", "POST")).status, 200);
a.cookies.clear(); for (const [k,v] of old) a.cookies.set(k,v);
assert.equal((await a.api(path, "PUT", { expected_revision: 2, settings })).status, 401);
assert.equal((await a.api(themePath)).status, 401);
await mkdir(".tmp", { recursive: true });
// Non-secret synthetic receipt only. Never write cookies, keys or provider tokens.
await writeFile(".tmp/local-tenant-proof.json", JSON.stringify({ user: session.user.id, tenant, settings, theme: themeId, tokens: nextTokens }));
console.log("PASS real local HTTP: synthetic Auth, secure cookies, bootstrap/retry, business and immutable Theme revisions, stale conflicts, tenant isolation, CSRF and logout revocation");
