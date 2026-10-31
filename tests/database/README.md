# Local database foundation tests

Use Node 24, pnpm 12.11.2, Supabase CLI 2.122.0 and the running project-local
Docker stack. Docker must be on PATH (per-user Windows installs may need
Docker Desktop's resources/bin directory).

```sh
npx pnpm@12.11.2 exec supabase db reset --local --no-seed
npx pnpm@12.11.2 test:db
npx pnpm@12.11.2 test:security
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

m1_1a.sql retains 67 regression assertions. The obsolete zero-policy/no-SELECT
expectations are updated to AR-028; persistence checks retain their meaning. It finishes
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
No new package dependency or hosted CI job is added. The separate test:security
command below exercises genuine local Auth/PostgREST behavior.

## M1.2 security evidence (AR-028)

`m1_2.sql` adds 260 structural pgTAP assertions. Together with 67 M1.1A and
139 M1.1B assertions, test:db executes 466 pgTAP assertions plus the five real
connection checks. The exact seven-policy inventory, effective table/column
privileges (including inherited rights), schema privileges, eight helper signatures,
owners/modes/STABLE/search_path, absence of PUBLIC EXECUTE and internal-trigger
restrictions are asserted independently. SQL request claims test guard edge cases
and graph behavior; they are explicitly not evidence of provider authentication.

`test:security` is destructive to the **disposable local veni-reserve database**.
Do not run alongside other local database users or tests. It accepts no remote
target, validates the canonical project ID, exact loopback API URL and database
container project label before reset, and always passes `--local`. It performs
clean resets before and after the real API fixture run. Committed immutable audit
and invitation fixtures are removed by reset, never by weakening history triggers.

Anonymous sign-in is enabled only in a copied config inside an OS temporary CLI
work directory. Accepted migrations are copied there, and the same local project
is stopped/restarted with that temporary configuration. Canonical config.toml is
never edited. At completion the CLI restarts from the canonical work directory,
verifies the unchanged configuration and zero synthetic Auth/business rows, and
removes the temporary directory. The test uses the existing local service set;
edge-runtime, imgproxy, logflare, vector and supavisor are excluded. No hosted
configuration or account is accessed. A forcibly killed process can prevent
finally cleanup; restore the canonical local stack and perform the guarded reset
before further work if execution is interrupted. Cleanup failure fails the suite.

Supported Auth Admin creation and password sign-in provide real permanent
sessions. Supported anonymous signup provides a real anonymous session. Provider
classification is checked before assertions; a contradiction fails rather than
loosening the guard. Credentials/passwords remain in memory, and failures print
bounded assertion names/statuses rather than response bodies, headers or CLI
credential output. Fixture email addresses use example.invalid; invitation
verifier bytes are synthetic test data, not usable invitation secrets.

The HTTP matrix covers anon/anonymous, self-only global User reads, no-membership,
zero-role, inactive self-status, A/B isolation, independent multi-tenant authority,
SYSTEM/CUSTOM visibility, audit scope, lifecycle, unchanged-token revocation and
mapping/role changes, redundant grants, filters/order/pagination/count/HEAD,
singular results, FK embeds/inner joins and recursion. POST/PATCH/DELETE/upsert
must return privilege errors, with exact ten-table snapshots unchanged. Private
schema/profile and guessed RPC routes must remain unavailable. Representative
restricted-role EXPLAIN ANALYZE diagnostics report execution time on small
synthetic data; they are not a production scale benchmark. No speculative index
is added.

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

M1.1 introduced structural default-deny RLS. AR-028 / M1.2 adds exactly seven
authenticated SELECT policies and no write policy. PUBLIC/anon/service_role have
no application-table privileges. Authenticated has SELECT only on tenants, users,
memberships, roles, role_permissions, membership_roles and audit_events. Direct
permissions/invitation reads remain denied. Public schema usage is retained;
API roles cannot CREATE there. Private schema usage and exact authorization
helper execution are authenticated-only. Integrity functions remain invokers;
the seven read-only authorization graph helpers are private definers. See ADR 0003
for rationale, lifecycle exceptions and mutation boundaries.

References: Master Product Ledger v1.1; Architecture Reconciliation Register
v0.1, AR-026, AR-027 and AR-028;
[ADR 0002](../../docs/adr/0002-access-foundation.md) and
[ADR 0003](../../docs/adr/0003-database-live-read-authorization.md).
M1.1 is reviewed, integrated and closed. M1.2 requires independent implementation
review, publication, merge and post-merge evidence before closure. M1.3 owns
hosted database/security CI; no CI expansion is included here.
