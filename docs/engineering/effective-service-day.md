# One practitioner's effective service day (M3.4)

Use `public.reserve_read_service_day(target uuid, service uuid, practitioner uuid, location uuid, on_date date, mode text)` with the caller's Reserve OAuth token. The date is a calendar date in the practitioner's schedule timezone. Modes are `NAMED` and `NO_PREFERENCE`. The RPC reads the existing M2 catalogue and the [M3.3 dated schedule](./dated-availability-exceptions.md) in one PostgreSQL statement snapshot. Each subsequent request sees newly committed configuration.

## Authority and outcomes

The M3.2 client, live-session, consent, enabled-tenant and membership checks apply. A reader needs `availability.read_all` or `availability.manage_all`. The non-login schedule executor uses column grants and RLS to read the existing catalogue. The authenticated RPC offers a read operation only. Reception can read. Own-only Staff permissions require future Staff/user linking.

| Outcome | RPC response |
| --- | --- |
| Unauthorised caller, unknown or foreign subject | HTTP 403 with the same unavailable response |
| Unsupported mode or invalid date | HTTP 400 |
| Known, tenant-owned combination fails a structural rule | HTTP 200 with the six requested identities (tenant, service, staff, location, date and mode), `eligible: false` and a reason |
| Eligible combination | HTTP 200 with identities, `eligible: true`, `online_bookable: true`, effective service fields and the M3.3 date projection (timezone, schedule revision, periods and active exclusions) |

All three subjects must be active. The Service and Staff must both allow online booking. Named selection requires `staff.public_visible`. No Preference requires `staff.no_preference_eligible` and may use a hidden practitioner. Service and Location public visibility describe publication separately.

All three M2 pairs must exist and be enabled for Staff–Service, Staff–Location and Service–Location. Only the Staff–Service pair supplies overrides. A disabled Service blocks both modes even if its Staff–Service override is true. This is a stricter rule than the earlier M2 structural preview. A false override also blocks an enabled Service. Null inherits the Service default. Duration and both buffers use the corresponding non-null override independently. A zero buffer is an explicit value.

Inactive subjects take precedence over offline subjects, followed by mode visibility or participation. Next come the Staff–Service, Staff–Location and Service–Location link checks in that order, followed by the Staff–Service online veto. The TypeScript reader exposes each reason in `check(minute)` and returns an empty `list()` for an ineligible combination. An eligible combination can still have zero starts or a time-specific M3.1/M3.3 rejection.

## Calling from the server

Pass a transport scoped to the user's token, the six request fields and the remaining server-side day context to `readServiceDay`. The reader verifies returned identities and mode, bounds-checks effective numeric fields and reuses the M3.3 projection validation. For eligible days, `serviceRules` carries the duration, before/after buffers, online flag, and nullable Service notice/horizon. `check(minute)` and `list()` call the shared evaluator with the resolved rules.

The RPC accepts no timing overrides. The local evaluation context still supplies the start interval, absolute earliest/latest bounds, any ordinary location periods and occupied intervals. The Service’s `min_notice_minutes` and `max_advance_days` are preserved for a later scheduling-policy calculation. This operational projection grants neither publication nor appointment-commit authority.

## Website migration and verification

Website owns reconciliation of `20261121110943_reserve_effective_service_day.sql` after the Account foundation, nine M2 Reserve migrations and the M3.2/M3.3 candidates. It adds a public invoker RPC, a private implementation, read grants and two RLS policies. It creates no tables or writes. Existing M3.2 and M3.3 policies protect Staff and Location. The existing client approval predicate must be bound to the Website-approved environment-specific Reserve client before staging. PR #37 and Account entitlements are independent.

Prepare the [disposable M3 stack](./practitioner-schedules.md) and run the following before stopping it. The three suites provision separate synthetic clients and run sequentially.

```sh
node local/practitioner-schedules/accept.mjs /path/to/fresh-stack
node local/practitioner-schedules/exceptions.mjs /path/to/fresh-stack
node local/practitioner-schedules/service-day.mjs /path/to/fresh-stack
```

For M3.5, combine eligible No Preference candidates for one service, location and day, deduplicate equal starts and specify deterministic practitioner selection. Full booking policy, authoritative occupied appointments and atomic commit-time revalidation remain later M3 dependencies.
