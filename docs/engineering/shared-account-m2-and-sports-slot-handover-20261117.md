# Veni Reserve → Veni Account: M2 handover and Sports slot gate

**17 November 2026 (SAST) · Reserve draft only · no hosted changes authorized**

## The two percentages

Do not use the same number for code readiness and transferred data.

| Measure | Evidence-based status |
| --- | --- |
| Shared-account integration readiness (overall, indicative) | **~35%** per Veni Account → Reserve independent handover; more local work is under review but must not be counted as hosted acceptance |
| Real Reserve → Website hosted schema / Auth / tenant migration | **0% cut over**. The Website project has no deployed Reserve tables or Reserve account records |
| Reserve booking product completion | **A separate unfinished programme**; M2 Location, Service and Staff are reviewed local drafts, not hosted application features |
| Source retirement / free slot for Sports | **NOT done**; Reserve staging remains active and Sports paused |

Hosted project findings were read-only on 17 November 2026. The destination Website Supabase project `droslqfcazwkwvqlbtsq` is active and retains an original Website user, two products and six Arcana cards; it has **seven** public application tables and **no Reserve tables**. Reserve's `opjgaepryqwmsohtajja` hosted source is a **staging** instance with only the original M1 tenant/access/audit migrations, not later M2, booking or payment tables. It retains **five** Supabase Auth users, **two** Tenants, **four** Memberships and **ten** audit events. Those records are not disposable merely because this is staging.

The user account currently has two active Supabase Free projects: Website and Reserve. The Sports project remains paused. Supabase's [Free-project-pausing guide](https://supabase.com/docs/guides/platform/free-project-pausing) currently says a paused project can be restored for **up to one year** with its data and configuration; that is **time-limited**, not a permanent external backup. The [Free-plan backup guidance](https://supabase.com/docs/guides/platform/backups) recommends a regular off-site logical export and does not provide automatic daily Free backups.

## Current Reserve-owned M2 forward-compatibility preview

`scripts/preview-shared-account-m2.mjs` translates the *exact reviewed Git blobs* of three unhosted Reserve migrations, in dependency order. It checks exact blob digests before any translation and rejects drift. It does not connect to either Supabase project.

| Source migration | New isolated tables | Public RPCs, all renamed `public.reserve_*` | Dedicated role |
| --- | ---: | ---: | --- |
| M2.3 Location | 2 | 2 | `reserve_location_executor` |
| M2.4 Service | 2 | 2 | `reserve_service_executor` |
| M2.5 Staff/eligibility | 4 | 4 | `reserve_staff_executor` |
| **Total** | **8** | **8** | **3** |

Shared namespace mapping:

- `public.tenants`, `public.users`, `public.memberships` → `reserve.*`.
- All `private.*` relations, helpers, policies and internal RPCs → `reserve_internal.*`.
- Only these eight purpose-built public wrappers → `public.reserve_*`; the source must not introduce any other `public.*` reference.
- `veni_*_executor` role identities → `reserve_*_executor` to avoid cross-product role collision.
- All RLS, append-only events, `SECURITY DEFINER` ownership, limited role grants and compare-and-swap revision checks remain in the generated candidate SQL; they still **require genuine shared-stack execution tests** before integration.

To check the pinned source and invariants without generating files:

```bash
pnpm test:shared-preview
node scripts/preview-shared-account-m2.mjs --verify
```

To produce disposable SQL for the **Website account team to review**, outside the repository:

```bash
node scripts/preview-shared-account-m2.mjs --preview-dir /tmp/reserve-shared-m2-review-unique
```

The script refuses a repository output directory and refuses overwriting an existing artifact. Never copy generated SQL directly into hosted migrations without review and local genuine-Auth/PostgREST/RLS tests. Its three source migrations **are not deployed in Reserve staging**, so these conversions do not yet migrate hosted M2 data.

## Dependency and acceptance for Website integration

The Website team first needs its own local shared-backend M1 + M2.1 settings, transactional Setup Tenant bootstrap, and private Theme revision candidates (Website draft branches). This M2 preview then requires:

1. Transform the three files in order and compare each source blob to the pinned digest. Reject new source definitions, roles or public dependencies.
2. In a disposable genuine Website Auth + PostgreSQL/PostgREST stack, create an authenticated tenant owner with the **shared** Website user UUID, persist one Location, one Service, one Staff member and each eligibility combination, then update/disable and re-read them after a restart.
3. Prove unauthenticated, wrong-project, cross-Tenant, revoked Membership, missing capability, stale revision, and direct `reserve_internal` read/write attempts all fail closed.
4. Prove immutable actor-attributed audit/event rows, no public table exposure, no service-role browser credential, no extension of Arcana/Website permissions, and unchanged original Website/Arcana records.
5. Rehearse a safe independent restore, trace Auth password/UUID continuity, and exercise Reserve direct standalone login plus parent account navigation. Formal owner acceptance and real hosted backup/rollback remain later gates.

Until these pass, the percentage of **hosted migration remains zero**. A green local preview does not mean cutover is done.

## Two distinct ways to free the Sports Supabase slot

**A. Finish the actual Reserve hosted migration, then pause old Reserve staging.** This provides verified continuity but requires the Website team's account-deletion protection, real Auth/config compatibility, approved one-off hosted logical backup(s), an isolated restore, supervised tenant/identity import, booking/standalone browser acceptance, final delta reconciliation, source write freeze, and an explicit Ian sign-off. No automatic source deletion.

**B. Temporarily pause Reserve staging before migrating it.** If Ian confirms it is *only disposable/test staging* and no ongoing Reserve user or integration needs it, a reversible pause may free a slot while source data remains on Supabase's time-limited paused-project recovery path. This is **a slot swap, not migration**, and old Reserve staging cannot serve requests during Sports work. Obtain explicit owner authorization, document the existing users/tenant inventory and external dependencies, and agree on whether a single independently recoverable encrypted $0 backup is achievable or whether the one-year platform-only recovery risk is consciously accepted. Do not pause first and ask later. No deletion of a project or user is authorized by this document.

**Current owner decision:** unresolved. The project is still ACTIVE; no pause, import, Auth provisioning, DNS change, PR merge or paid resource was performed by this batch.
