import { execFileSync } from "node:child_process";
import { readFile, writeFile, readdir } from "node:fs/promises";
import { createHash } from "node:crypto";
import process from "node:process";
const source = execFileSync("git", ["rev-parse", "HEAD"], { encoding: "utf8" }).trim();
execFileSync(process.execPath, ["node_modules/@react-router/dev/bin.cjs", "build"], { stdio: "inherit", env: { ...process.env, CLOUDFLARE_ENV: "app_preview" } });
await writeFile("build/client/.assetsignore", "wrangler.json\n.dev.vars\n.vite/\n");
const files = {};
for (const name of (await readdir("build/client/assets")).sort()) {
  if (!/\.(js|css)$/.test(name)) throw new Error(`Unexpected asset ${name}`);
  files[`/assets/${name}`] = createHash("sha256").update(await readFile(`build/client/assets/${name}`)).digest("hex");
}
await writeFile("build/client/__preview-assets.json", JSON.stringify({ source, artifact: "reserve-ssr-preview-v1", files }, null, 2) + "\n");
await import("./verify.mjs");

