import { reactRouter } from "@react-router/dev/vite";
import { cloudflare } from "@cloudflare/vite-plugin";
import tailwindcss from "@tailwindcss/vite";
import { defineConfig } from "vite";
import { execFileSync } from "node:child_process";

export default defineConfig({
  define: { __APP_PREVIEW_SHA__: JSON.stringify(process.env.CLOUDFLARE_ENV === "app_preview" ? execFileSync("git", ["rev-parse", "HEAD"], { encoding: "utf8" }).trim() : "") },
  plugins: [
    cloudflare({ viteEnvironment: { name: "ssr" } }),
    tailwindcss(),
    reactRouter(),
  ],
  resolve: {
    tsconfigPaths: true,
  },
});
