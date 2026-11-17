# Veni Reserve — shared account actor contract and M2/M7 compatibility

**17 November 2026 · Proposed local-only increment · no production adapter or hosted migration**

## Why this increment exists

The preferred **development** route is one Website-owned Veni Account Supabase Auth provider, separate Reserve namespaces, and independent Reserve product journeys (Option A). This is not an approval to perform a hosted import. The Reserve Master Product Ledger VR-1486–1490 remains authoritative. The same login can identify an individual across products, but never grants Reserve business ownership, a Tenant membership, an Arcana entitlement or a Performance organisation role.

The new server-only module app/lib/reserve-actor-contract.server.ts is an **unused proposed interface**. It is neither a JWT validator nor a functional account link. It is intentionally *not imported* into /app, the OAuth callback, the local tenant bootstrap, or any Worker route. The deployed and preview account gates remain closed exactly as before.

Its resolveReserveActor(request, policy, trustedAdapter) contract requires, in order:

1. A route-owned issuer, identity transport and capability; a syntactically valid but **untrusted** selected Tenant ID; explicit permitted Tenant statuses.
2. A **server-verified, non-anonymous, currently live** identity/session, checked afresh, with a bounded verification age and session expiry. The eventual trusted adapter must validate signature, issuer, audience, subject and expiry with the appropriate Auth provider, and check the live session, not simply parse a JWT.
3. Exactly one server-owned (issuer, stable_subject) → Reserve User binding. Same-email guesses or client-provided metadata never link users. Under **shared Auth** the Reserve User UUID must equal the verified auth.users.id; under a future federation, any different UUID must have an explicitly reviewed binding.
4. Exactly one **active** Membership for that Reserve User in the selected Tenant, with allowed current Tenant state; no membership or multiple conflicting records denies access.
5. A **current database capability** decision, not an Owner flag, OAuth email scope, JWT role list, query parameter, or previous session's cached grants.

Every error produces a generic authorized:false. An authorised result is **only a short-lived server-side context**, never a bearer token, a role transfer or permission to write. Future sensitive mutations must redo actor/session/capability checks atomically inside a database transaction or RLS-aware RPC: a preflight taken moments earlier is not sufficient.

### Evidence scope

- Command: node --experimental-strip-types --test tests/reserve-actor-contract.test.mjs
- Scenarios: correct session/binding/membership/capability, wrong project, expired, anonymous, forged role, same email, ambiguous mapping, shared-Auth identity continuity, cross-Tenant selector, multiple businesses, revoked membership, restricted Tenant state, database errors and local gating.
- Command: node --experimental-strip-types --test tests/reserve-actor-contract.test.mjs tests/veni-oauth-client.test.mjs
- **These are mocked adapters**. No real Website Auth token was sent to a second Reserve backend, no RLS query was executed by the new module, no human browser acceptance or hosted restore was performed. Reserve draft #24 and Website #2–#12 retain their distinct disposable CI evidence.

## Current forward-migration compatibility inventory

The Website shared-backend generators in draft PR #2 (and stacked #4–#12) currently cover the **hosted-source M1 migrations and main-branch M2.1 settings** only. They do **not** import the next two independent Reserve draft migrations, even though the Reserve local Auth/database branch has already executed them in its *own* CI. This is a precise integration gap, not permission to adapt these SQL files by blind search/replace.

| Source, exact Git blob | Current Reserve content | Required Website namespace/security changes | Status |
| --- | --- | --- | --- |
| M1 three hosted migrations and M2.1 settings, pinned in Website #2 | public.tenants/users/memberships, private.* settings, RLS/audit | reserve.* and reserve_internal.*; bounded public.reserve_* settings RPCs, reserve_settings_executor | **Synthetic local prototype proven**; hosted unchanged |
| Reserve PR #20: 20261113111616_tenant_bootstrap.sql, blob 1660931b47eb5415eaa1bd64d284ea499b461479 | Real auth.sessions-checked current_reserve_user, bootstrap_setup_tenant, list_setup_tenants; private idempotent receipt; role veni_bootstrap_executor, SERIALIZABLE ownership/audit | Rename three public RPCs with Reserve prefix; map M1 relations/receipt to Reserve schemas; isolate executor role and grants; preserve live session, SERIALIZABLE retry and active Owner invariant; rerun genuine Auth/RLS tests in shared stack | **NOT converted or integrated into Website #2** |
| Reserve PR #22: 20261114110626_theme_revisions_private_drafts.sql, blob 457669782a5dcb00f3c851f89c9f3cd7fa0b959f | Four private tables: themes, theme_revisions, theme_revision_events, published_theme_assignments; five public RPCs; role veni_theme_executor; immutable Theme revisions, closed publication | Map all four into reserve_internal, rebind FK to reserve.*, rename five public RPCs with Reserve prefix, isolate executor and SECURITY DEFINER ownership, preserve RLS, composite FKs, append-only history and deny-all published assignment | **NOT converted or integrated into Website #2** |

Source references are immutable Git blobs and drafts; neither source is a new hosted migration. The Theme PR #22 branch is separate from the OAuth #24 branch, both building from Reserve #20, so eventual integration needs a reviewed dependency/convergence strategy. Do not merge one branch simply to satisfy this inventory.

### Mandatory acceptance for the next shared-backend SQL prototype

1. No unreviewed new public.* relations/functions, no widened Website/Arcana grants, no exposed reserve_internal tables, and no new server-only service_role in the client.
2. Compare every source blob before transformation; stop on drift/new schema/function/role. Match all FK directions, schema owners, default grants, column privileges, SECURITY DEFINER search paths and function owner RLS posture.
3. A synthetic **genuine** Website Auth session creates one SETUP Tenant with exactly one active Owner; retry is idempotent, audit immutable, settings persist, second Tenant isolated; suspended/revoked and wrong-project/expired sessions denied.
4. The same shared principal saves and rereads an immutable private Theme revision only with themes.read + themes.edit; stale revision, foreign Tenant, revoked capability and public Theme publication denied.
5. Website profile and Arcana journal/entitlement fixtures remain unchanged throughout; account deletion and session revocation continue to fail closed; source Reserve stays untouched.
6. A rollback/re-extraction rehearsal preserves Reserve, Website and Arcana identities/rows without assuming hosted Free-plan automatic backups or full Storage/Vault/provider recovery.

**Next safe implementation batch:** build a *separate, pinned local Website conversion prototype* for PR #20 (bootstrap), then PR #22 (Theme), with live disposable Auth and PostgREST CI before connecting a browser. The new Reserve actor contract may inform that adapter, but must not be imported into real /app routes until a trusted verifier, data mapping and database enforcement have passed independent review.

**No-go:** no hosted Auth/SQL, live accounts, account deletion, new OAuth clients, DNS/Cloudflare, /kids/, booking publication, fees, PR merge, source-project pause or paid resources.
