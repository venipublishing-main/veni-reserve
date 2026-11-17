/**
 * Transport-neutral Veni Account -> Reserve actor contract (local proposal).
 *
 * NOT WIRED TO ROUTES. This is not an Auth/JWT verifier, database adapter,
 * permission token or production account-linking API. Only a trusted server
 * implementation may supply the three database methods and live Auth verifier.
 * In particular, a browser-provided email, role, tenant or user_metadata field
 * must never become an IdentityBinding or a capability decision.
 */

const uuid = /^[0-9a-f]{8}-(?:[0-9a-f]{4}-){3}[0-9a-f]{12}$/i;
const subjectPattern = /^[\x21-\x7e]{1,256}$/;
const capabilityPattern = /^[a-z][a-z0-9_]*(?:\.[a-z][a-z0-9_]*)+$/;
const MAX_VERIFICATION_AGE_MS = 30_000;
const FUTURE_CLOCK_SKEW_MS = 5_000;

export type VerifiedPrincipal = Readonly<{
  issuer: string;
  subject: string;
  sessionId: string;
  verifiedAtMs: number;
  expiresAtMs: number;
  sessionActive: true;
  identityVerified: true;
  anonymous: false;
}>;

export type ReserveIdentityBinding = Readonly<{
  issuer: string;
  subject: string;
  reserveUserId: string;
}>;

export type ReserveMembershipRecord = Readonly<{
  membershipId: string;
  reserveUserId: string;
  tenantId: string;
  membershipStatus: "ACTIVE" | "SUSPENDED" | "REVOKED";
  tenantStatus: "SETUP" | "ACTIVE" | "SUSPENDED" | "ARCHIVED";
}>;

export type TrustedReserveActorAdapter = Readonly<{
  /** Must verify provider signature/issuer/audience/subject/expiry and check a
   * live, non-revoked provider session on this request, not merely decode JWT. */
  verifyLivePrincipal: (request: Request) => Promise<VerifiedPrincipal | null>;
  /** Exact (issuer, subject) binding, checked from server-owned records.
   * For shared Supabase Auth, Reserve's user UUID remains auth.users.id. */
  lookupIdentityBindings: (issuer: string, subject: string) => Promise<readonly ReserveIdentityBinding[]>;
  /** RLS-/tenant-scoped database lookup, not a browser-supplied role list. */
  lookupMemberships: (reserveUserId: string, tenantId: string) => Promise<readonly ReserveMembershipRecord[]>;
  /** Server-side capability decision against CURRENT membership/roles and
   * tenant status, with no bypassrls service_role client in a browser. */
  hasLiveCapability: (reserveUserId: string, tenantId: string, capability: string) => Promise<boolean>;
}>;

export type ReserveActorPolicy = Readonly<{
  issuer: string; // trusted configured Auth issuer, never read from request
  identityMode: "shared-auth" | "federated"; // trusted architecture configuration
  selectedTenantId: string; // untrusted selector; permission is queried afresh
  requiredCapability: string; // route-owned capability, not submitted form data
  allowedTenantStatuses: readonly ("SETUP" | "ACTIVE")[];
}>;

export type ReserveActorResult =
  | Readonly<{ authorized: false }>
  | Readonly<{ authorized: true; actor: Readonly<{
      identityIssuer: string;
      identitySubject: string;
      reserveUserId: string;
      tenantId: string;
      membershipId: string;
    }> }>;

const denied = (): ReserveActorResult => ({ authorized: false });
const isObject = (value: unknown): value is Record<string, unknown> =>
  value !== null && typeof value === "object" && !Array.isArray(value);
const isUuid = (value: unknown): value is string => typeof value === "string" && uuid.test(value);

/**
 * Establish only an ephemeral server-side actor context for the chosen Tenant.
 * Each sensitive operation must call again; every actual write must also
 * enforce the SAME checks atomically in its database transaction/RLS/RPC.
 */
export async function resolveReserveActor(
  request: Request,
  policy: ReserveActorPolicy,
  adapter: TrustedReserveActorAdapter,
  now: () => number = Date.now,
): Promise<ReserveActorResult> {
  try {
    if (!isObject(policy) || !isUuid(policy.selectedTenantId) ||
        typeof policy.issuer !== "string" || !policy.issuer.trim() ||
        !["shared-auth", "federated"].includes(String(policy.identityMode)) ||
        typeof policy.requiredCapability !== "string" ||
        policy.requiredCapability.length > 100 || !capabilityPattern.test(policy.requiredCapability) ||
        !Array.isArray(policy.allowedTenantStatuses) || policy.allowedTenantStatuses.length === 0 ||
        !policy.allowedTenantStatuses.every(s => s === "SETUP" || s === "ACTIVE") ||
        new Set(policy.allowedTenantStatuses).size !== policy.allowedTenantStatuses.length) return denied();

    const principal: unknown = await adapter.verifyLivePrincipal(request);
    const at = now();
    if (!Number.isFinite(at) || !isObject(principal) ||
        principal.issuer !== policy.issuer ||
        typeof principal.subject !== "string" || !subjectPattern.test(principal.subject) ||
        !isUuid(principal.sessionId) ||
        principal.sessionActive !== true || principal.identityVerified !== true ||
        principal.anonymous !== false ||
        typeof principal.verifiedAtMs !== "number" || !Number.isFinite(principal.verifiedAtMs) ||
        principal.verifiedAtMs > at + FUTURE_CLOCK_SKEW_MS ||
        at - principal.verifiedAtMs > MAX_VERIFICATION_AGE_MS ||
        typeof principal.expiresAtMs !== "number" || !Number.isFinite(principal.expiresAtMs) ||
        principal.expiresAtMs <= at) return denied();

    const bindings: unknown = await adapter.lookupIdentityBindings(principal.issuer, principal.subject);
    if (!Array.isArray(bindings) || bindings.length !== 1 ||
        !isObject(bindings[0]) || bindings[0].issuer !== principal.issuer ||
        bindings[0].subject !== principal.subject || !isUuid(bindings[0].reserveUserId)) return denied();

    const reserveUserId = bindings[0].reserveUserId;
    // Option A MUST preserve the canonical auth.users.id across Veni Spheres.
    // A federation may map a distinct subject, but only through the explicit
    // reviewed and server-owned binding table (never by matching email).
    if (policy.identityMode === "shared-auth" &&
        (!isUuid(principal.subject) || reserveUserId !== principal.subject)) return denied();
    const memberships: unknown = await adapter.lookupMemberships(reserveUserId, policy.selectedTenantId);
    if (!Array.isArray(memberships) || memberships.length !== 1 ||
        !isObject(memberships[0]) || !isUuid(memberships[0].membershipId) ||
        memberships[0].reserveUserId !== reserveUserId ||
        memberships[0].tenantId !== policy.selectedTenantId ||
        memberships[0].membershipStatus !== "ACTIVE" ||
        !policy.allowedTenantStatuses.includes(memberships[0].tenantStatus as "SETUP" | "ACTIVE")) return denied();

    const permitted = await adapter.hasLiveCapability(reserveUserId, policy.selectedTenantId, policy.requiredCapability);
    if (permitted !== true) return denied();
    return { authorized: true, actor: {
      identityIssuer: principal.issuer,
      identitySubject: principal.subject,
      reserveUserId,
      tenantId: policy.selectedTenantId,
      membershipId: memberships[0].membershipId as string,
    } };
  } catch {
    // No provider/database errors, tokens, emails or tenant enumeration in API output.
    return denied();
  }
}
