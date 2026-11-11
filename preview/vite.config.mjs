import { defineConfig } from "vite";
import tailwindcss from "@tailwindcss/vite";
import { execFileSync } from "node:child_process";
import { URL, fileURLToPath } from "node:url";
const sha = execFileSync("git", ["rev-parse", "HEAD"], { encoding: "utf8" }).trim();
if (!/^[a-f0-9]{40}$/.test(sha)) throw new Error("A real source commit is required.");
export default defineConfig({
  root: fileURLToPath(new URL(".", import.meta.url)),
  envDir: false,
  publicDir: false,
  plugins: [tailwindcss(), { name: "preview-version", transformIndexHtml: html => html.replaceAll("__PREVIEW_SHA__", sha),
    transform(code, id) {
      if (id.includes("node_modules") || !/\.[jt]sx?$/.test(id)) return;
      if (/\bfetch\s*\(|\bWebSocket\b|sendBeacon|\bXMLHttpRequest\b|import\.meta\.env|process\.env|localStorage|sessionStorage/.test(code)) throw new Error("Network, environment or persistence primitive in preview application source");
    },
    generateBundle() {
      const root = fileURLToPath(new URL("../", import.meta.url)).replaceAll("\\", "/");
      for (const id of this.getModuleIds()) {
        const path = id.replaceAll("\\", "/").replace(root, "");
        if (path.startsWith("app/") && !/^app\/(features\/(playground|booking|demo)\/|routes\/playground\.tsx|app\.css)/.test(path)) throw new Error(`Disallowed application module in public preview: ${path}`);
        if (/\.server\.|\/workers\/|supabase-js/.test(path)) throw new Error("Backend module in browser-only preview");
      }
    },
  }],
  define: { __PREVIEW_SHA__: JSON.stringify(sha) },
  oxc: { jsx: { runtime: "automatic" } },
  build: { outDir: "../dist/playground-preview", emptyOutDir: true, sourcemap: false, modulePreload: false },
});
