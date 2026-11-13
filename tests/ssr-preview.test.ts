import { afterEach, describe, expect, it, vi } from "vitest";
import { readFileSync } from "node:fs";
import { previewBoundary, previewEnvironment, previewHeaders } from "../app/lib/app-preview.server";
const read = (path: string) => readFileSync(new URL(`../${path}`, import.meta.url), "utf8");
afterEach(() => vi.unstubAllGlobals());
describe("isolated SSR preview", () => {
  it.each(["dev", "stg", "production", "", "APP_PREVIEW"])("never enables fictional setup in %s", value => expect(previewEnvironment(value)).toBe(false));
  it("requires trusted exact environment and does not trust request headers", () => {
    expect(previewEnvironment("app_preview")).toBe(true);
    expect(read("app/routes/preview-setup.tsx")).toContain("previewEnvironment(env.VENI_ENV)");
    expect(read("app/routes/preview-setup.tsx")).not.toMatch(/request\.headers|searchParams|hostname|fetch\(/);
  });
  it.each(["/api/tenants/fictional/business-settings", "/auth/callback?code=SENTINEL", "/book/fictional", "/ready"])("closes %s without provider calls or secret reflection", async path => {
    const fetch = vi.fn(); vi.stubGlobal("fetch", fetch);
    const response = await previewBoundary(new Request(`https://preview.invalid${path}`, { headers: { Authorization: "Bearer SENTINEL", Cookie: "SENTINEL" } }), "a".repeat(40));
    expect(response?.status).toBe(503); expect(await response?.text()).not.toContain("SENTINEL"); expect(fetch).not.toHaveBeenCalled();
  });
  it.each(["POST", "PUT", "PATCH", "DELETE", "OPTIONS"])("rejects %s before dispatch", async method => {
    const response = await previewBoundary(new Request("https://preview.invalid/preview/setup", { method, body: "FICTIONAL_ONLY" }), "a".repeat(40));
    expect(response?.status).toBe(503); expect(await response?.text()).not.toContain("FICTIONAL_ONLY");
  });
  it("bounds rejected bodies", async () => expect((await previewBoundary(new Request("https://preview.invalid/signup", { method: "POST", body: "x".repeat(8193) }), "a".repeat(40)))?.status).toBe(413));
  it.each(["/development/setup", "/.env", "/wrangler.jsonc", "/workers/app.ts", "/assets/source.js.map"])("hides %s", async path => expect((await previewBoundary(new Request(`https://preview.invalid${path}`), "a".repeat(40)))?.status).toBe(404));
  it("keeps workspace gated even with fabricated session claims", async () => {
    const response = await previewBoundary(new Request("https://preview.invalid/app/onboarding", { headers: { Cookie: "session=fake", "X-Role": "OWNER" } }), "a".repeat(40));
    expect(response?.status).toBe(302); expect(response?.headers.get("Location")).toBe("/login?next=%2Fapp%2Fonboarding");
  });
  it("exposes only release identity", async () => {
    expect(await (await previewBoundary(new Request("https://preview.invalid/__preview/version"), "a".repeat(40)))?.json()).toEqual({ source: "a".repeat(40), artifact: "reserve-ssr-preview-v1" });
  });
  it("uses per-response nonce CSP, no forms/providers/framing and no caching", () => {
    const headers = previewHeaders("synthetic-nonce");
    expect(headers["Content-Security-Policy"]).toContain("script-src 'self' 'nonce-synthetic-nonce'");
    expect(headers["Content-Security-Policy"]).toContain("connect-src 'self'");
    expect(headers["Content-Security-Policy"]).toContain("form-action 'none'");
    expect(headers["Cache-Control"]).toBe("no-store"); expect(headers["X-Robots-Tag"]).toBe("noindex, nofollow");
    expect(headers["X-Frame-Options"]).toBe("DENY");
  });
  it("isolates noninherited deployment bindings and does not add deployment automation", () => {
    const config = JSON.parse(read("wrangler.jsonc"));
    expect(config.name).toBe("vf-reserve-dev"); expect(config.env.stg.name).toBe("vf-reserve-stg");
    expect(config.env.app_preview.vars).toEqual({ VENI_ENV: "app_preview", VENI_PRODUCT: "reserve" });
    expect(config.env.app_preview.name).toBe("vf-reserve-app-preview");
    expect(config.env.app_preview.limits.cpu_ms).toBe(10);
    expect(read(".github/workflows/ci.yml")).not.toMatch(/wrangler deploy|CLOUDFLARE_API_TOKEN/);
  });
});
