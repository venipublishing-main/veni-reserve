# Veni Reserve — Website Account handover & implementation checklists v0.1

**Date:** 17 November 2026 | **Status:** DRAFT CHECKLIST; no hosted rollout, no PR merges, no production schema/Auth change.
**Product authority:** Veni Reserve Master Product Ledger, especially VR-1486–1490, Issue #13 addendum 6844684823 and the Architecture Reconciliation & Implementation Decision Register. This file is execution guidance and does not amend them.
**Scope:** Enable Reserve to continue its own M0–M14 development while the shared Veni Account identity choice is reviewed. Veni Performance/Sports gets a later, separate onboarding contract.

## Operating rules

- Reserve remains its own standalone website and SaaS with direct landing, business registration, workspace and tenant booking flows under Veni Publishing → Veni Flow. Its logo returns to Reserve, not a portfolio catalogue. Preserve independent links and product context (VR-1488).
- Two equal public actions: **Try Playground** (anonymous synthetic session) and **Sign up/Create my business**. Playground never creates a live user/Tenant, never automatically imports demo information and is never required first (VR-1486).
- Actual onboarding: authenticated User → server-trusted active Owner Membership + SETUP Tenant → persisted domain data. Theme stable identity, immutable revisions, private draft/preview; publication and real booking need later readiness gates (VR-1487).
- Retain parent GitHub Pages and `/kids/`; do not change parent DNS/xneelo/Cloudflare targets or mistake a static folder for a working SSR host (VR-1489).
- Existing Veni Account Auth and Reserve staging Auth are distinct. No trust from same email or cookie, no hidden duplicate account, wrong-project JWT, credential copy or bypassed membership/RLS (VR-1490).

## Checklist G — independent work Reserve can continue now

Mark an item `done` only when the stated evidence exists **on the exact tested draft commit**; CI and owner browser review are different evidentiary steps.

| ID | Reserve work package | Acceptance/evidence | State |
| --- | --- | --- | --- |
| G01 | Standalone IA and navigation | Direct `/` landing, two equal actions, purpose-specific `/account` or registration, gated `/app` and public booking route; no mandatory Playground or sibling promotions; keyboard/mobile/manual review | **PROCEED LOCAL**; no production signup |
| G02 | Authenticated M1 tenant bootstrap | Real disposable Auth → one atomic, idempotent SETUP Tenant, active Owner, receipt and immutable audit; repeated request converges, cross-user key denied | **LOCAL PROOF PR #20**; owner walkthrough still needed |
| G03 | M2.1 persistent business settings | Owner saved/read/edited/restarted settings, optimistic revision checks, separate foreign tenant denied; no fake Save | **LOCAL PROOF PR #20**; manual review still needed |
| G04 | Canonical M2 domain/scheduling | Generic service/staff/resource/availability/capacity/timezone logic; valid edge cases, availability and cross-tenant RLS; respect M0–M14 ordering | **PROCEED** behind local/dev gates |
| G05 | M4/M5 booking model | Hold/confirm/cancel policy, concurrency/capacity, validation, audit; use synthetic tenants/bookers and no external payment action | **PROCEED LOCAL** per milestone gates |
| G06 | M7 private Theme Studio | Stable Theme, immutable revision history, draft pointer, private preview, RBAC and stale-write denial; no public publish | **LOCAL PROOF PR #22**; owner review open |
| G07 | User-facing usability | Owner walkthrough A create/retry/save/reload/edit, B denied, A return/logout; booking/UI mobile, error and accessibility review | **MANUAL CHECKS OPEN** |
| G08 | Tenant export and portability | Document CSV/JSON+media+config+audit-safe export, tenant-level isolation, extraction/restore/rollback plan (no actual hosted copy) | **PROCEED DESIGN** |

## Checklist A — joint identity/account integration work; choose transport first

| ID | Required work | Pass condition | State |
| --- | --- | --- | --- |
| A01 | Architecture decision record | Owner explicitly selects A **shared Auth/namespaced backend** or B **OAuth 2.1 federation/SSR**, with reversibility, cost, operations and rollout rationale | **BLOCKING DECISION** |
| A02 | Identity and account mapping | Exact verified principal; stable provider subject; collision/linking/unlinking, confirmed identity, existing Reserve identities, same-email adversarial case and Owner history | **OPEN** |
| A03 | Auth protocol validation | A: single Auth UUID/RLS/current session and migration compatibility; B: code+S256 PKCE/state, verified issuer/client/subject, approved callbacks, one-use grant and server-only exchange | **PARTIAL LOCAL EVIDENCE** Website #2/#3; Reserve #23/#24 |
| A04 | Real permission boundary | Every business mutation rechecks active membership/capability/tenant state in database; RLS denies cross-Tenant, revoked and forged context; global `email` or OAuth scope grants no role | **REQUIRE END-TO-END PROOF** |
| A05 | Session/logout and recovery | Stale signed JWT denied after revocation, cross-tab/logout/expiry, MFA/assurance policy, returning account, key rotation, failure and recovery | **PARTIAL LOCAL EVIDENCE**; hosted/browser open |
| A06 | Account creation/closure | User-intent linking, consent, Owner transfer, existing invitations and audits, data retention and POPIA holds; fresh CI test users distinct from historically linked users | **DESIGN/LEGAL GATE** Website #9–#11 |
| A07 | Hosted infrastructure compatibility | Real hosted Auth/GoTrue/config and backups/rollback if shared; all Storage bytes, secrets/config and tenant extraction; OR production-grade SSR OAuth provider/cookie/redirect config | **Synthetic full-clone GoTrue restart PASS (#7); hosted compatibility OPEN** |
| A08 | Human security and UX validation | Actual Website consent UI → Reserve callback in browser; decline/cancel/login, wrong tenant, malformed redirect, mobile, reauth, logout, manual owners | **OPEN** |
| A09 | Hosted staging release proposal | Full rollback, scoped environment inventory, source/target hashes, observability, backup, test users, explicit deployment authorization | **BLOCKED UNTIL OWNER APPROVAL** |

### Choose only one primary trust transport in the signed architecture decision

**A: Website-owned single Supabase Auth.** Namespaced `reserve.*`/`reserve_internal.*`, mapped profiles/owners, bounded adapters and tenant-specific RLS; migrate from Reserve staging through independently verified Auth/Storage/DB backups, collision handling and full recovery. Existing Website draft PR #2 and stacked #4–#11 are strictly disposable local rehearsals. **17 Nov correction:** [Website draft PR #7](https://github.com/venipublishing-main/venipublishing-website/pull/7) **passed** a direct synthetic full-clone GoTrue restart with 47 datasets, six logins and rotated signing keys after setting the scoped Auth search path. **Hosted recovery remains unproven** (managed provider/config parity, MFA/email, external Storage bytes, encrypted Free-tier exports and true rollback are open).

**B: Parent Veni Account authorization-code/S256 PKCE → independent Reserve SSR.** Website draft PR #3 contains an inactive consent preview with empty hosted client allowlist; Reserve draft #23/#24 passed synthetic local provider/HTTP callback with `email` OAuth scope and no real parent browser UI. This is **OAuth, not a confirmed full OIDC/JWKS identity service**. Verify `iss`/subject mapping, account collision policy, callback URL, session expiry/revocation and Reserve's own Auth/Membership before enabling hosted.

Neither shared email, copied JWT, OAuth `email` scope, Website login, nor a global subscription proves Tenant role. **Never implement both models as if already operative.** Preserve a transport-neutral Reserve actor adapter so that the business app remains independent.

## Checklist R — release prohibitions and approval gates

| ID | Forbidden until reviewed and separately authorized | Why |
| --- | --- | --- |
| R01 | Merge/deploy draft PR stack, run SQL on hosted Supabase, toggle hosted OAuth, change keys or hosted provider/client settings | Incomplete identity/release evidence |
| R02 | Create/live-register real Reserve businesses, customers or bookings; accept real payments or publish Themes | M1/M2/M4/M5/M7 readiness and consent gates |
| R03 | Change parent GitHub Pages `/kids/`, DNS, xneelo, worker routing or paid resources | Independent product and cost constraints |
| R04 | Delete an actual or historically linked synthetic account just to clean tests; cascade-delete auth/audit/owners | Active Owner history, FK, legal hold, two-person assurance and recovery unresolved |
| R05 | Link accounts by same email, transfer roles from OAuth scope, trust `user_metadata`, use client service-role or bypass RLS | Identity and cross-Sphere privilege escalation |

## Immediate next increments for Reserve team

1. **Now:** attach this checklist to Issue #13, reference Website contract, and continue G01/G04/G05/G08 against Reserve's own M0–M14 ordering and branch review; no hosted mutations. Record local commit, test counts and limitations separately from human acceptance.
2. **Next:** finish G02/G03/G06/G07 independent owner browser checks; keep developer-only routes and Theme drafts private. Do not claim a passed unit suite proves browser accessibility or production security.
3. **Joint design:** submit A01 one-page ADR; then A02–A06 challenge cases and exact protocol adapter tests; review retention/deletion contract before a staged user import or account migration.
4. **Later with explicit owner approval:** propose isolated hosted staging plan A07–A09, backup/rollback, manual review and security signoff. Production release remains a separate decision.
5. **After Reserve integration:** design Veni Performance/Sports as its own product adapter, organisations, hierarchy, coach/player invitation and distinct authorization scopes. Reuse Veni Account **identity** only; never inherit Reserve Tenant permissions.

## References and status provenance

- Reserve Master Product Ledger VR-1486–1490, Production Diary (15–16 Nov), Architecture Reconciliation Register, and [Reserve Issue #13](https://github.com/venipublishing-main/veni-reserve/issues/13) addendum.
- [Reserve draft PR #16 SSR](https://github.com/venipublishing-main/veni-reserve/pull/16); [#20 local Tenant/settings](https://github.com/venipublishing-main/veni-reserve/pull/20); [#22 private Theme](https://github.com/venipublishing-main/veni-reserve/pull/22); [#23 OAuth client](https://github.com/venipublishing-main/veni-reserve/pull/23); [#24 real local OAuth proof](https://github.com/venipublishing-main/veni-reserve/pull/24).
- [Website draft PR #2 shared backend](https://github.com/venipublishing-main/venipublishing-website/pull/2); [#3 consent preview](https://github.com/venipublishing-main/venipublishing-website/pull/3); [#11 account-retention review](https://github.com/venipublishing-main/venipublishing-website/pull/11), which stacks on #4–#10.
- [Website upstream integration contract, draft PR #12](https://github.com/venipublishing-main/venipublishing-website/pull/12) — documentation published for review on the draft branch. This checklist remains a draft and grants no implementation or release authority.

### Independent 17 November verification checkpoint (not migration completion)

[Reserve audit draft PR #26](https://github.com/venipublishing-main/veni-reserve/pull/26) reports **65/65 local tests** across Reserve OAuth (12), Website M1/M2/delete/retention (42) and Website consent (11), plus reviews passing CI. The project's **~35% integration-readiness estimate** divides into architecture 70%, local implementation 55%, test verification 55%, real-browser acceptance 20%, hosted staging 10%, production 0%. These are assessment percentages, not portions of data imported into a live Website Supabase project. Reserve has not approved a live architecture choice. Complete Website→Reserve human browser consent/login, real subject→Tenant permissions, Theme/M2 end-to-end, historic deletion/owner transfers, hosted backups, full rollback and explicit release gates before any migration.
