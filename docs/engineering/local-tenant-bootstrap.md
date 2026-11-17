# Local Tenant bootstrap — Issue 18

## Scope and trust boundary

This slice is disposable LOCAL Supabase only. It does not enable public registration, OIDC federation, booking publication or hosted persistence. The public SSR and static Playground deployments remain unchanged. The parent website integration was already merged by the owner; this branch does not touch it.

`corepack pnpm dev:local-tenant` serves http://127.0.0.1:5192/development/business. Docker Desktop must be running with the canonical local `veni-reserve` Supabase stack. Use the pinned Node 24 / pnpm 12.11.2 / Supabase 2.122.0 tooling. With `SUPABASE_EXPERIMENTAL_STACK=0`, `node tests/database/ci.mjs check`, `start` and `reset` validate/start/reconstruct this disposable stack. **Reset destroys its synthetic records.** Never substitute a hosted URL or link this worktree to a hosted project.

The Vite-only harness verifies Docker/project identity and rejects hosted environment configuration. Its two sign-in buttons create/reuse fixed fictional local Auth identities. No owner password is needed. Provider admin access is confined to issuing those fixed synthetic Auth links; business writes use the verified user's bearer and database RLS. Auth tokens and keys stay out of JSON, logs, source, and browser JavaScript. The local session cookie is HttpOnly, SameSite=Strict, path-limited and intentionally HTTP-loopback-only; this is not a production cookie/session implementation. No refresh tokens are retained. A new sign-in is required after expiry.

Auth `/user` verification plus a database live-session lookup establish the current Reserve UUID. User-controlled email, metadata, tenant IDs and role claims do not establish authority. Each settings request resolves active authorized memberships again. Logout invalidates the provider session; the RPC boundary rejects a still-signed token whose session was revoked.

## Atomicity and privileges

Migration `20261113111616_tenant_bootstrap.sql` adds a durable identity-bound operation receipt and a SERIALIZABLE bootstrap RPC. One transaction creates the User projection, SETUP Tenant, ACTIVE Membership, canonical system Owner assignment, two correlated audit events and receipt. Existing M1 guards run before commit. Same-key retries converge; different explicit requests can create different businesses. Cross-user key reuse is rejected. Transient serialization/unique/deadlock errors have bounded same-key retries; uncertain responses never silently switch to a new request key.

The executor is NOLOGIN, NOBYPASSRLS, non-superuser and unavailable through role membership. Its fixed SQL function accepts only a request UUID, not arbitrary Tenant/User/role input. Existing audit locking requires UPDATE privilege on Membership `id`; the executor receives that column only and an UPDATE policy with `WITH CHECK(false)`. Mutation remains forbidden. Read policies allow the fixed function to inspect invariant/receipt state; callers cannot assume its role. SQL has an empty search path. Existing broad structural policy-count assertions were scoped to their original roles, with separate exact coverage for the 12 new executor policies and column privilege.

The existing M2.1 table, validation, optimistic revisions and audit implementation are reused. Its public RPC wrappers additionally require a live local Auth session. Five migrations reconstruct locally. Hosted staging remains at the previously recorded three M1 migrations: M2.1 and bootstrap are source-controlled candidates, **not applied hosted**.

## Manual local review

1. Open the local URL; sign in as fictional A. Create/safely retry the current business. Repeating the request must select the same Tenant.
2. Save a fictional display name, timezone, locale, currency and supported staff terminology. Reload and edit; revisions advance. A stale revision must not overwrite newer data.
3. Refresh the page, sign out/in, or restart only the local application. Select the existing business and confirm saved settings. Database reset is intentionally destructive.
4. Sign in as fictional B. A's business is absent; a forged A settings URL cannot read or write it.
5. Use the explicit separate-business action only when intentionally creating another Tenant.
6. Theme Studio under the unsaved demonstration remains memory-only. It does not create Theme revisions or persist logos.

Actual browser interaction/layout acceptance remains manual. HTTP tests prove request/response and persistence behavior, not visual acceptance.

## Validation

- `corepack pnpm typecheck`, `lint`, `test`, `build`.
- `corepack pnpm test:db`: pgTAP plus real concurrent Owner-invariant connections.
- `corepack pnpm test:security`: genuine local Auth/PostgREST tests, M2.1 security and bootstrap concurrency/rollback/revocation. Guarded lifecycle resets synthetic fixtures and restores canonical config.
- With the local application running: `node local/smoke.mjs`; restart the application; `node local/smoke.mjs --resume`. The only disk receipt is synthetic IDs/settings in ignored `.tmp/local-tenant-proof.json`, never credentials.
- Main HTTP: `node scripts/site-smoke.mjs http://127.0.0.1:5185` against Vite preview.
- `corepack pnpm build:ssr-preview`; `node ssr-preview/verify.mjs --for-publication`; local Wrangler and `node ssr-preview/smoke.mjs http://127.0.0.1:5186`.
- `corepack pnpm build:playground-preview`; `node preview/verify-artifact.mjs --for-publication`; local Wrangler and existing `preview/smoke.mjs`.
- CI reproduces local HTTP save, actual application restart, fresh sign-in and settings readback, then resets before hygiene/advisors.

## Later Theme storage/permission test contract — NOT implemented

M7 should use a stable tenant-owned Theme identity and immutable Theme Revision records, with tenant-consistent foreign keys. Draft/private preview access requires active membership and the canonical `themes.read` / `themes.edit` capabilities; publication separately requires `themes.publish`; asset mutation requires `brand_assets.manage`. Final capability identifiers must be reconciled with the canonical catalogue before migration. A public page may resolve only its explicitly published revision and approved asset references. Editing makes a new revision, never updates a published revision in place. Publishing/rollback changes an authorized pointer with audit evidence and optimistic concurrency; rollback does not erase history.

Required future database tests: cross-Tenant Theme/Revision/asset references rejected, anonymous drafts denied, revoked/roleless members denied, read-only membership cannot edit/publish, immutable revisions reject UPDATE/DELETE, concurrent publication conflicts safely, failed publication rolls back all pointers/audit, deleted/private assets cannot leak through public revision rendering. No current test claims these unbuilt tables exist.

## Remaining gates

Owner browser acceptance; trusted upstream OIDC investigation only after separate permission; production session/CSRF/expiry design; separately reviewed hosted M2.1/bootstrap rollout; later Theme Revision persistence. Public sign-up, bookings, capacity-N, branding redesign and deployment remain outside this change.
