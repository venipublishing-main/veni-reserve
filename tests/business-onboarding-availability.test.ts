import { describe, expect, it, vi } from "vitest";
import { tenantWorkspace } from "../app/lib/tenant-workspace.server";
import { checkLabels, validReview } from "../app/lib/business-onboarding";

const id = "71c82c2e-4cc6-4dcf-b462-caa039871ddb";
const draft = {
  revision: 1, review_key: "a".repeat(32), entitled: null, status: "verification_required",
  checks: Object.fromEntries(Object.keys(checkLabels).map(key => [key, true])),
  details: { email: "office@example.invalid", phone: "", hours: Array(7).fill(null), min_notice_minutes: 0, max_advance_days: 30 },
  summary: { business: "Synthetic business", timezone: "Africa/Johannesburg", services: [], staff: [], locations: [] },
};
function read(lookup: () => Promise<Response>, initial = Response.json(draft)) {
  const rpc = vi.fn((name: string) => name === "read_business_onboarding" ? Promise.resolve(initial) : lookup());
  return tenantWorkspace(new Request("https://example.invalid"), "/tenants/" + id + "/onboarding",
    { id }, "test", "", () => "", { VENI_ENV: "dev", VENI_ACCOUNT_MODE: "shared" }, rpc);
}
describe("Account eligibility on a verified database draft", () => {
  it.each([
    ["transport timeout", () => Promise.reject(new Error("timeout"))],
    ["bad gateway", async () => new Response(null, { status: 502 })],
    ["service unavailable", async () => new Response(null, { status: 503 })],
    ["missing response body", async () => new Response(null)],
    ["invalid decision", async () => Response.json({ entitled: "true" })],
    ["upstream error alongside a value", async () => Response.json({ error: "unavailable", entitled: true })],
  ] as const)("retains the draft with unverified eligibility on %s", async (_, lookup) => {
    const response = await read(lookup);
    expect(response.status).toBe(200);
    expect(await response.json()).toEqual(draft);
  });
  it.each([401,403])("preserves an authentication denial (%i)", async status => {
    expect((await read(async () => new Response(null,{status}))).status).toBe(status);
  });
  it("honours a changed membership between calls", async () => {
    expect((await read(async () => Response.json({ error: "tenant_unavailable" }))).status).toBe(404);
  });
  it("does not contact Account after a denied draft lookup", async () => {
    const lookup = vi.fn();
    expect((await read(lookup, Response.json({ error: "tenant_unavailable" }))).status).toBe(404);
    expect(lookup).not.toHaveBeenCalled();
  });
  it.each([[true,"activated"], [false,"pending_entitlement"]] as const)("projects a fresh %s decision", async (entitled,status) => {
    const response = await read(async () => Response.json({ entitled }));
    expect(await response.json()).toEqual({ ...draft, status, entitled });
  });
  it("requires positive entitlement to report active", () => {
    expect(validReview({ ...draft, status:"activated" })).toBe(false);
  });
});
