import { afterEach, describe, expect, it, vi } from "vitest";
import { createElement } from "react";
import { renderToStaticMarkup } from "react-dom/server";
import { MemoryRouter } from "react-router";
import { readFileSync } from "node:fs";
import Home from "../app/routes/home";
import { SiteHeader } from "../app/features/site/shell";
import { SetupReview } from "../app/features/site/setup-review";
import { safeReturnPath, accountEntry, workspacePaths } from "../app/features/site/navigation";
import { requireProductSession, localReviewAllowed, unavailable, rejectAccountWrite } from "../app/lib/product-access.server";
import { emptyReviewDraft, advanceReview, validBusiness, validTheme } from "../app/features/site/setup-draft";
import { bookingTheme } from "../app/features/booking/theme";
const render = (component: Parameters<typeof createElement>[0]) => renderToStaticMarkup(createElement(MemoryRouter, null, createElement(component)));
const read = (file: string) => readFileSync(new URL(`../${file}`, import.meta.url), "utf8");
afterEach(() => vi.unstubAllGlobals());

describe("standalone product navigation", () => {
  it("offers optional Playground and direct signup without sibling or umbrella navigation", () => {
    const html = render(Home); expect(html).toContain('href="/playground"'); expect(html).toContain('href="/signup"'); expect(html).toContain('href="/login"');
    expect(html).toContain("Registration is not open yet"); expect(html).not.toMatch(/href="https:|Veni Kids|Arcana|Mythos/);
    expect(render(SiteHeader)).toContain('aria-label="Veni Reserve home" href="/"');
  });
  it("keeps optional signup outside the isolated Playground component and never transfers session state", () => {
    const source = read("app/routes/playground-entry.tsx"); expect(source).toContain('to="/signup"'); expect(source).not.toMatch(/sessionStorage|localStorage|JSON.stringify|fetch\(/);
    expect(read("preview/main.tsx")).toContain('from "../app/routes/playground"'); expect(read("preview/main.tsx")).not.toContain("playground-entry");
  });
  it.each(["https://evil.invalid", "//evil.invalid", "/\\evil.invalid", "/app?token=sentinel", "/app#x", "/app/../auth/callback", "%2fapp", "/app/tenant-a", " /app", null, "\n/app"])("rejects unsafe or unsupported return target %s", input => {
    expect(safeReturnPath(input)).toBe("/app"); expect(accountEntry("login", String(input))).toBe("/login?next=%2Fapp");
  });
  it.each(workspacePaths)("retains only an exact safe product path %s", path => expect(safeReturnPath(path)).toBe(path));
});

describe("unconfigured identity denies access without inspecting credentials", () => {
  it.each(["/app", "/app/onboarding", "/app/customize", "/app/settings", "/app/tenants/other"])("denies anonymous, forged, cross-project and tenant-claim access to %s", async path => {
    const f = vi.fn(); vi.stubGlobal("fetch", f);
    for (const headers of [{} as Record<string, string>, { Cookie: "session=synthetic", Authorization: "Bearer other.project.token", "X-Tenant-Id": "other", "X-Role": "OWNER" }]) {
      const result = await requireProductSession(new Request(`https://reserve.invalid${path}?tenant_id=other&role=OWNER`, { headers }));
      expect(result.status).toBe(302); expect(result.headers.get("Location")).toBe(accountEntry("login", path)); expect(result.headers.get("Cache-Control")).toBe("no-store"); expect(result.headers.has("Set-Cookie")).toBe(false);
    }
    expect(f).not.toHaveBeenCalled();
  });
  it.each(["POST", "PUT", "PATCH", "DELETE"])("cannot bootstrap or persist using %s", async method => {
    const result = await requireProductSession(new Request("https://reserve.invalid/app/onboarding", { method, body: "SYNTHETIC_SENTINEL" }));
    expect(result.status).toBe(503); expect(await result.text()).not.toContain("SYNTHETIC_SENTINEL");
  });
  it("callback/login actions never exchange codes or claim authentication", async () => {
    const f = vi.fn(); vi.stubGlobal("fetch", f); const result = unavailable(); expect(result.status).toBe(503);
    expect(await result.json()).toEqual({ error: { code: "shared_identity_not_configured" } }); expect(f).not.toHaveBeenCalled(); expect(result.headers.has("Set-Cookie")).toBe(false);
  });
  it("allows fixtures only in a loopback DEV build, never staging, production or nonlocal hosts", () => {
    expect(localReviewAllowed(new Request("http://127.0.0.1:5174/development/setup"), true, "dev")).toBe(true);
    for (const [url, dev, env] of [["http://localhost:5174/development/setup", false, "dev"], ["http://127.0.0.1/development/setup", true, "stg"], ["https://reserve.invalid/development/setup", true, "dev"], ["http://127.0.0.1.evil.invalid/development/setup", true, "dev"]] as const) expect(localReviewAllowed(new Request(url), dev, env)).toBe(false);
    expect(localReviewAllowed(new Request("http://127.0.0.1/development/setup", { method: "POST" }), true, "dev")).toBe(false);
  });
});

describe("business and theme schematic review", () => {
  it("advances only validated business settings; edits survive step navigation but never create saved records", () => {
    const empty = emptyReviewDraft(); expect(advanceReview(empty)).toBe(empty);
    const business = { ...empty, business: { ...empty.business, display_name: "Fictional Workshop" } };
    const brand = advanceReview(business); expect(brand.step).toBe("brand");
    const review = advanceReview({ ...brand, theme: { ...brand.theme, accent: "#abcdef" } }); expect(review.step).toBe("review"); expect(review.business.display_name).toBe("Fictional Workshop"); expect(review.theme.accent).toBe("#abcdef");
    expect(emptyReviewDraft().business.display_name).toBe(""); expect(business.step).toBe("business"); expect(review).not.toHaveProperty("tenant_id"); expect(review).not.toHaveProperty("revision_id");
  });
  it.each([{ display_name: "<script>" }, { timezone: "US/Eastern" }, { default_locale: "xx-ZZ" }, { default_currency: "XXX" }])("uses the same canonical settings validation for %j", invalid => {
    expect(validBusiness({ ...emptyReviewDraft().business, display_name: "Example", ...invalid })).toBe(false);
  });
  it.each([{ primary: "red; background:url(https://evil.invalid)" }, { accent: "#fff" }, { typography: "url(evil)" }, { css: "body{}" }])("rejects unsupported theme payload %j", invalid => {
    expect(validTheme({ ...emptyReviewDraft().theme, ...invalid })).toBe(false);
  });
  it("reuses safe semantic theme tokens and contrast-aware foreground colours", () => {
    expect(validTheme(emptyReviewDraft().theme)).toBe(true); expect(bookingTheme("#ffffff", "#000000")).toMatchObject({ "--booking-on-primary": "#000000", "--booking-on-accent": "#ffffff" });
    expect(JSON.stringify(bookingTheme("url(evil)", "red"))).not.toContain("evil");
  });
  it("labels unsaved state, exposes accessible fields and disables save/publication", () => {
    const html = render(SetupReview); expect(html).toContain("Local design review only"); expect(html).toContain("Fictional business name"); expect(html).toContain('aria-label="Setup review steps"');
    expect(html).toMatch(/disabled="">Save private draft/); expect(html).toMatch(/disabled="">Publish/);
    expect(read("app/features/site/setup-review.tsx")).not.toMatch(/fetch\(|localStorage|sessionStorage|document.cookie/);
  });
});

it("discards bounded rejected write bodies without retaining/echoing or dispatching them", async () => {
  const f = vi.fn(); vi.stubGlobal("fetch", f);
  const r = new Request("https://reserve.invalid/signup", { method: "POST", body: "SYNTHETIC_NOT_A_CREDENTIAL" });
  const response = await rejectAccountWrite(r); expect(response.status).toBe(503); expect(r.bodyUsed).toBe(true); expect(await response.text()).not.toContain("SYNTHETIC");
  expect((await rejectAccountWrite(new Request("https://reserve.invalid/signup", { method: "POST", body: "x".repeat(8193) }))).status).toBe(413); expect(f).not.toHaveBeenCalled();
});
