# Local database foundation tests

Use Node 24, pnpm 12.11.2, Supabase CLI 2.122.0 and the running project-local
Docker stack. Docker must be on PATH (per-user Windows installs may need
Docker Desktop's resources/bin directory).

```sh
npx pnpm@12.11.2 exec supabase db reset --local --no-seed
npx pnpm@12.11.2 test:db
npx pnpm@12.11.2 exec supabase db advisors --local --fail-on error
```

Reset destroys local data and reconstructs migrations. test:db does not reset
automatically and accepts no remote target. If a reset leaves the loopback API
resetting despite healthy containers, the previously verified remedy is only
`docker restart supabase_kong_veni-reserve`, followed by a local retry.

The wrapper verifies the loopback Auth URL and creates two synthetic identities
using the supported Auth Admin API, never fabricated provider rows. Credentials
remain in memory. SQL fixtures contain only generated identity UUIDs and safe
synthetic verifier bytes, never raw invitation tokens. pgTAP fixtures roll back;
the concurrency fixture is committed then explicitly removed in a serializable
transaction. Auth fixtures and temporary SQL files are removed in finally.
Cleanup failure fails the command. Interrupted execution may require targeted
local synthetic-fixture cleanup or an explicitly authorized reset.

## Coverage and boundary

m1_1a.sql retains all 67 accepted assertions and their meaning. It finishes
temporary tenants with coherent Owners before checking deferred constraints.
m1_1b.sql independently checks the approved catalogue/matrix, multi-role and
tenant scope, Owner invariants, invitation structure, audit and default-deny
privileges. It deliberately does not fake provider authentication.

m1_1b_concurrency.mjs uses two persistent independent psql backends inside the
known local database container. Barriers coordinate both writes before commit;
neither racing transaction pre-reads the Owner predicate. The production
deferred trigger must establish the dependency. Separate deletion and suspension
races each require one COMMIT, one serialization failure and one remaining
ACTIVE Owner. The harness also tests rejected ordinary isolation, an actual
ownerless COMMIT, and committed fixture cleanup. It runs inside test:db.
No new package dependency, application test command or hosted CI job is added.

## AR-027 persistence decisions

Seven new relations:

- public.permissions: 53 global stable capability codes.
- public.roles: four SYSTEM presets; CUSTOM roles require a Tenant.
- public.role_permissions: 132 explicit standard mappings (53/46/24/9).
- public.membership_roles: multiple roles, restrictive parents and checked scope.
- private.invitations: immutable issuance data and terminal receipt.
- private.invitation_roles: immutable intended set, no Owner.
- public.audit_events: attributed append-only tenant access events.

Role IDs are deterministic UUIDs ending 001 (Owner), 002 (Admin),
003 (Reception), 004 (Staff), under prefix 10000000-0000-4000-8000-000000000.
Display labels are not security authority. System identities/mappings are
protected; later catalogue migrations must deliberately change protections.
CUSTOM roles cannot use reserved codes or ownership.manage.

### Owner integrity

Tenant/Membership/assignment writes require an explicit SERIALIZABLE transaction.
This deliberately covers more writes than only Owner removal, avoiding fragile
classification or bypass paths. Deferred constraint triggers check the final
state: every remaining Tenant has an ACTIVE Membership assigned the immutable
Owner UUID. Parent identity/scope is immutable; TRUNCATE is blocked.
Serializable predicate conflict detection prevents concurrent Owner write skew.
Callers must retry the entire transaction after serialization failure, including
future authorization checks, not just the final query.

A trusted bootstrap transaction creates a real application User projection,
Tenant, ACTIVE Membership and Owner assignment together. No public helper/API
is created. The migration refuses pre-existing Tenant rows pending explicit
ownership reconciliation; it never backfills guessed Owners. A's migration is
unchanged. No committed ownerless SETUP or archived Tenant is permitted.

### Invitations

Expiry is exactly seven UTC calendar days (168 hours) from creation. The trusted
issuer supplies timestamps; no ordinary API grants exist. Email must already
be lower-case/trimmed; dots and plus tags remain. State is derived:
accepted timestamp, else revoked timestamp, else time-based expiry, else pending.
Accepted/revoked facts are mutually exclusive and terminal receipts immutable.

A 32-byte one-way verifier is stored, never raw secret. Future issuance should
generate 32 random bytes, and hash a documented purpose/tenant/invitation-bound
encoding; generation, delivery, provider identity matching and secret consumption
are NOT implemented here. Database shape cannot prove entropy or correct hashing.

A partial unique index permits one unaccepted/unrevoked issuance per tenant/email,
including expired records until explicitly superseded. Tenant-scoped request key,
fingerprint, issuer and supersedes reference support later idempotency. Reissue
requires new verifier and retained superseded history. Later service code compares
fingerprints and does not retrieve raw tokens from hashes.

The internal issuance_xid is assigned by a trigger from PostgreSQL's full
transaction ID. Intended roles can be inserted only during that issuing
transaction; a deferred check requires a nonempty set. They cannot be edited or
removed, or added in a later transaction. Terminal invitations also reject adds.
The column is immutable, not an authorization identity.

Acceptance receipt validation checks matching Tenant/User/Membership references,
ACTIVE state, current expiry and intended assignments already present. This is
integrity support, NOT an authenticated acceptance service. Future workflows must
revalidate issuer authority, verified email and token, serialize reactivation/
revocation races, and apply the approved ACTIVE/SUSPENDED/REVOKED semantics.
No Staff is created, and own-scope capability codes grant no operational access
until future Staff linkage and policies exist.

### Audit

The 11 access action codes accept USER or bounded SERVICE actor forms. Actor
Membership must match User/Tenant; target must exist in the same Tenant.
Occurrence time is database-assigned. Metadata admits only lifecycle values
and UUID-shaped reference fields; arbitrary keys/free text/credential dumps
are rejected. Normal UPDATE/DELETE/TRUNCATE is blocked. Restrictive actor FKs
and generated target FK projections preserve attribution under concurrent deletion.
Database owner/DDL privileges remain the trusted administrative boundary.

No authenticated mutation service is implemented, so these tables do not
automatically infer an actor or promise an event for every raw privileged SQL
write. Future trusted mutation writers must append required events in the same
transaction; tests prove coherent rollback of state plus supplied success event.
Denied attempts require a separate later log channel, not rolled-back audit.
Retention and controlled administrative erasure remain separate future policy.

### Structural security

All seven relations enable RLS with zero operative policies. PUBLIC, anon and
authenticated table privileges are absent; private schema usage and internal
function execution are restricted. Functions use SECURITY INVOKER and a fixed
empty search_path. Privileged structural tests do not establish operative
tenant authorization. Actual grants, capability enforcement and identity/provider
integration tests remain M1.2 or later domain workflow work.

References: Master Product Ledger v1.1; Architecture Reconciliation Register
v0.1, AR-026 and AR-027; [ADR 0002](../../docs/adr/0002-access-foundation.md).
M1.1 stays open until independent review and authorized integration.
