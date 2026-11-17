// Local proposal tests: purely synthetic trusted-server adapters. These are
// not evidence of hosted Auth, RLS, cross-project sessions or a deployed route.
import test from "node:test";
import assert from "node:assert/strict";
import { readFileSync } from "node:fs";
import { resolveReserveActor } from "../app/lib/reserve-actor-contract.server.ts";

const NOW = 1920000000000;
const ISSUER = "https://accounts.example.invalid/auth/v1";
const SUBJECT = "aaaaaaaa-bbbb-4ccc-8ddd-eeeeeeeeeeee";
const SESSION = "bbbbbbbb-cccc-4ddd-8eee-ffffffffffff";
const TENANT_A = "cccccccc-dddd-4eee-8fff-000000000000";
const TENANT_B = "dddddddd-eeee-4fff-8000-111111111111";
const USER = SUBJECT;
const OTHER = "eeeeeeee-ffff-4000-8111-222222222222";
const MEMBERSHIP_A = "ffffffff-0000-4111-8222-333333333333";
const MEMBERSHIP_B = "11111111-2222-4333-8444-555555555555";
const identity = { issuer: ISSUER, subject: SUBJECT, sessionId: SESSION,
  verifiedAtMs: NOW - 1000, expiresAtMs: NOW + 20000,
  sessionActive: true, identityVerified: true, anonymous: false };
const policy = { issuer: ISSUER, identityMode: "shared-auth",
  selectedTenantId: TENANT_A, requiredCapability: "tenant.settings_manage",
  allowedTenantStatuses: ["SETUP", "ACTIVE"] };
const request = new Request("http://127.0.0.1:5192/app/onboarding?role=Owner&tenant_id=" + TENANT_B);

function fixture() {
  const state = {
    principal: { ...identity, email: "same@example.invalid",
      user_metadata: { role: "Owner", tenant_id: TENANT_B } },
    bindings: [{ issuer: ISSUER, subject: SUBJECT, reserveUserId: USER }],
    memberships: [{ reserveUserId: USER, tenantId: TENANT_A, membershipId: MEMBERSHIP_A,
      membershipStatus: "ACTIVE", tenantStatus: "SETUP" }],
    grants: new Set([[USER, TENANT_A, "tenant.settings_manage"].join("|")]),
    throwAt: null,
    calls: [],
  };
  const adapter = {
    async verifyLivePrincipal(received) {
      state.calls.push(["verify", received.url]);
      if (state.throwAt === "verify") throw Error("private provider diagnostic");
      return state.principal;
    },
    async lookupIdentityBindings(issuer, subject) {
      state.calls.push(["binding", issuer, subject]);
      if (state.throwAt === "binding") throw Error("private identity diagnostic");
      return state.bindings.filter(b => b.issuer === issuer && b.subject === subject);
    },
    async lookupMemberships(userId, tenantId) {
      state.calls.push(["membership", userId, tenantId]);
      if (state.throwAt === "membership") throw Error("private membership diagnostic");
      return state.memberships.filter(m => m.reserveUserId === userId && m.tenantId === tenantId);
    },
    async hasLiveCapability(userId, tenantId, capability) {
      state.calls.push(["capability", userId, tenantId, capability]);
      if (state.throwAt === "capability") throw Error("private permission diagnostic");
      return state.grants.has([userId, tenantId, capability].join("|"));
    },
  };
  return { state, adapter, run: (p = policy) => resolveReserveActor(request, p, adapter, () => NOW) };
}
const denied = { authorized: false };

test("grants only an ephemeral Reserve actor after live identity, exact binding, active membership and capability", async () => {
  const { state, run } = fixture();
  assert.deepEqual(await run(), { authorized: true, actor: {
    identityIssuer: ISSUER, identitySubject: SUBJECT, reserveUserId: USER,
    tenantId: TENANT_A, membershipId: MEMBERSHIP_A
  } });
  assert.deepEqual(state.calls.map(([name]) => name), ["verify", "binding", "membership", "capability"]);
  assert.deepEqual(state.calls[2], ["membership", USER, TENANT_A]);
  assert.deepEqual(state.calls[3], ["capability", USER, TENANT_A, "tenant.settings_manage"]);
});

test("wrong project, unverified and non-live identities never reach business lookups", async () => {
  for (const update of [
    null, { issuer: "https://other-project.example.invalid/auth/v1" },
    { sessionActive: false }, { identityVerified: false }, { anonymous: true },
    { sessionId: null }, { expiresAtMs: NOW }, { verifiedAtMs: NOW - 30001 },
    { verifiedAtMs: NOW + 5001 }, { subject: "" }, { subject: "\nforged" }
  ]) {
    const { state, run } = fixture();
    state.principal = update === null ? null : { ...state.principal, ...update };
    assert.deepEqual(await run(), denied);
    assert.deepEqual(state.calls.map(([name]) => name), ["verify"], JSON.stringify(update));
  }
});

test("matching email cannot link a distinct issuer/subject or an unrelated Reserve UUID", async () => {
  const { state, run } = fixture();
  state.bindings = [{ issuer: ISSUER, subject: OTHER, reserveUserId: OTHER,
    email: "same@example.invalid" }];
  assert.deepEqual(await run(), denied, "email is not a lookup key");
  assert.deepEqual(state.calls[1], ["binding", ISSUER, SUBJECT]);
  state.calls.length = 0;
  state.bindings = [{ issuer: "https://other-project.example.invalid/auth/v1",
    subject: SUBJECT, reserveUserId: OTHER }];
  assert.deepEqual(await run(), denied, "issuer and subject are both required");
  assert.equal(state.calls.some(([name]) => name === "membership"), false);
});

test("missing, ambiguous or malformed identity bindings fail closed", async () => {
  for (const bindings of [
    [], [{ issuer: ISSUER, subject: SUBJECT, reserveUserId: "not-uuid" }],
    [{ issuer: ISSUER, subject: SUBJECT, reserveUserId: USER },
     { issuer: ISSUER, subject: SUBJECT, reserveUserId: OTHER }],
    [{ issuer: ISSUER, subject: SUBJECT, reserveUserId: USER },
     { issuer: ISSUER, subject: SUBJECT, reserveUserId: USER }]
  ]) {
    const { state, run } = fixture();
    state.bindings = bindings;
    assert.deepEqual(await run(), denied);
    assert.equal(state.calls.some(([name]) => name === "membership"), false);
  }
});

test("shared Auth cannot remap a valid login to a different Reserve User/Owner UUID", async () => {
  const { state, run } = fixture();
  state.bindings[0].reserveUserId = OTHER;
  state.memberships[0].reserveUserId = OTHER;
  state.grants.add([OTHER, TENANT_A, "tenant.settings_manage"].join("|"));
  assert.deepEqual(await run(), denied, "shared auth must preserve subject==Reserve User");
  assert.equal(state.calls.some(([name]) => name === "membership"), false);
  // A genuinely federated deployment may map a distinct subject only after a
  // separately reviewed exact issuer+subject proof of control and linking.
  assert.equal((await run({ ...policy, identityMode: "federated" })).authorized, true);
});

test("foreign Tenant selector, absent membership and mismatched database rows do not grant access", async () => {
  const { state, run } = fixture();
  assert.deepEqual(await run({ ...policy, selectedTenantId: TENANT_B }), denied);
  state.calls.length = 0;
  state.memberships[0].tenantId = TENANT_B;
  assert.deepEqual(await run(), denied);
  state.memberships[0].tenantId = TENANT_A;
  state.memberships[0].reserveUserId = OTHER;
  assert.deepEqual(await run(), denied);
  assert.equal(state.calls.some(([name]) => name === "capability"), false);
});

test("revoked/suspended membership or suspended/archived business loses access on the next call", async () => {
  const { state, run } = fixture();
  assert.equal((await run()).authorized, true);
  for (const status of ["SUSPENDED", "REVOKED"]) {
    state.memberships[0].membershipStatus = status;
    assert.deepEqual(await run(), denied);
  }
  state.memberships[0].membershipStatus = "ACTIVE";
  for (const status of ["SUSPENDED", "ARCHIVED"]) {
    state.memberships[0].tenantStatus = status;
    assert.deepEqual(await run(), denied);
  }
  state.memberships[0].tenantStatus = "ACTIVE";
  assert.equal((await run()).authorized, true, "eligible user can resume with a fresh check");
});

test("multi-tenant membership requires a specific eligible Tenant and separate capability", async () => {
  const { state, run } = fixture();
  state.memberships.push({ reserveUserId: USER, tenantId: TENANT_B, membershipId: MEMBERSHIP_B,
    membershipStatus: "ACTIVE", tenantStatus: "ACTIVE" });
  assert.deepEqual(await run({ ...policy, selectedTenantId: "" }), denied, "no implicit Tenant selection");
  assert.deepEqual(await run({ ...policy, selectedTenantId: TENANT_B }), denied, "A does not grant B capability");
  state.grants.add([USER, TENANT_B, "tenant.settings_manage"].join("|"));
  const b = await run({ ...policy, selectedTenantId: TENANT_B });
  assert.equal(b.authorized, true);
  assert.equal(b.actor.tenantId, TENANT_B);
  assert.equal(b.actor.membershipId, MEMBERSHIP_B);
});

test("forged Owner, OAuth scope, account metadata and query parameters never grant a capability", async () => {
  const { state, run } = fixture();
  state.principal.role = "Owner";
  state.principal.scope = "email ownership.manage tenant.settings_manage";
  state.principal.app_metadata = { role: "Owner", tenant_id: TENANT_B };
  state.grants.clear();
  assert.deepEqual(await run(), denied);
  assert.deepEqual(await run({ ...policy, requiredCapability: "ownership.manage" }), denied);
  assert.equal(state.calls.every(call => !call.includes("Owner")), true);
});

test("a sensitive route's capability and allowed Tenant state must be explicitly declared", async () => {
  const { run } = fixture();
  for (const p of [
    { ...policy, requiredCapability: "" },
    { ...policy, requiredCapability: "Owner" },
    { ...policy, allowedTenantStatuses: [] },
    { ...policy, identityMode: "unknown" },
    { ...policy, allowedTenantStatuses: ["ARCHIVED"] },
    { ...policy, allowedTenantStatuses: ["ACTIVE", "ACTIVE"] }
  ]) assert.deepEqual(await run(p), denied);
  assert.deepEqual(await run({ ...policy, allowedTenantStatuses: ["ACTIVE"] }), denied,
    "SETUP must not qualify for an ACTIVE-only action");
});

test("duplicate membership records and permission revocation fail closed, even with unchanged identity", async () => {
  const { state, run } = fixture();
  state.memberships.push({ ...state.memberships[0], membershipId: MEMBERSHIP_B });
  assert.deepEqual(await run(), denied);
  state.memberships.pop();
  assert.equal((await run()).authorized, true);
  state.grants.clear();
  assert.deepEqual(await run(), denied, "a previously allowed action must recheck capability");
});

test("provider and database errors fail closed without passing through diagnostics", async () => {
  for (const phase of ["verify", "binding", "membership", "capability"]) {
    const { state, run } = fixture();
    state.throwAt = phase;
    const result = await run();
    assert.deepEqual(result, denied);
    assert.doesNotMatch(JSON.stringify(result), /private|provider|diagnostic|error/i);
  }
});

test("the contract is not wired to Reserve /app or any hosted sign-in route", () => {
  const gate = readFileSync(new URL("../app/lib/product-access.server.ts", import.meta.url), "utf8");
  assert.match(gate, /Intentionally no provider adapter yet/);
  assert.doesNotMatch(gate, /reserve-actor-contract/);
  assert.match(gate, /return new Response\(null, \{ status: 302/);
  const oauth = readFileSync(new URL("../app/lib/veni-oauth-client.server.ts", import.meta.url), "utf8");
  assert.match(oauth, /productAccess: "not_granted"/);
  assert.doesNotMatch(oauth, /reserve-actor-contract/);
});
