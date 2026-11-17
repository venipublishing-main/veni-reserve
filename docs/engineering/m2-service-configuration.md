# M2 Service catalogue — disposable local implementation candidate

**Status:** Draft, unmerged and local-only. This Service slice is stacked on
M2 Location (Reserve PR #28) and the earlier Theme, Tenant bootstrap and SSR
review branches. It is **not** permission to migrate any hosted database.

## Purpose and contractual boundaries

Every Service is a Tenant-owned offering, distinct from a booking/Appointment
and from any Staff Member or Location. The catalogue stores:

- Identity, name, optional customer description and category; two Services can
  share a name because their immutable IDs are authoritative.
- Default duration, before/after buffers, and optional minimum notice and
  maximum advance-booking overrides. The latter are configuration values,
  **not** availability enforcement until M3.
- Optional nonnegative integer minor-unit price and ISO currency override.
  Null currency inherits the Tenant currency. Presentation is separately
  `AMOUNT`, `FROM`, `ON_REQUEST`, or `HIDDEN`; public display is still gated.
  The local editor uses ISO currency decimal exponents, never floating-point
  amounts as an API/database contract.
- Independent operational state (`ACTIVE`, `INACTIVE`, `ARCHIVED`), future
  `public_visible` intent and future `online_bookable` intent. No choice here
  constitutes published public access. Online booking must later still
  resolve a valid Service–Staff–Location eligibility intersection.
- Stable UUID and `(tenant_id,id)` key for future eligibility relationships,
  optimistic revisions, no routine hard deletion, and an immutable
  actor-attributed journal of creates, updates and archives.

## Trust and persistence model

`private.services` and `private.service_events` are RLS-protected and never
directly granted to `anon`, `authenticated` or `service_role`. A dedicated
non-login, non-BYPASSRLS, non-inheriting executor owns two guarded private
functions; authenticated public invoker RPCs have no public relation access.

The existing **services.read** capability permits private reads; only
**services.manage** (plus read) permits writes. This is deliberately
different from Location's Tenant settings capability: Reception and Staff
can read Services without being able to edit them. Tenant and live-session
checks happen in PostgreSQL, not just in the local UI. The local harness
only serves synthetic users at `127.0.0.1:5192`.

Whole-document input validation rejects unknown keys, unsafe text, wrong
JSON scalar types, unrecognised currency overrides, excessive durations and
buffers, and invalid prices; changes and their audit events commit atomically.
Concurrent edits use an expected revision, and archived rows cannot be
silently reactivated. No special optometry fields or real VVB data exist.

## Verification gate

1. `pnpm typecheck`, `pnpm lint`, `pnpm test`, and both builds.
2. Reconstruct every accepted and draft migration in a disposable local
   Supabase Docker stack. Run pgTAP Service table/policy/function audits.
3. Genuine Auth and PostgREST tests cover Owner/Reception/foreign tenant,
   visibility independence, ISO currency, invalid inputs, archive, logout,
   concurrent updates and transactional journal failure.
4. Local HTTP smoke creates/edits a synthetic Service, restarts the real
   local application server, and verifies PostgreSQL persistence and tenant
   isolation. The CI teardown removes its synthetic test environment.
5. Manual Owner walkthrough can then verify create/reload/edit/deactivate/
   archive with fictional entries in `/development/business`.

## Not authorised or implemented

No hosted Supabase migration, merge/deploy, public catalogue/projection,
Staff/Location eligibility, availability calculations, appointment commit,
payment, messaging, Resource scheduling, real patient data or capacity-N
semantics. The separate Website/Veni Account consolidation gate still applies.

Next canonical milestones: **M2 Staff → Staff↔Location → Staff↔Service
overrides → Service↔Location → public projection**, then M3 Availability and
M4 protected Appointment commit. Traceability: Master Ledger sections
12.9–12.18 and 13.2–13.5; VR-080–099.
