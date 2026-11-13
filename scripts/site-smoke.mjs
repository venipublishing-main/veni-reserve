import assert from "node:assert/strict";
import console from "node:console";
import process from "node:process";
/* global fetch */
const base = process.argv[2];
assert(/^http:\/\/127\.0\.0\.1:\d+$/.test(base ?? ""), "Loopback only");
for (const path of ["/", "/signup", "/login", "/playground"]) {
  const r = await fetch(base + path); assert.equal(r.status, 200, path); const html = await r.text();
  assert(html.includes("Veni Reserve")); assert(!r.headers.has("set-cookie"));
  if (path === "/") assert(html.includes('href="/signup"') && html.includes('href="/playground"'));
  if (path === "/signup" || path === "/login") { assert(html.includes("Veni Account connection pending")); assert(!html.includes('type="password"')); }
  console.log(`PASS direct GET ${path}`);
}
for (const path of ["/app", "/app/onboarding", "/app/customize", "/app/settings", "/app/tenants/other"]) {
  for (const headers of [{}, { Cookie: "session=synthetic", Authorization: "Bearer synthetic.foreign.token", "X-Role": "OWNER" }]) {
    const r = await fetch(base + path, { redirect: "manual", headers }); assert.equal(r.status, 302, path); assert(r.headers.get("location").startsWith("/login?next=")); assert.equal(r.headers.get("cache-control"), "no-store"); await r.text();
  }
  const r = await fetch(base + path, { method: "POST", body: "synthetic", redirect: "manual" }); assert.equal(r.status, 503, path); await r.text();
  console.log(`PASS closed workspace ${path}`);
}
for (const path of ["/signup", "/login", "/auth/callback?code=synthetic", "/auth/logout"]) {
  const r = await fetch(base + path, { method: "POST", redirect: "manual" }); assert.equal(r.status, 503, path); await r.text(); assert(!r.headers.has("set-cookie"));
}
const callback = await fetch(base + "/auth/callback?code=DO_NOT_REFLECT"); assert.equal(callback.status, 503); assert(!(await callback.text()).includes("DO_NOT_REFLECT"));
const unsafe = await (await fetch(base + "/signup?next=https%3A%2F%2Fevil.invalid")).text(); assert(!unsafe.includes("evil.invalid"));
const booking = await fetch(base + "/book/synthetic-business"); assert.equal(booking.status, 503); assert((await booking.text()).includes("Business booking is not published"));
const fixture = await fetch(base + "/development/setup");
if (process.argv.includes("--dev")) { assert.equal(fixture.status, 200); assert((await fixture.text()).includes("Local design review only")); }
else assert.equal(fixture.status, 404, "Fixture excluded from production builds");
assert.equal((await fetch(base + "/development/setup", { method: "POST" })).status, 405);
const settings = await fetch(base + "/api/tenants/aaaaaaaa-1111-4444-8888-111111111111/business-settings"); assert.equal(settings.status, 401);
console.log("PASS account/callback, safe returns, unpublished booking, fixture boundary and anonymous settings. HTTP evidence only; browser acceptance pending.");
