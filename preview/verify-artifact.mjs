import { readdir, readFile, lstat } from "node:fs/promises";
import { createHash } from "node:crypto";
import assert from "node:assert/strict";
import { URL } from "node:url";
import { execFileSync } from "node:child_process";
import console from "node:console";
import process from "node:process";
const out = new URL("../dist/playground-preview/", import.meta.url);
const version = JSON.parse(await readFile(new URL("version.json", out), "utf8"));
assert.match(version.source, /^[a-f0-9]{40}$/);
assert.equal(version.source, execFileSync("git", ["rev-parse", "HEAD"], { encoding: "utf8" }).trim(), "Rebuild at the release head");
if (process.argv.includes("--for-publication")) assert.equal(execFileSync("git", ["status", "--porcelain"], { encoding: "utf8" }).trim(), "", "Commit and validate all release changes before publication");
const allowed = /^(index\.html|playground\.html|404\.html|_headers|version\.json|assets\/[A-Za-z0-9_-]+\.(js|css))$/;
for (const file of await readdir(out, { recursive: true })) {
  const path = file.replaceAll("\\", "/"), url = new URL(path, out), info = await lstat(url);
  assert(!info.isSymbolicLink(), "No symlinks in upload"); if (info.isDirectory()) { assert.equal(path, "assets"); continue; }
  assert.match(path, allowed, `Unexpected public artifact: ${path}`);
  const bytes = await readFile(url), text = bytes.toString();
  assert(!/supabase\.co|sb_publishable_|SUPABASE_|api\/tenants|opjgaepryqwmsohtajja|sourceMappingURL|C:\\\\Users|E:\\\\Dev/.test(text), `Forbidden content in ${path}`);
  if (path !== "version.json") assert.equal(createHash("sha256").update(bytes).digest("hex"), version.files[path]);
}
const config = JSON.parse(await readFile(new URL("./wrangler.json", import.meta.url), "utf8"));
assert.equal(config.name, "vf-reserve-playground"); assert.equal(config.account_id, "c71916b32e9e18b2271be2b081c4f927");
assert.deepEqual(Object.keys(config).sort(), ["$schema", "name", "account_id", "compatibility_date", "workers_dev", "preview_urls", "assets", "observability"].sort());
assert.deepEqual(config.assets, { directory: "../dist/playground-preview", html_handling: "drop-trailing-slash", not_found_handling: "404-page" });
assert.equal(await readFile(new URL("index.html", out), "utf8"), await readFile(new URL("playground.html", out), "utf8"));
console.log(`Static artifact boundary PASS: ${version.source}; ${Object.keys(version.files).length + 1} public files; no Worker script or bindings.`);
