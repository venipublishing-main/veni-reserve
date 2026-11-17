# Local private Theme Revisions — M7 storage foundation

## Boundary and provenance

This candidate is stacked on the local authenticated Tenant bootstrap (`feat/local-tenant-bootstrap-20261113`, PR #20). The owner reported completing every Business Setup walkthrough step successfully on 14 November 2026. The new work is a **separate draft** for disposable local Auth/PostgreSQL only; it does not merge PR #20, apply hosted migrations, publish a Theme or change public SSR/Playground/parent-site deployments.

The design follows the Master Product Ledger §21 and AR-017: a stable Tenant-owned Theme, immutable Theme Revision snapshots and a separate, currently closed published-theme assignment. The implemented V1 surface is purposefully small: hex primary/accent colours and an allowlisted system/serif typography preset. No tenant CSS/HTML/script, arbitrary URLs, stored local blobs, uploaded logo or unreviewed external font is accepted. Themes affect presentation only, never scheduling or permissions.

## Private persistence contract

- `private.themes` owns the stable Theme ID, Tenant, name, lifecycle and current private draft pointer.
- `private.theme_revisions` is append-only with stable revision IDs, monotonically increasing per-Theme numbers, schema version, strict normalized design tokens, source-revision lineage and actor attribution.
- `private.theme_revision_events` is an immutable, actor/membership-attributed journal, inserted in the same transaction as each snapshot and pointer movement.
- All pointers and source links have Tenant-consistent composite foreign keys. A deferred pointer FK allows a revision and pointer to change atomically; optimistic `expected` guards prevent a stale edit overwriting a newer one.
- `private.published_theme_assignments` is reserved and RLS-closed, with **no usable role grants or mutation/public rendering endpoint**. Draft saves do not activate any public booking appearance.
- A separate `veni_theme_executor` role is NOLOGIN, NOBYPASSRLS and limited to precise table operations. The public RPC wrappers first check a genuine, still-live provider session. The private executor also checks active Tenant Membership and `themes.read` / `themes.edit` capability from the canonical role mapping. No actor, role or Tenant context is accepted from editable metadata.
- RLS protects all four private tables. Anonymous/foreign/revoked/no-role callers are denied, even when guessing Theme and Revision identifiers. History and private preview require `themes.read`; saved edits additionally require `themes.edit`.
- The server rejects invalid token types, extra keys, oversized/unsafe names, nonnumeric revisions and stale expected versions. Invalid writes and journal failures must leave both pointer and revision history unchanged.

## Loopback-only owner interface

Run the existing pinned local stack and `corepack pnpm dev:local-tenant`, then open `http://127.0.0.1:5192/development/business`. After fictional User A selects a business with saved canonical settings, the **Private Theme Studio — local persistence** appears.

The same restricted `/development/local-api` handler offers:

| Method and relative path | Behaviour |
| --- | --- |
| `GET /tenants/:tenant/themes` | List authorized saved private Themes |
| `POST /tenants/:tenant/themes` | Create a named Theme with revision 1 |
| `GET /tenants/:tenant/themes/:theme` | Read current draft and revision history |
| `PUT /tenants/:tenant/themes/:theme` | Append immutable revision with expected version |
| `GET /tenants/:tenant/themes/:theme/revisions/:number` | Privately inspect an exact historical snapshot |

The browser has no provider bearer or service key; the existing HttpOnly SameSite local cookie is verified server-side. Tenant switches reset the Theme component. History can be copied into an **unsaved** editor and saved as a new revision, never edited in place. Reset controls affect only unsaved values. The legacy unsaved onboarding demonstration is still separate, and the Publish control remains disabled.

## Manual acceptance after CI

1. Sign in as synthetic A and open a saved fictional business. Create a named Theme, preview its colours/type and save revision 1.
2. Edit its tokens and save revision 2; confirm history contains both snapshots. Preview revision 1, then copy it into the editor and save revision 3 without altering historical rows.
3. Reload the page, open the same business/Theme and verify all revisions. Restart **only the application** and repeat. Resetting the disposable database intentionally destroys the records.
4. Confirm an old edit version reports a conflict and retains unsaved browser input; invalid CSS/HTML/unknown keys cannot be saved.
5. Sign in as synthetic B. A's Theme list, guessed Theme URL and guessed historical revision must remain inaccessible.
6. Confirm the public booking preview, separate Playground and parent discovery remain unchanged; no Theme is published or connected to real bookings.

## Verification

`corepack pnpm typecheck`, `lint`, `test`, `build`, `test:db`, `test:security`; CI also runs `local/smoke.mjs` before and after an actual application restart, SSR and Playground publication-boundary tests, and final local database hygiene/advisors. The theme-specific SQL structural suite is `tests/database/theme_revisions.sql`; genuine Auth/RLS/concurrency/rollback checks are `tests/database/theme-revisions.ts`.

This development environment has Node/pnpm but no Docker engine, so it can run application checks but **cannot claim local pgTAP/real-Auth success**. The GitHub `database-security` job must pass before database implementation is considered verified. The owner must separately accept browser interaction/layout.

## Deliberately unimplemented

No hosted migration, merge, real federation, production sessions or customer data. No Brand Asset upload/storage integration, third-party font, public resolved theme projection, publication/rollback RPC, public assignment update, scheduling, tenant activation or logo redesign. A later bounded M7 slice must validate approved assets, accessibility/contrast, exact publication snapshots, optimistic publisher concurrency and atomic published-pointer/audit changes before any public rendering. Theme draft persistence alone does **not** close full Milestone M7.
