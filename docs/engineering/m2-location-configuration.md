# M2 Location configuration — disposable local candidate

**Status:** Draft / unmerged / local-only; stacked on Reserve PR #22, itself
stacked on PR #20 and earlier SSR groundwork. **Not** a hosted migration.

This implements the first missing M2 dependency after canonical Tenant settings:
**Location**. A single-site business still has one Location row. Terminology
such as branch, practice, clinic or venue is presentation-only.

## Included

- Tenant-scoped private locations, with operational lifecycle (ACTIVE,
  INACTIVE, ARCHIVED), public-visibility flag (not publication), delivery
  kind, optional timezone override, ordering and description.
- Explicit immutable location_id and unique (tenant_id,id) future
  foreign-key target for Staff↔Location and Service↔Location eligibility.
- An append-only attributed location_events journal; no routine hard delete,
  no archived-row editing, and no cross-tenant event references.
- Genuine Auth live-session checks, membership/capability checks, a restricted
  non-login/NOBYPASSRLS executor, private tables and narrow public RPCs.
  Owner/Admin write through existing tenant.settings_manage; others can read
  only with tenant.read; no new implicit roles or rights.
- Optimistic revisions for edits, same-transaction journal, case-insensitive
  live-name uniqueness and explicit error codes; no second configuration store.
- **Local-only** editor in /development/business with save/reload/archive.
  Local URL requires loopback plus a running disposable Supabase stack.

## Not included

Services, Staff, eligibility links, recurring availability, capacity,
appointment persistence or public booking. A public_visible flag is **not**
public exposure or publication; all Location data remains private.
No VVB real patients, hosted Supabase project, shared Veni Account migration,
DNS, payment or deployment is touched.

## Validation

1. Run pnpm install --frozen-lockfile in the Reserve branch on an approved
   Node 24 / pnpm 12.11.2 local developer machine.
2. Run pnpm typecheck, pnpm lint, pnpm test and pnpm build.
3. Run the existing **disposable local** database-security GitHub Actions job:
   it reconstructs the additional migration, runs pgTAP structural checks,
   real GoTrue/PostgREST two-tenant and revocation/concurrency tests, and
   validates no synthetic rows remain.
4. With disposable local Supabase running on 127.0.0.1:54321, run
   pnpm dev:local-tenant and open
   http://127.0.0.1:5192/development/business. Complete the Owner
   flow, create/rename/reload/inactivate/archive a fictional Location,
   sign out, and sign in as User B to confirm isolation.
5. **Do not apply to hosted** until the Website account-layer dependency and
   separately authorised hosted release gate are resolved.

## Next ordered work

M2 Service → Staff → Staff↔Location → Staff↔Service → Service↔Location,
then safe private/public projections. Only afterwards M3 deterministic
availability, M4 protected appointment commit, and M5 public booking.

Traceability: Master Product Ledger VR-080–087, VR-090–098; M2 gate and
dependency order; M1 capability grants. Local-only candidate does not modify
or supersede canonical design authority.
