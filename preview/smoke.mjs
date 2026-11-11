import assert from "node:assert/strict";
import console from "node:console";
import process from "node:process";
import { Buffer } from "node:buffer";
/* global fetch */
import { createHash } from "node:crypto";
import { execFileSync } from "node:child_process";
import { headers } from "./headers.mjs";
const base = process.argv[2];
assert(base && /^(http:\/\/127\.0\.0\.1:\d+|https:\/\/vf-reserve-playground\.[a-z0-9-]+\.workers\.dev)\/?$/.test(base), "Only local or the dedicated HTTPS target is allowed");
const sha = execFileSync("git", ["rev-parse", "HEAD"], { encoding: "utf8" }).trim();
const version = await (await fetch(`${base}/version.json`)).json(); assert.equal(version.source, sha);
for (const path of ["/", "/playground", "/playground/"]) {
  const r = await fetch(base + path); assert.equal(r.status, 200); const body = await r.text();
  assert(body.includes(sha) && body.includes("My Playground"));
  for (const [name, value] of Object.entries(headers)) assert.equal(r.headers.get(name), value, name);
  assert(!r.headers.has("set-cookie")); console.log(`PASS GET ${path}: version, HTML, headers, no application cookie`);
}
assert.equal((await fetch(`${base}/playground`, { method: "POST" })).status, 405, "No operational form POST");
for (const [path, digest] of Object.entries(version.files)) {
  if (path === "_headers") continue;
  const r = await fetch(`${base}/${path}`); assert.equal(r.status, 200, path);
  assert.equal(createHash("sha256").update(Buffer.from(await r.arrayBuffer())).digest("hex"), digest, path);
}
for (const path of ["/api", "/api/tenants/synthetic/business-settings", "/ready", "/auth/callback", "/login", "/demo/vvb", "/.env", "/workers/app.ts", "/missing", "/_headers"]) {
  for (const method of ["GET", "POST"]) {
    const r = await fetch(base + path, { method, redirect: "manual" }); assert([404, 405].includes(r.status), `${method} ${path}: ${r.status}`);
    assert(!r.headers.has("set-cookie")); assert(!(await r.text()).includes('<div id="root">'), "No successful SPA shell for excluded routes");
  }
  console.log(`PASS excluded ${path}: GET/POST rejected`);
}
console.log(`HTTP/artifact smoke PASS for ${sha}. This is not browser-interaction evidence.`);
