# Dated practitioner absences and location closures (M3.3)

For one tenant, practitioner, location and practitioner-local date, `reserve_read_availability_day` returns the recurring working periods and the active exclusions in one database snapshot. The server helper `readAvailabilityDay` verifies the response identities and passes those periods and exclusions to `practitionerDay`. Use the caller’s Reserve OAuth access token. A failed read or invalid response stops the calculation. The M3.2 recurring-only reader remains available for inspecting schedules.

## Write contract

Call `reserve_save_dated_exception` with the following named arguments.

| Argument | Meaning |
| --- | --- |
| `target`, `entry` | Tenant UUID and caller-generated exception UUID. Keep the same UUID when retrying. |
| `practitioner`, `location` | Supply exactly one active, tenant-owned M2 Staff or Location UUID. Pass null for the other. |
| `on_date` | ISO calendar date in the subject’s timezone. The subject and date stay fixed for the lifetime of this entry. |
| `opens`, `closes` | Two nulls mean all day. Otherwise use integer wall-clock minutes with `0 <= opens < closes <= 1440`. Split overnight exceptions at local midnight. |
| `expected`, `cancel` | Create with revision 0 and `false`. Edit against the last committed revision. To cancel, submit that revision, the original scope and date, two null endpoints and `true`. Cancellation is terminal. |

A successful write returns the exception ID, committed revision and cancellation state. Competing writers using the same expected revision yield one commit and HTTP 409 for the loser. A stale write also returns HTTP 409. Read the current day before deciding whether to retry. Its exclusions list contains active entries intersecting that day. Distinct IDs are independent, including entries with identical intervals. To move an exception to another subject or date, create the replacement before cancelling the original.

The private `reserve_internal.availability_exception_revisions` table stores each revision’s civil interval, IANA zone, resolved half-open instant range, actor user, tenant membership and timestamp. Composite foreign keys reference the existing tenant Staff and Location catalogues. Cancellation appends a revision and preserves the affected interval. The highest revision determines whether an entry applies.

## Time and precedence

- A practitioner absence uses the M3.2 schedule timezone. A location closure uses its M2 timezone override, falling back to the business timezone. The initial save captures the zone. Edits retain it and existing revisions keep their resolved instants.
- A full-day closure runs between successive local midnights. New York spring-forward and fall-back dates span 23 and 25 elapsed hours respectively. A repeated boundary uses the earliest possible start or latest possible end. A missing partial boundary widens the exclusion to the full local date. If a midnight itself is missing, the unresolved edge uses a conservative bound 24 hours outside its UTC date boundary.
- The reader selects by overlap in absolute time. A New York closure on November 24 from 20:00 to 22:00 covers November 25 from 03:00 to 05:00 in Johannesburg. The response retains the source local date and zone alongside UTC epoch milliseconds.
- Dated exceptions filter proposed starts on the recurring grid. For a 09:00–12:00 shift on a 20-minute grid, an absence ending at 10:50 leaves 11:00 as the next grid start. The service and both buffers must fit. Touching an exception endpoint is permitted.
- Existing schedule, grid, local-time, notice and horizon checks run first. If an otherwise eligible occupied interval intersects multiple restrictions, the reason order is `practitioner_absent`, `location_closed`, then `busy`. Removing one exclusion restores a start only if all remaining rules permit it. An empty recurring schedule stays closed.

## Read contract and permissions

`reserve_read_availability_day(target, practitioner, location, on_date)` requires the active tenant-owned subjects and an M3.2-authorised reader. `on_date` always uses the practitioner's timezone. The result includes `tenant_id`, `staff_id`, `location_id`, `date`, schedule `timezone`, `revision`, `periods`, and an `exclusions` array. Each exclusion identifies its exception, revision, scoped Staff or Location, local date, zone, and numeric `start` and `end`. The server checks the requested identities and each exclusion's scope and bounds. An empty array means no intersecting dated exclusions. The caller still supplies resolved service rules, any ordinary location hours and any occupied intervals.

The candidate reuses the M3.2 approved-client, live-session, current-consent, membership and capability checks. The seeded Owner and Admin roles can save. Reception can read. Own-only Staff needs a future verified Staff/user link. Application roles have no direct table grants. The restricted executor is subject to RLS and the table rejects update, delete and truncate.

## Website integration and verification

Website owns the canonical forward migration. Reconcile `20261121100232_reserve_dated_exceptions.sql` **after** the Website Account foundation, nine M2 Reserve migrations and the M3.2 practitioner-schedules candidate. The M3.2 executor, approval predicate, schedule reader, tenant settings, Staff, Location and immutable-history trigger are prerequisites. Coordinate the final ledger version with Website. PR #37 can share Website’s environment-specific approved Reserve client verifier. The onboarding entitlement and publication decision remain independent of operational schedule permissions. The default M3.2 approval predicate denies access until Website provisions it.

Follow the [M3.2 disposable-stack instructions](./practitioner-schedules.md). After the schedule acceptance suite and before stopping the stack, run `node local/practitioner-schedules/exceptions.mjs /path/to/fresh-stack`. It exercises genuine Auth and PostgREST with synthetic tenants. Application tests also exercise the evaluator and reader validation.

For M3.4, resolve the existing M2 service–practitioner, practitioner–location and service–location relationships and applicable duration/buffer overrides for one tenant-authorised day read. Appointment occupancy and transaction-time booking revalidation require subsequent slices.
