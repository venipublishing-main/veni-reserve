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
  console.log("PASS persistence after actual local application restart and fresh genuine Auth sign-in");
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
assert.equal((await b.api("/signin", "POST", { fixture: "B" })).status, 200);
assert(!(await b.api("/session")).data.tenants.some(t => t.id === tenant));
assert.equal((await b.api(path)).status, 404);
assert.equal((await b.api(path, "PUT", { expected_revision: 2, settings })).status, 404);
const old = new Map(a.cookies);
assert.equal((await a.api("/logout", "POST")).status, 200);
a.cookies.clear(); for (const [k,v] of old) a.cookies.set(k,v);
assert.equal((await a.api(path, "PUT", { expected_revision: 2, settings })).status, 401);
await mkdir(".tmp", { recursive: true });
// Non-secret synthetic receipt only. Never write cookies, keys or provider tokens.
await writeFile(".tmp/local-tenant-proof.json", JSON.stringify({ user: session.user.id, tenant, settings }));
console.log("PASS real local HTTP: synthetic Auth, secure cookies, serializable bootstrap/retry, settings save/read/edit/revision conflict, cross-user denial, CSRF and logout revocation");
