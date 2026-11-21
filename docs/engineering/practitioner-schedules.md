# Recurring practitioner schedules (M3.2)

This slice is stacked on M3.1. It runs against a disposable copy of the Website Account foundation and the nine namespaced Reserve migrations. It requires the existing Staff catalogue, tenant settings, membership and capability functions. Onboarding, Account entitlements, appointments and Playground state are independent of the schedule contract.

## Persistence and operations

The private `reserve_internal.practitioner_schedule_revisions` table references the M2 composite staff key `(tenant_id, staff_id)`. Each successful save appends the complete week, revision, timezone, timestamp, user and membership. The highest revision is current. The primary key orders the history and arbitrates concurrent writers, including two first saves. The immutable-history trigger covers update, delete and truncate. Application roles have no direct table privileges.

| Authenticated RPC | Inputs | Result |
| --- | --- | --- |
| `reserve_save_practitioner_schedule` | Tenant UUID `target`, M2 Staff UUID `practitioner`, integer `expected`, JSON array `week` | Committed week and new revision. Use expected revision 0 to create. A stale/future revision returns HTTP 409. Reload before retrying. |
| `reserve_read_practitioner_schedule` | Same tenant and Staff keys | Week, tenant, staff, timezone and revision. A configured business with an active practitioner and no saved schedule returns revision 0 and seven closed days. |
| Same read with `on_date` | Add an ISO local calendar date | Same identity and revision metadata, local date and that weekday's `periods`. |

A week contains seven arrays starting with Sunday. An empty day is closed. Each period has integer local minutes `opens` and `closes`, with `0 <= opens < closes <= 1440`. For example, a split Monday can hold `[{"opens":540,"closes":720},{"opens":780,"closes":1020}]`. Submit periods in chronological order. Overlaps, touching periods, extra fields and overnight spans are rejected with HTTP 400. Combine touching periods explicitly to preserve a single slot-grid anchor. Divide overnight availability at local midnight.

On the first save, the database takes the authoritative timezone from M2 business settings. Further revisions retain it, including after a business timezone edit. A deliberate schedule timezone migration needs its own decision. Rules recur in local wall time. M3.1 resolves the date in that timezone and rejects ambiguous or missing starts and intervals crossing clock transitions.

The server helper `readPractitionerDay` accepts a user-token transport for the date-specific RPC, verifies the response tenant, staff and date, and passes the saved periods directly to `practitionerDay`. An unsuccessful read propagates an error. The caller supplies already-resolved eligibility, service rules, any location restrictions and occupied intervals. An empty staff schedule yields no starts. The Playground stays synthetic.

## Security and Website handoff

The candidate is `integration/veni-publishing/supabase/migrations/20261121093212_reserve_practitioner_schedules.sql`. Website owns reconciliation into one forward migration after M2 Staff and must check the exact migration order against its outstanding changes. The standalone Reserve ledger and PR #37 are separate.

The private client-approval function returns false in the candidate. Only the disposable fixture binds it to a synthetic confidential Reserve OAuth client. Before any staging rollout, Website must bind this predicate to its authoritative environment-specific Reserve client registration or adopt the common hardened Reserve verifier. Use a single source for client approval. An unbound predicate denies all schedule data. The database also verifies the user, matching live GoTrue session, client and current consent. Only the narrow verifier reads protected Auth records.

The restricted executor operates under RLS. Read requires an enabled tenant, active membership, an active tenant-owned practitioner, and `availability.read_all` or `availability.manage_all`. Save requires `availability.manage_all`. With the seeded roles Owner and Admin can write, Reception can read, and Staff's own-only permissions grant neither operation. Verified Staff-to-user links are a prerequisite for future own-schedule access. All write authorisation and actor attribution are database-derived. See [Supabase OAuth token security](https://supabase.com/docs/guides/auth/oauth-server/token-security) and [row-level security](https://supabase.com/docs/guides/database/postgres/row-level-security).

## Local verification

With Node 24, the pinned pnpm, Docker and a Website checkout containing commit `aac1382f41dfb1e7bb8bf11d5ee1f74a6700d274`, run the following from Reserve. Use a fresh stack directory whose parent already exists.

```sh
pnpm install --frozen-lockfile
node local/practitioner-schedules/prepare.mjs /path/to/website /path/to/fresh-stack
pnpm exec supabase start --workdir /path/to/fresh-stack -x realtime,storage-api,imgproxy,studio,postgres-meta,mailpit,edge-runtime,logflare,vector,supavisor
node local/practitioner-schedules/accept.mjs /path/to/fresh-stack
pnpm exec supabase db advisors --local --workdir /path/to/fresh-stack --type security --level warn --fail-on error
pnpm exec supabase stop --workdir /path/to/fresh-stack --no-backup
```

The fixture requires project `reserve_m32_local` on loopback port 59421. It creates synthetic identities, uses real OAuth and PostgREST, races independent saves and inspects the committed history. CI also runs the existing standalone database and security suites. This slice adds no schedule editor or public booking route.

## Next dependency

M3.3 should persist date-specific unavailable intervals for practitioner leave and location closures, then intersect those constraints with the recurring schedule on a single local date. Include cross-tenant, split-shift and DST fixtures. Positive extra-availability exceptions need an explicit conflict-precedence rule. Service/location/staff eligibility resolution, occupied appointments, external busy feeds, and transaction-time booking revalidation are subsequent dependencies.
