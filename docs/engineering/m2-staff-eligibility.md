# M2 Staff and scheduling eligibility — disposable local implementation candidate

**Status:** Draft, unmerged, $0-first and local-only. Stacked upon the M2
Service candidate (Reserve PR #29), which in turn depends upon Locations and
the earlier local Tenant/Theme/account foundation. **No hosted migration or
production activation is authorised.**

## Identity and Staff configuration

`Staff Member` is a Tenant-owned, persistent operational person, **not** an
`Auth User`, `Membership`, `Customer`, resource, or appointment. Creating a
Staff record never creates credentials, connects an email address, or conveys
application permissions. A future account-to-Staff association must be made
through a separate, explicitly authorised process.

Each record stores an internal name, optional public name and biography,
sort order, immutable UUID, and independent state:

- `ACTIVE`, `INACTIVE`, `ARCHIVED` are operational lifecycle states. Archived
  records retain their identity/history and cannot be silently reactivated.
- `public_visible`, `online_bookable`, and `no_preference_eligible` are **three
  separate flags**. No Preference can include a hidden practitioner only when
  explicitly opted in; visibility alone never grants No Preference.
- These are private configuration intentions, not a published Staff profile
  or an invitation to book someone online.

## Three explicit relationship types

All are durable, Tenant-scoped many-to-many relationships with immutable
endpoints, `enabled` state, revision-based edits and a separate append-only
actor-attributed journal:

1. `STAFF_SERVICE`: Staff Member can deliver Service; nullable overrides for
   duration, price (integer minor units), before/after buffers, and online
   eligibility. Each override inherits the Service default when null.
2. `STAFF_LOCATION`: Staff Member may work at Location.
3. `SERVICE_LOCATION`: Service may be offered at Location.

The stored implementation is one private, kind-constrained relation table,
with real composite `(tenant_id,endpoint_id)` foreign keys for every endpoint,
a unique relation per pair, and enforced prohibition on Service/Location or
Staff/Location overrides. A disabled relationship remains in the database
with its ID and history. There is **no automatic cross-product** when a new
Staff Member, Service, or Location is created.

A *structural* preview considers a combination only if every one of the
three relationships is explicitly enabled and Staff, Service, Location and
online flags permit it. Named choice also requires the Staff public flag;
No Preference requires the independent Staff opt-in. This is not real-time
availability, resource capacity, public booking or appointment allocation.

## Permissions and isolation

- Owner/Admin: `staff.read`, `staff.manage`, `services.read`, and
  `services.manage`; may edit Staff and relationship configuration.
- Reception: `staff.read` and `services.read`; may inspect Staff and
  eligibility but cannot change them.
- Staff role: does not get Staff roster access or implied own-Staff linkage.
  No self-service management is added here.
- Every eligibility read requires both read capabilities, and every write
  both management capabilities, in addition to live Tenant membership and
  PostgreSQL RLS. No guessed ID can cross Tenant boundaries.

`private.staff_members`, `private.staff_events`, `private.eligibility_links`,
and `private.eligibility_events` have RLS, grant-restricted operations and
no exposed Data API table path. Guarded private routines run under a dedicated
non-login, non-BYPASSRLS executor, with narrowly exposed authenticated invoker
RPC wrappers. Writes validate the complete JSON document, use optimistic
revisions and atomically append journal events; audit insert failure rolls
back the change.

## Local verification and operational handover

1. Typecheck, lint, unit tests and both application builds.
2. Clean disposable local Supabase reconstruction and pgTAP policy/schema
   audits, followed by genuine synthetic Auth/PostgREST two-Tenant proof:
   capability denial, relationship FK isolation, overridden defaults,
   concurrent edits, archive, failed-event rollback, private REST exclusion,
   same-token revocation and logout.
3. Browser-style local HTTP smoke for create/edit, invalid input, stale
   revisions, tenant isolation, CSRF, logout and **actual local restart**
   persistence of Staff and all three relationship types.
4. Manual fictional Owner walkthrough in `/development/business`, with
   Reception read-only check before considering a later release gate.

The next planned work is an independently reviewed **private-to-public
booking projection**, then M3 Availability and M4 guarded Appointment
commit. Do not enable customer-facing scheduling until the three-way
eligibility and availability rules are proved together.
