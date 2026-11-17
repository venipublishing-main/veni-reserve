import { describe, expect, it } from "vitest";
import { readFileSync } from "node:fs";
import { localReviewAllowed } from "../app/lib/product-access.server";
const read = (p: string) => readFileSync(new URL(`../${p}`, import.meta.url), "utf8");
describe("local persistence release boundaries", () => {
  it.each(["app_preview", "stg", "production"])("never grants local access in %s", env => {
    expect(localReviewAllowed(new Request("http://127.0.0.1:5192/development/business"), true, env)).toBe(false);
  });
  it("requires development and loopback, not a forwarded header", () => {
    expect(localReviewAllowed(new Request("https://public.invalid/development/business", { headers: { "X-Forwarded-Host": "127.0.0.1" } }), true, "dev")).toBe(false);
    expect(localReviewAllowed(new Request("http://127.0.0.1:5192/development/business"), false, "dev")).toBe(false);
  });
  it("keeps local service out of route modules and enables only explicit dev harness", () => {
    expect(read("app/routes.ts")).toContain('process.env.NODE_ENV !== "production" && !preview');
    expect(read("app/routes/local-business.tsx")).not.toMatch(/SERVICE_ROLE|ANON_KEY|tenant-harness|localStorage|sessionStorage/);
    expect(read("local/tenant-harness.ts")).toContain('server.config.server.host !== "127.0.0.1"');
    expect(read("local/tenant-harness.ts")).toContain('server.config.server.port !== 5192');
    expect(read("local/tenant-harness.ts")).toContain('request.headers.get("origin") === origin');
  });
  it("labels real local persistence separately from unsaved Theme revisions", () => {
    const src = read("app/routes/local-business.tsx");
    expect(src).toContain("database reset destroys them"); expect(src).toContain("do not save a Theme or Theme Revision");
  });
  it("retains hard database ownership guards and never accepts actor or role parameters", () => {
    const src = read("supabase/migrations/20261113111616_tenant_bootstrap.sql");
    expect(src).toContain("set default_transaction_isolation='serializable'");
    expect(src).toContain("actor uuid:=private.authenticated_session_user()");
    expect(src).toContain("set constraints all immediate");
    expect(src).not.toMatch(/disable trigger|session_replication_role|drop.*owner_write_guard/i);
    expect(src).toContain("revoke veni_bootstrap_executor from postgres");
  });
});
