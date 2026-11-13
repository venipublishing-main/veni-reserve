import assert from "node:assert/strict";
import { createHash } from "node:crypto";
import { execFileSync } from "node:child_process";
import process from "node:process";
import console from "node:console";
/* global fetch */
const base = process.argv[2], expected = process.argv[3] ?? execFileSync("git", ["rev-parse", "HEAD"], { encoding: "utf8" }).trim();
assert(/^http:\/\/127\.0\.0\.1:\d+$|^https:\/\/vf-reserve-app-preview\.[a-z0-9-]+\.workers\.dev$/.test(base ?? ""), "Only loopback or dedicated preview");
async function check(path, status = 200, init = {}) {
  const response = await fetch(base + path, { redirect: "manual", headers: { "Cache-Control": "no-cache" }, ...init });
  const body = await response.text();
  assert.equal(response.status, status, `${path}: ${body.slice(0, 150)}`);
  assert(!response.headers.has("set-cookie"));
  assert.equal(response.headers.get("cache-control"), "no-store");
  assert.equal(response.headers.get("x-robots-tag"), "noindex, nofollow");
  assert.equal(response.headers.get("x-content-type-options"), "nosniff");
  assert.equal(response.headers.get("x-frame-options"), "DENY");
  const csp = response.headers.get("content-security-policy");
  assert(csp.includes("connect-src 'self'") && csp.includes("form-action 'none'"));
  assert(!/supabase\.co|sb_publishable_|sb_secret_|DO_NOT_REFLECT/.test(body));
  return { response, body, csp };
}
assert.equal(JSON.parse((await check("/__preview/version?probe=" + Date.now())).body).source, expected);
for (const path of ["/", "/signup", "/login", "/playground", "/preview/setup"]) {
  const { body, csp } = await check(path);
  assert(body.includes(expected) && body.includes("NON-PRODUCTION REVIEW PREVIEW"));
  const nonce = /'nonce-([^']+)'/.exec(csp)[1];
  for (const tag of body.matchAll(/<script\b[^>]*>/g)) assert(tag[0].includes(`nonce="${nonce}"`), `Unnonced script ${path}`);
  if (path === "/signup" || path === "/login") assert(!body.includes('type="password"') && body.includes("Veni Account connection pending"));
  if (path === "/preview/setup") assert(body.includes("UNSAVED DEMONSTRATION"));
  console.log(`PASS direct SSR ${path}`);
}
assert.equal(JSON.parse((await check("/health")).body).environment, "app_preview");
await check("/ready", 503);
for (const path of ["/app", "/app/onboarding", "/app/settings"]) { const { response } = await check(path, 302, { headers: { Cookie: "synthetic=session", Authorization: "Bearer synthetic", "X-Role": "OWNER" } }); assert(response.headers.get("location").startsWith("/login?next=")); }
for (const path of ["/auth/callback?code=DO_NOT_REFLECT", "/book/unpublished", "/api/tenants/synthetic/business-settings"]) await check(path, 503);
for (const method of ["POST", "PUT", "PATCH", "DELETE", "OPTIONS"]) for (const path of ["/signup", "/login", "/auth/callback", "/app/onboarding", "/api/tenants/synthetic/business-settings", "/preview/setup", "/book/unpublished"]) await check(path, 503, { method });
for (const path of ["/development/setup", "/.env", "/wrangler.jsonc", "/workers/app.ts", "/assets/private.js.map", "/missing"]) await check(path, 404);
await check("/", 200, { method: "HEAD" });
const manifest = JSON.parse((await check("/__preview-assets.json")).body); assert.equal(manifest.source, expected);
for (const [path, hash] of Object.entries(manifest.files)) { const { body } = await check(path); assert.equal(createHash("sha256").update(body).digest("hex"), hash, path); }
console.log(`PASS ${expected}: ${Object.keys(manifest.files).length} asset hashes, security headers, nonce SSR scripts, fail-closed routes. Browser interaction NOT tested.`);
