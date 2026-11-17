# Veni Reserve — independent Veni Account integration audit

**17 November 2026 · Reserve technical review · DRAFT / no hosted or release authority**

The Master Product Ledger (VR-1486–1490) and Reserve's M0–M14 dependencies remain authoritative. This report independently reviewed the Website and Reserve draft branches and their specific CI evidence. It does not mean that Reserve data has moved to Website Supabase, that live Veni Account login works inside Reserve, or that any draft is approved for deployment.

## Executive determination

**Conditional preference: Option A, shared Website-owned Supabase Auth with Reserve-owned namespaced data and a transport-neutral actor interface.** It is the shorter $0 proof-of-concept path for one canonical user ID, Reserve/Arcana coexistence, and later Performance onboarding. It has stronger *current* synthetic migration and recovery evidence than Option B's actual **cross-project** identity mapping. This is a recommendation for design review, **not a selected/approved architecture**.

Critical requirements before A is ratified or implemented on hosted services:

1. Reconcile the **actual** Reserve draft #20 tenant-bootstrap/session RPCs and #22 private Theme M7 into Website's currently M1/M2.1-only import and privilege/role/RLS harness. A migrated M1 graph alone cannot run Reserve onboarding.
2. Build a properly reviewed SSR/browser session handoff into Reserve and prove *live* session checks for Website, Arcana, and Reserve. In the existing prototype a revoked but unexpired access JWT initially retained access across all three products; experimental local guards fixed this, but have **not** become a reviewed deployed contract.
3. Make the currently deployed Website `delete-account` Edge Function **fail closed for linked Reserve users**. The existing handler calls `admin.auth.admin.deleteUser(user.id, false)` without tenant/history preflight. The Reserve FK's `ON DELETE RESTRICT` is no substitute for an approved user closure process.
4. Reconcile the hosted Free-project Auth, schema, regions/versions, provider settings, audit/FK dependencies, and secure backup/restore/rollback before any live import. Reserve staging currently contains only M1 (10 application tables, **no booking tables**); Website contains seven application tables. Existing data cannot be treated as disposable.
5. Obtain Ian's **separate architecture and hosted-cutover decisions**. Preserve Reserve staging and do not perform a blind rollback once Website accepts new writes.

Option B (Website OAuth 2.1 issuer, independent Reserve SSR/database) remains a valid alternative if isolation and future extraction outweigh extra sessions, identity-linking and infrastructure cost. Reserve PRs #23/#24 prove a **real disposable local** GoTrue authorization-code/S256-PKCE + consent API + Reserve SSR round-trip, but use **the same local Supabase origin for both Website-like Auth and the Reserve `current_reserve_user` PostgREST RPC**. That proves the protocol, **not** that a Website-issued JWT can authorize a different Reserve Supabase project's RLS, nor a durable provider-subject-to-Reserve-user mapping. It is OAuth `email` scope, not a completed OIDC/JWKS login, and the actual human Website consent UI has not been exercised.

## Evidence independently verified

| Evidence | Exact reference | Reserve assessment |
| --- | --- | --- |
| Reserve OAuth local mock/contract | Reserve draft #24 `33709007e19aa2359bb04720d11eac083737597f`; `node --experimental-strip-types --test tests/veni-oauth-client.test.mjs` | 9/9 baseline tests passed locally; this review adds 3 adversarial cases, **12/12** locally. All mocked, not cross-project |
| Reserve true local Supabase OAuth, SSR and RLS | [Reserve CI #43723722853](https://github.com/venipublishing-main/veni-reserve/actions/runs/43723722853), `database-security` job | **PASS**, real GoTrue/PKCE/consent API SSR 79 assertions, tenant bootstrap 37, Auth/PostgREST security 345, M2.1 214, local restart. Hostless, synthetic, no parent browser JavaScript |
| Website shared-schema and deletion/lifecycle unit contracts | Website draft #12 `d4f4f839`; `node --test tests/merge-reserve-m1.test.mjs tests/merge-reserve-m2.test.mjs tests/integration/reserve-account-deletion-policy.test.mjs tests/integration/account-deletion-guard.test.mjs tests/integration/reserve-test-account-operator.test.mjs tests/integration/reserve-history-retention-gate.test.mjs` | **42/42** locally; mock and static transformation limits apply |
| Website OAuth consent UI model | Website draft #3 `bb41ba2`; `node --test tests/veni-oauth-consent.test.mjs` | **11/11** locally; not a human browser flow |
| Website separate-project Auth+Reserve M1 merge | [Website CI #44029583194](https://github.com/venipublishing-main/venipublishing-website/actions/runs/44029583194) and preceding #4–#6 | **PASS**, two disposable Auth servers, source UUID/password-preserving import, tenant RLS, atomic negative tests, baseline Website/Arcana data retained |
| Independent third-server database/GoTrue recovery | [Website CI #44007658384](https://github.com/venipublishing-main/venipublishing-website/actions/runs/44007658384), draft #7 `349e5c44` | **PASS**, 47 table fingerprints, app RLS/grants/audit, 82 recorded Auth migrations, direct full-clone GoTrue restart, six original synthetic UUID/password logins, fresh JWT signing authority and old-token rejection |
| Hosted metadata | Website draft #8, `docs/architecture/reserve-website-hosted-readonly-preflight-20261117.md` | **Read-only**: Website 1 Auth user; Reserve staging 5; zero point-in-time UUID/normalised-email/provider-key collisions; Free plans, two regions, different PostgreSQL patch versions. No hosted restore, writes or real-user migration |
| Owner local walkthrough | Ian reported completing every step in the earlier Reserve walkthrough | **Owner-reported PASS for the existing Reserve local flow**, not evidence of Website→Reserve account integration, Theme #22 acceptance, or cross-product browser SSO |

**Verification limit:** this workspace lacks Docker/Supabase CLI. The independent commands above ran locally for the pure Node suites (**65 tests total after the new additions**); genuine Auth/Postgres/SSR executions were verified from the named green GitHub Actions jobs and selected log lines, not re-run against a new local database here. CI jobs use disposable, purpose-labelled localhost resources; no hosted action was taken.

### A–F acceptance matrix

Results apply to the **narrow scenario described**, not to a complete released product. `NOT RUN` means integration-specific proof remains absent; `BLOCKED` means a known design/release prerequisite prevents it. No scenario is granted a `PASS` just from an adjacent generic unit test.

| ID | Scenario | Result | Exact evidence and remaining gap |
| --- | --- | --- | --- |
| A01 | New Website identity registers **and enters Reserve** | **NOT RUN** | Local GoTrue registration works on two projects; no true parent-browser-to-product session handoff |
| A02 | Valid subject completes local OAuth and reaches identity-only Reserve screen | **PASS** | Reserve #24 CI #43723722853, real Auth+SSR; protected `/app` deliberately stays denied |
| A03 | Correct Website principal maps to established Reserve user across two actual projects | **BLOCKED** | No issuer/subject mapping design or cross-project membership RPC transport |
| A04 | Imported synthetic Reserve account signs into Website with original password/UUID | **PASS** | Website #7 direct GoTrue restore and integrated import; new JWT required, no Reserve browser session |
| A05 | Direct Reserve landing and bounded Reserve-only return path | **PASS** | Reserve #24 CI route smoke; `tests/veni-oauth-client.test.mjs` redirect bounds; no third-product redirect |
| A06 | New Reserve registration without Playground, no automatic demo import | **NOT RUN** | Ledger VR-1486, Reserve design/UI tests and owner walkthrough; no shared-identity end-to-end registration/data boundary |
| B01 | Real local signup creates SETUP Tenant and active Owner Membership atomically | **PASS** | Reserve #24 CI tenant bootstrap 37 assertions and local SSR smoke |
| B02 | Retry/idempotency and transaction rollback avoid duplicate/ownerless Tenant | **PASS** | Reserve #20/#24 genuine local bootstrap and DB concurrency jobs |
| B03 | Genuine active Owner accesses only authorised local business | **PASS** | Reserve #24 Auth/PostgREST security 345 assertions |
| B04 | Unassigned foreign user and forged Tenant ID denied by RLS | **PASS** | Same CI: A/B isolation, guessed IDs and denied writes |
| B05 | Multiple memberships select correct Tenant and do not inherit permissions | **PASS** | Same CI: independent multitenant authority |
| B06 | Suspended/revoked membership loses permissions with unchanged token | **PASS** | Same CI: session-aware suspension/revocation |
| B07 | Parent Website login creates or manages Reserve Tenant with real actor mapping | **NOT RUN** | A01/A03 and newer #20 schema transform still open |
| C01 | Same email, different UUID in two Auth projects never auto-links | **PASS** | Website dual-Auth CI; added Reserve mock subject-mismatch assertion |
| C02 | Wrong Supabase project token cannot impersonate Website subject | **PASS** | Website dual-Auth CI; independent keys/source token rejected |
| C03 | Invalid state/issuer, cross-tab transaction, bad PKCE | **PASS** | Reserve #24 real PKCE and added mock wrong-issuer/mixed-tab tests |
| C04 | Expired/tampered local cookie and expired JWT rejected | **PASS** | Reserve 12-test suite; timeout behavior remains localhost-only |
| C05 | Revoked real Auth session cannot reuse local Reserve session | **PASS** | Reserve #24 CI deletes disposable identity, live RPC denies; Website cross-sphere *production* guard still open |
| C06 | Provider enforces one-use authorization code against replay | **NOT RUN** | New test simulates server rejection and verifies client fails closed; real GoTrue replay not specifically exercised |
| C07 | Forged Owner/tenant metadata grants no local OAuth product permission | **PASS** | New mock test; Website #2 real-Auth smoke; product gate still separate |
| C08 | Shared login cannot transfer Owner authority between tenants | **NOT RUN** | Owner invariants local; global-to-Reserve actor/linking behavior not implemented |
| D01 | Delete fresh unrelated **disposable synthetic** account through guarded operator | **PASS** | Website #10/#11 local CI only; no hosted deletion |
| D02 | Historically linked, active Owner, invitation/hold accounts blocked | **PASS** | Website #9–#11 read-only preflight/planner tests; no real privacy workflow |
| D03 | Live Owner reassignment before account closure | **NOT RUN** | DB Owner constraint proven; complete secure reassignment UX/workflow not implemented |
| D04 | Deactivate vs erase; per-category POPIA retention and real cross-sphere closure | **BLOCKED** | Joint information-officer/legal and linked-product review; hosted Website delete endpoint unsafe unchanged |
| E01 | Standalone direct Reserve landing, local SSR navigation and gate | **PASS** | Reserve #16/#24 preview CI and user-reported local walkthrough |
| E02 | Real standalone public signup, business operations and branding on all devices | **NOT RUN** | Local preview only; no published booking/production account |
| E03 | Human Website consent screen → Reserve SSR, mobile, cancel and logout | **NOT RUN** | Programmatic consent API passes; actual Website UI/browser flow open |
| F01 | Forced partial Auth/domain import rolls back without Website/Arcana loss | **PASS** | Website integrated two-project synthetic CI |
| F02 | New independent Postgres server restores app/Auth table rows, ACL/RLS/audit | **PASS** | Website #7 CI, 47 dataset parity and security invariants, exceptions explicitly documented |
| F03 | Direct GoTrue restart on **full restored clone** authenticates original six users | **PASS** | Website #7 CI #44007658384; fresh signing keys, old JWT rejected |
| F04 | Extract only Reserve domain, leave Website/Arcana intact | **PASS** | Website #2 `reserve-shared-supabase-prototype.yml` PostgreSQL-only drill; no full standalone Auth/Storage transport |
| F05 | Duplicate identity collision and forced failure are atomic | **PASS** | Website #4–#7 local import/recovery |
| F06 | Encrypted independently restored **hosted** Free-plan source+destination backups | **NOT RUN** | Requires separate approval for real personal data handling; no funded managed backup assumed |
| F07 | Full Auth provider/keys, external Storage bytes, live booking history and production rollback | **BLOCKED** | Missing configuration inventory, actual booking schema, permitted isolated restore, coordinated cutover plan |

## Readiness estimate (independent judgment, not automated scoring)

| Dimension | Estimate | Interpretation |
| --- | ---: | --- |
| Architecture/design | **70%** | Strong candidate designs; no signed choice, account-link/logout or privacy contract |
| Local implementation | **55%** | Reserve M1/M2.1, independent SSR and OAuth prototype; Website schema preview incomplete for #20/#22 |
| Independently verified scenario coverage | **55%** | 65 Node tests and CI verified; A–F gaps remain, especially real cross-product entry and lifecycle |
| Browser acceptance | **20%** | Existing Reserve owner flow reported good; no parent→Reserve consent/SSO or full manual negatives |
| Hosted staging | **10%** | Read-only catalogue assessed; backups, data migration and tested hosted rollback absent |
| Production release | **0%** | No authorization, migration, payment or real booking production deployment |

Overall integration readiness is roughly **35%** if these six dimensions are equally weighted; it is emphatically **0% ready to cut over**. These are planning estimates, not measurements or completion claims.

## A vs B and ownership of blockers

| Dimension | A — shared Supabase Auth + `reserve.*` | B — Website OAuth + standalone Reserve |
| --- | --- | --- |
| Security | Single verified UUID, genuine RLS proven locally; central blast radius, strict session and deletion guards required | Independent databases and blast radius; must solve trusted subject→Reserve user mapping and not forward Website JWT directly to Reserve RLS |
| Complexity and pace | Proven synthetic import; must reconcile #20/#22, backups, migrations and browser SSO | PKCE/consent proof exists, but separate-project identity, server sessions, revocation, unlinking and actual consent UI unfinished |
| $0 operation | Most economical single active backend for several spheres, subject to Free recovery constraints | Separate project/session operations may be manageable at $0 now, but multiply infrastructure and may constrain Performance |
| Portability | Reserve data-schema extraction proven; full Auth/data split after launch needs a future plan | Better domain/infra separation from day one, though central identity availability remains a dependency |
| UX | One user/password, direct Reserve routes; cross-origin SSO still needs explicit design | Smooth SSO possible with browser consent/session, but extra redirects/logout rules to explain |
| Maintenance / Performance | Shared upgrades, coordinated RLS and account lifecycle; Performance gets its own independently scoped org permissions | Independent deployments fit Performance, but each product repeats federation client and product-session security |

**Reserve can act independently:** expand M2/M4/M5 with synthetic users, complete private M7 Theme walkthrough, strengthen hostile identity tests, create a portable tenant manifest and write a transport-neutral `IdentityPrincipal → ReserveActorContext` contract without activating it.

**Website must act:** update stale handover claims that full GoTrue restart failed (**it passed on 17 November**); address hard-delete Edge Function, website/Arcana stale-session guards, actual browser consent/SSR integration, source-of-truth identity linking and key/redirect settings.

**Joint architecture decision:** select A or B; decide browser SSO, parent vs Reserve logout, stable principal mapping, M2/M7 migration compatibility, account closure/Owner transfers, isolation and eventual extraction, and future Performance contract.

**Requires Ian or authorised specialist:** manual cross-product browser/security walkthrough; explicit approach selection; privacy/POPIA retention review; any real-data access/backup/restore; eventual hosted staging changes, downtime/rollback thresholds and production release. None authorised here.

## Next safe Reserve batch (proposal)

1. **Audit/guardrails now:** merge no existing drafts; retain these three additional OAuth adversarial unit tests and this review in a separately stacked draft. Use CI to ensure no drift. Correct older docs to reflect #7's actual synthetic recovery outcome.
2. **Neutral actor design:** define exactly which *server-owned* fields a verified Website principal supplies, how a local Reserve user is mapped under each option, and which live membership/Owner/RLS queries are mandatory; test same-email, cross-project and revoked-session failures without enabling real `/app` access.
3. **M2/M7 compatibility:** extend local Website SQL conversion and genuine Auth/PostgREST integration to the specific #20 and #22 migrations only after reviewing migrations, role/ownership implications and untouched Website/Arcana grants.
4. **User acceptance:** scripted manual parent consent/direct Reserve/signup/login/logout, independent navigation, cross-tenant denial and account deletion hold; save outcomes separately from CI.

**Hard boundary:** No PR merge, hosted Supabase Auth/schema write, actual data transfer/delete, OAuth activation, DNS/`/kids/` change, paid resources, public booking or payment action. Draft/test work cannot be interpreted as a migration approval.
