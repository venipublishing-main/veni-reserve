/// <reference types="node" />
import { describe, expect, it } from "vitest";
import { readFileSync } from "node:fs";
import { feedbackTemplate } from "../preview/feedback";
import { headers, csp } from "../preview/headers.mjs";
import { PlaygroundSession, emptyConfiguration, editPerson, SESSION_POLICY } from "../app/features/playground/session";
const read = (p: string) => readFileSync(new URL(`../${p}`, import.meta.url), "utf8");
describe("dedicated static feedback preview boundary", () => {
  it("cannot inherit the application Worker, environments or resource bindings", () => {
    const config = JSON.parse(read("preview/wrangler.json"));
    expect(config.name).toBe("vf-reserve-playground"); expect(config.account_id).toBe("c71916b32e9e18b2271be2b081c4f927");
    expect(Object.keys(config).sort()).toEqual(["$schema", "account_id", "assets", "compatibility_date", "name", "observability", "preview_urls", "workers_dev"].sort());
    expect(config.assets).toEqual({ directory: "../dist/playground-preview", html_handling: "drop-trailing-slash", not_found_handling: "404-page" });
    expect(config.observability.enabled).toBe(false);
  });
  it("restricts browser requests while allowing theme styles and local raster logos", () => {
    expect(csp).toContain("connect-src 'none'"); expect(csp).toContain("form-action 'none'"); expect(csp).toContain("frame-ancestors 'none'");
    expect(csp).toContain("script-src 'self';"); expect(csp).toContain("style-src 'self' 'unsafe-inline'"); expect(csp).toContain("img-src 'self' blob: data:");
    expect(headers["Referrer-Policy"]).toBe("no-referrer"); expect(headers["X-Content-Type-Options"]).toBe("nosniff");
    expect(csp).not.toContain("unsafe-eval");
  });
  it("copies only explicitly entered feedback fields plus the version, not attached session objects", () => {
    const fields = { task: "Synthetic task", expected: "Expected", actual: "Actual", device: "Chosen browser", business: "PRIVATE_SENTINEL", appointments: ["PRIVATE_SENTINEL"], logo: "PRIVATE_SENTINEL", email: "PRIVATE_SENTINEL" };
    const text = feedbackTemplate("a".repeat(40), fields); expect(text).toContain("Synthetic task"); expect(text).toContain("a".repeat(40)); expect(text).not.toContain("PRIVATE_SENTINEL"); expect(text).toContain("not submitted");
    const source = read("preview/main.tsx"); expect(source).toContain("navigator.clipboard.writeText(text)"); expect(source).not.toMatch(/fetch\(|sendBeacon|localStorage|sessionStorage/);
  });
  it("reuses the same Playground without importing the server route registry", () => {
    expect(read("preview/main.tsx")).toContain('from "../app/routes/playground"');
    expect(read("preview/vite.config.mjs")).toContain("publicDir: false"); expect(read("preview/vite.config.mjs")).toContain("envDir: false");
    expect(read("preview/wrangler.json")).not.toMatch(/SUPABASE|vf-reserve-stg|vf-reserve-dev/);
    expect(read(".github/workflows/ci.yml")).not.toMatch(/wrangler deploy|wrangler versions upload/);
  });
  it("retains independent memory sessions, baseline reset, hard reset and expiry", () => {
    let clock = Date.parse("2026-11-11T07:00:00Z"); const a = new PlaygroundSession(() => clock), b = new PlaygroundSession(() => clock);
    let config = emptyConfiguration(); config.business.name = "Fictional test"; config.business.timezone = "Africa/Johannesburg"; config.people[0].name = "Synthetic person"; config.people[0].roles = ["Staff"]; config = editPerson(config, config.people[0], true); config.services[0].name = "Test"; config.services[0].eligibleStaffIds = ["staff-1"];
    a.update(config); expect(a.complete()).toEqual([]); expect(b.getSnapshot().config.business.name).toBe("");
    const next = structuredClone(config); next.business.name = "Changed"; a.update(next); a.softReset(); expect(a.getSnapshot().config.business.name).toBe("Fictional test");
    a.hardReset(); expect(a.getSnapshot().config.business.name).toBe(""); a.update(config); a.complete(); clock += SESSION_POLICY.inactivityMs; expect(a.checkExpiry()).toBe(true); expect(a.getSnapshot().appointments).toEqual([]); a.dispose(); b.dispose();
  });
});
