import { build } from "vite";
import { URL, fileURLToPath } from "node:url";
import { readFile, writeFile, copyFile, readdir } from "node:fs/promises";
import { execFileSync } from "node:child_process";
import { createHash } from "node:crypto";
import { headers } from "./headers.mjs";
const out = new URL("../dist/playground-preview/", import.meta.url);
const sha = execFileSync("git", ["rev-parse", "HEAD"], { encoding: "utf8" }).trim();
await build({ configFile: fileURLToPath(new URL("./vite.config.mjs", import.meta.url)) });
await copyFile(new URL("index.html", out), new URL("playground.html", out));
await writeFile(new URL("404.html", out), '<!doctype html><html lang="en"><head><meta name="robots" content="noindex,nofollow"><title>Not found — Feedback Preview</title></head><body><h1>404 — Not available</h1><p>This is a simulated feedback preview. No operational API, authentication or booking endpoint is available.</p><a href="/playground">Open My Playground</a></body></html>');
await writeFile(new URL("_headers", out), `/*\n${Object.entries(headers).map(([key, value]) => `  ${key}: ${value}`).join("\n")}\n`);
const files = {};
for (const file of (await readdir(out, { recursive: true })).sort()) {
  if (!/\.(html|js|css)$/.test(file) && file !== "_headers") continue;
  files[file.replaceAll("\\", "/")] = createHash("sha256").update(await readFile(new URL(file.replaceAll("\\", "/"), out))).digest("hex");
}
await writeFile(new URL("version.json", out), JSON.stringify({ source: sha, artifact: "playground-static-v1", files }, null, 2) + "\n");
await import("./verify-artifact.mjs");
