import { describe, expect, it } from "vitest";
import { readFileSync } from "node:fs";
import { AUDIENCE, CALLBACK, ISSUER, SyntheticIdentityContract, challenge, fixtureSigner } from "./fixtures/identity-contract";
import type { Claims, Membership } from "./fixtures/identity-contract";
function setup() {
  let now = 1000; const signer = fixtureSigner();
  const broker = new SyntheticIdentityContract(signer.publicKey, [{ issuer: ISSUER, subject: "central-subject-A", localUser: "reserve-user-A" }], () => now);
  const tx = broker.begin("browser-A", "/app/onboarding");
  const claims: Claims = { iss: ISSUER, sub: "central-subject-A", aud: AUDIENCE, exp: 1300, iat: 1000, nonce: tx.nonce, email: "fictional@example.invalid", email_verified: true };
  const complete = (changes: Partial<Claims> = {}) => {
    const code = broker.issueForTest(tx.state, signer.token({ ...claims, ...changes }));
    return { state: tx.state, code, verifier: tx.verifier, browser: tx.browser, callback: CALLBACK };
  };
  return { signer, broker, tx, claims, complete, clock: (v: number) => { now = v; } };
}
describe("hermetic identity design contract, NOT live federation", () => {
  it("uses the RFC 7636 S256 vector", () => {
    expect(challenge("dBjftJeZ4CVP-mB92K27uhbUJU1p1r_wW1gFWFOEjXk")).toBe("E9Melhoa2OwvFrEMTJguCHaoeK1t8URWbuGJSstw-cM");
  });
  it("maps only an explicitly linked issuer+subject to a distinct Reserve User", () => {
    const f = setup(), result = f.broker.complete(f.complete()); expect(f.broker.user(result.session)).toBe("reserve-user-A"); expect(result.next).toBe("/app/onboarding");
    expect(f.broker.user(result.session)).not.toBe(f.claims.sub); expect(result).not.toHaveProperty("email");
  });
  it.each([{ iss: "https://wrong.invalid" }, { aud: "wrong-client" }, { nonce: "wrong-nonce" }, { exp: 999 }, { iat: 1001 }, { nbf: 1001 }, { email_verified: false }, { sub: "" }])("rejects signed but invalid claims %j", changes => {
    const f = setup(); expect(() => f.broker.complete(f.complete(changes))).toThrow();
  });
  it("rejects an unknown subject even when its verified email matches", () => {
    const f = setup(); expect(() => f.broker.complete(f.complete({ sub: "email-collision" }))).toThrow();
  });
  it("rejects wrong signing key and unsupported algorithms", () => {
    for (const token of [fixtureSigner(), null]) {
      const f = setup(); const value = token ? token.token(f.claims) : f.signer.token(f.claims, { alg: "HS256", kid: "fixture-key", typ: "JWT" });
      const input = f.complete(); input.code = f.broker.issueForTest(f.tx.state, value); expect(() => f.broker.complete(input)).toThrow();
    }
  });
  it.each(["state", "verifier", "browser", "callback"] as const)("rejects altered %s and never permits replay", field => {
    const f = setup(), input = f.complete(); expect(() => f.broker.complete({ ...input, [field]: "wrong" })).toThrow();
    expect(() => f.broker.complete(input)).toThrow();
  });
  it("consumes a successful code and transaction once", () => {
    const f = setup(), input = f.complete(); f.broker.complete(input); expect(() => f.broker.complete(input)).toThrow();
  });
  it("rejects a code from another simultaneous transaction", () => {
    const f = setup(), input = f.complete(); const other = f.broker.begin("browser-A", "/app");
    expect(() => f.broker.complete({ ...input, state: other.state, verifier: other.verifier })).toThrow();
  });
  it("expires transactions and local sessions without upstream assumptions", () => {
    const f = setup(), input = f.complete(); f.clock(1061); expect(() => f.broker.complete(input)).toThrow();
    const g = setup(), result = g.broker.complete(g.complete()); g.clock(1300); expect(g.broker.user(result.session)).toBeNull();
  });
  it("uses exact callback registration and product-only return destinations", () => {
    const f = setup(); expect(() => f.broker.begin("browser-A", "/app", "https://evil.invalid")).toThrow();
    for (const next of ["https://evil.invalid", "//evil.invalid", "/app?token=x", "/%2f/evil.invalid"]) expect(f.broker.begin("browser-A", next).next).toBe("/app");
  });
  it("requires same-origin anti-CSRF proof for local logout", () => {
    const f = setup(), result = f.broker.complete(f.complete());
    expect(() => f.broker.logout(result.session, "https://evil.invalid", "x", "x")).toThrow();
    expect(() => f.broker.logout(result.session, "https://fictional-reserve.invalid", "bad", "x")).toThrow();
    expect(f.broker.user(result.session)).toBe("reserve-user-A"); f.broker.logout(result.session, "https://fictional-reserve.invalid", "x", "x"); expect(f.broker.user(result.session)).toBeNull();
  });
  it("requires active membership and capability for each of multiple businesses", () => {
    const f = setup(), { session } = f.broker.complete(f.complete());
    const members: Membership[] = [{ user: "reserve-user-A", tenant: "tenant-A", status: "ACTIVE", tenantStatus: "SETUP", capabilities: ["settings.read"] }, { user: "reserve-user-A", tenant: "tenant-B", status: "ACTIVE", tenantStatus: "ACTIVE", capabilities: ["settings.read"] }];
    expect(f.broker.can(session, "tenant-A", "settings.read", members)).toBe(true); expect(f.broker.can(session, "tenant-B", "settings.read", members)).toBe(true);
    expect(f.broker.can(session, "tenant-C", "settings.read", members)).toBe(false); expect(f.broker.can(session, "tenant-A", "settings.write", members)).toBe(false);
    expect(f.broker.can("forged", "tenant-A", "settings.read", members)).toBe(false);
    for (const change of [{ status: "REVOKED" as const }, { tenantStatus: "SUSPENDED" as const }, { user: "other" }]) expect(f.broker.can(session, "tenant-A", "settings.read", [{ ...members[0], ...change }])).toBe(false);
  });
  it("keeps the existing M1 identity assumptions explicit rather than swapping issuers", () => {
    const read = (p: string) => readFileSync(new URL(`../supabase/migrations/${p}`, import.meta.url), "utf8");
    expect(read("20261030154642_m1_1a_tenant_user_membership_persistence.sql")).toContain("references auth.users (id)");
    const rls = read("20261031031256_m1_2_rls_cross_tenant_security.sql"); expect(rls).toContain("auth.jwt() -> 'is_anonymous' = 'false'::jsonb"); expect(rls).toContain("u.id = private.business_user_id()");
  });
});
