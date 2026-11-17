/** HERMETIC DESIGN FIXTURE ONLY. Not a production JWT/OIDC library, provider
 * emulator, session implementation or proof of Supabase interoperability.
 * No networking/storage/routes. Keys and fictional sessions die with this test. */
import { createHash, generateKeyPairSync, randomBytes, sign, verify } from "node:crypto";
import { Buffer } from "node:buffer";
import { safeReturnPath } from "../../app/features/site/navigation";
export const ISSUER = "https://fictional-idp.invalid/auth/v1";
export const AUDIENCE = "fictional-reserve-client";
export const CALLBACK = "https://fictional-reserve.invalid/auth/callback";
const random = () => randomBytes(32).toString("base64url");
const encode = (v: unknown) => Buffer.from(JSON.stringify(v)).toString("base64url");
export const challenge = (verifier: string) => createHash("sha256").update(verifier).digest("base64url");
const fail = (): never => { throw new Error("Synthetic contract rejected"); };
export type Claims = { iss: string; sub: string; aud: string; exp: number; iat: number; nbf?: number; nonce: string; email: string; email_verified: boolean };
export function fixtureSigner() {
  const { privateKey, publicKey } = generateKeyPairSync("ec", { namedCurve: "prime256v1" });
  return { publicKey, token(claims: Claims, header = { alg: "ES256", kid: "fixture-key", typ: "JWT" }) {
    const body = `${encode(header)}.${encode(claims)}`;
    return `${body}.${sign("sha256", Buffer.from(body), { key: privateKey, dsaEncoding: "ieee-p1363" }).toString("base64url")}`;
  } };
}
type Transaction = { state: string; nonce: string; verifier: string; challenge: string; browser: string; next: string; expires: number; callback: string };
type Mapping = { issuer: string; subject: string; localUser: string };
export type Membership = { user: string; tenant: string; status: "ACTIVE" | "REVOKED"; tenantStatus: "SETUP" | "ACTIVE" | "SUSPENDED"; capabilities: string[] };
export class SyntheticIdentityContract {
  private pending = new Map<string, Transaction>();
  private codes = new Map<string, { state: string; token: string }>();
  private sessions = new Map<string, { user: string; expires: number }>();
  constructor(private publicKey: ReturnType<typeof fixtureSigner>["publicKey"], private mappings: readonly Mapping[], private clock: () => number) {}
  begin(browser: string, next: string, callback = CALLBACK) {
    if (!browser || callback !== CALLBACK) return fail();
    const verifier = random(), state = random();
    const tx = { state, nonce: random(), verifier, challenge: challenge(verifier), browser, next: safeReturnPath(next), expires: this.clock() + 60, callback };
    this.pending.set(state, tx); return { ...tx };
  }
  issueForTest(state: string, token: string) {
    if (!this.pending.has(state)) return fail();
    const code = random(); this.codes.set(code, { state, token }); return code;
  }
  complete(input: { state: string; code: string; verifier: string; browser: string; callback: string }) {
    const tx = this.pending.get(input.state), code = this.codes.get(input.code);
    // One attempt: even a failed completion cannot be replayed after a correction.
    this.pending.delete(input.state); this.codes.delete(input.code);
    if (!tx || !code || code.state !== input.state || tx.expires <= this.clock() || tx.browser !== input.browser
      || input.callback !== tx.callback || !/^[A-Za-z0-9_-]{43,128}$/.test(input.verifier) || challenge(input.verifier) !== tx.challenge) return fail();
    const parts = code.token.split("."); if (parts.length !== 3 || parts.some(p => !/^[A-Za-z0-9_-]+$/.test(p))) return fail();
    const h = JSON.parse(Buffer.from(parts[0], "base64url").toString()) as Record<string, unknown>;
    if (h.alg !== "ES256" || h.kid !== "fixture-key" || h.typ !== "JWT" || Object.keys(h).some(k => !["alg", "kid", "typ"].includes(k))) return fail();
    if (!verify("sha256", Buffer.from(`${parts[0]}.${parts[1]}`), { key: this.publicKey, dsaEncoding: "ieee-p1363" }, Buffer.from(parts[2], "base64url"))) return fail();
    const c = JSON.parse(Buffer.from(parts[1], "base64url").toString()) as Claims;
    if (c.iss !== ISSUER || c.aud !== AUDIENCE || !c.sub || typeof c.sub !== "string" || c.nonce !== tx.nonce
      || !Number.isFinite(c.exp) || c.exp <= this.clock() || !Number.isFinite(c.iat) || c.iat > this.clock()
      || (c.nbf !== undefined && (!Number.isFinite(c.nbf) || c.nbf > this.clock())) || c.email_verified !== true) return fail();
    // No auto-link by email; no automatic new local Auth user or Owner creation.
    const matches = this.mappings.filter(m => m.issuer === c.iss && m.subject === c.sub);
    if (matches.length !== 1) return fail();
    const session = random(); this.sessions.set(session, { user: matches[0].localUser, expires: Math.min(c.exp, this.clock() + 300) });
    return { session, next: tx.next };
  }
  user(session: string) {
    const s = this.sessions.get(session); return s && s.expires > this.clock() ? s.user : null;
  }
  logout(session: string, origin: string, csrf: string, expectedCsrf: string) {
    if (origin !== new URL(CALLBACK).origin || !csrf || csrf !== expectedCsrf) return fail();
    this.sessions.delete(session); // Local-only logout makes no upstream-revocation claim.
  }
  can(session: string, tenant: string, capability: string, memberships: readonly Membership[]) {
    const user = this.user(session);
    return !!user && memberships.some(m => m.user === user && m.tenant === tenant && m.status === "ACTIVE"
      && ["SETUP", "ACTIVE"].includes(m.tenantStatus) && m.capabilities.includes(capability));
  }
}
