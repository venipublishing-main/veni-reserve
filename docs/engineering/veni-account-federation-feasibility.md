# Veni Account federation feasibility — 2026-11-13

Status: **conditionally plausible architecture; live integration NOT VERIFIED and NOT enabled**.
Authority: Issue #13, PR #14 comments 6845522124 and 6845909369. The latter permits
independent development while preserving the provider-access denial. No denied project
access was retried. No provider configuration, keys, users, database or deployment changed.

## Evidence matrix

| Requirement | Evidence / status |
| --- | --- |
| Existing Reserve source | PR #14; standalone routes and gates preserved |
| Parent discovery | Production-source feature branch `feat/reserve-discovery-20261113`, [draft website PR #1](https://github.com/venipublishing-main/venipublishing-website/pull/1); homepage and Platforms |
| Parent publishing safety | Read-only Pages metadata: legacy `main:/`, HTTPS enforced; feature branch is not publication source; added CI is PR-only and cannot deploy |
| Veni Account project metadata | Earlier access denied; **owner evidence needed**, not retried through another account, token, endpoint or public discovery probe |
| Reserve / M1 | Existing public.users FK to local auth.users; private.business_user_id requires is_anonymous JSON false; active Membership/capabilities and Tenant state remain authoritative |
| OAuth Server availability | Official docs describe beta availability on all plans; **actual enablement and signing configuration unknown** |
| Custom OIDC sign-in | Official docs describe up to three custom providers on Free; **actual project support/configuration and remaining quota unknown** |
| Real project-to-project federation | **NOT TESTED**; no Auth exchanges, hosted identity creation or local Supabase provider emulation performed |
| Hermetic security contract | Fictional ES256 keys/tokens, state/nonce/PKCE, subject mapping, code replay, expiry/logout and membership rejection tested in process |
| Real RLS protection | Existing database-security CI exercises actual disposable local Postgres/Auth; a pure TypeScript membership model is not an RLS proof |
| Mobile / keyboard / actual browser | Pending manual review; no blocked browser control retry |

## Recommended direction and alternatives

| Option | Fit with current M1 | Decision |
| --- | --- | --- |
| Central Veni Account OIDC -> Reserve Auth custom provider -> Reserve-issued session | Deliberately mapped local auth.users UUID can preserve public.users/auth.uid() contract; no second password | Preferred **candidate**, subject to all gates below |
| Accept central JWT directly / third-party Auth | External subject is not automatically a local auth.users row; current FK/identity/RLS assumptions require reviewed redesign | Do not silently substitute; not this slice |
| Move Reserve data/Auth into the parent project | Wider migration, permissions, blast radius and production ownership consequences | Not justified for this bounded work |
| Independent Reserve password signup | Easier isolation but duplicates the unrelated identity problem | Not the shared-account direction |

Proposed trusted chain:

```text
Veni Account verified (issuer, subject)
  -> deliberately linked Reserve Auth user UUID
  -> canonical public.users UUID
  -> active Membership for selected Tenant
  -> server-validated capability + independent RLS
```

The local identity projection is not another password account. Its creation/linking
is nevertheless a hosted write requiring approval. A verified email is not our
identity key. No email, URL, browser role or upstream client claim grants Owner.
Tenant selection must use server-returned memberships; each request must reauthorize.

### Critical compatibility gates

1. Owner confirms central plan, OAuth Server enablement, exact discovery/issuer,
   asymmetric signing (ES256/RS256 for OIDC ID tokens), JWKS lifecycle and permissions.
   Do not enable the beta server or rotate keys merely to gather evidence.
2. Register the Reserve Auth relying client only after approval. Confirm the exact
   callback shown by its custom-provider UI; do not invent an allowlist. Add a narrow
   consent/authorization page to the central website only under separate approval.
   It must show verified requesting-client details, scopes, consent and an explicit
   Return to Reserve, not forward arbitrary `next` origins.
3. There are **two authorization legs**: Reserve app <-> Reserve Auth and Reserve
   Auth <-> central IdP. Establish independent state, nonce and S256 PKCE handling
   where required; prove the actual custom-provider client's PKCE compatibility with
   the central OAuth server. This fixture tests security properties of one bounded
   leg, not a real dual-hop protocol or provider SDK.
4. Pin issuer/discovery/JWKS and algorithms; verify signature, audience/authorized party,
   expiry, not-before, nonce, code binding and one-use transactions. Review rollover,
   stale key caches, cancellation and denied consent. Do not fetch keys from token
   header URLs or allow wrong-project JWTs into the Reserve data API.
5. **Account-linking blocker:** Supabase documents automatic linking by verified email.
   That default does not prove our stricter subject/proof-of-control policy. Confirm
   exact provider behaviour and an enforceable collision/linking policy before any
   user provisioning. Ambiguous or pre-existing email collisions must stop for explicit
   verified linking, never silently acquire another local identity's memberships.
6. Prove confirmation, disabled/deleted accounts, MFA/assurance, returning users and
   subject stability. Central revocation must not be assumed to instantly revoke a
   downstream Reserve JWT; define bounded session lifetime and refresh/revalidation.
7. Use Reserve-owned SSR exchange/refresh and host-only Secure cookies. A server-only
   design can use HttpOnly; a browser-managed Supabase client cannot simply be given
   unreadable cookies without changing its refresh architecture. Decide the implementation
   before adopting a package. Use SameSite=Lax when compatible with the callback flow,
   origin/anti-CSRF protection for mutations, no-store, referrer controls and redacted
   callback logs. OAuth GET callbacks rely on bound state/nonce/cookie proof, not an
   assumed browser Origin header. No tokens in query redirects or cross-domain cookies.
8. Distinguish Reserve-local logout from global Veni Account logout. Test refresh races,
   expiry/revocation, multiple browser tabs and both account scopes before launch.

## Synthetic proof: precise limits

`tests/fixtures/identity-contract.ts` is test-only, never imported by application routes.
It generates ephemeral ES256 keys in memory and handles fictional `.invalid` identities.
There are no network calls, persistent sessions, real credentials or UI login success.
It deliberately is NOT a reusable production JWT/OIDC verifier or full protocol server.

Tests cover RFC 7636's S256 vector; correct explicit issuer+subject -> local User mapping;
wrong key/algorithm/issuer/audience/nonce/expiry/nbf/iat and unconfirmed-email rejection;
same-email/unknown-subject denial; state, browser and callback binding; invalid verifier;
one-use codes, replay, expired transaction, parallel-transaction mixup; internal-return
allowlist; local session expiry and same-origin anti-CSRF logout; multiple-business
membership/capability checks and foreign/revoked/suspended/forged-session denial.

The fixture assumes a trusted, pre-reviewed mapping and key. It does not establish
real discovery/JWKS rotation, OAuth consent, browser cookie flags, federation refresh,
SDK interoperability, upstream logout or database persistence. Actual RLS is covered
separately by the existing genuine local database-security job. No RLS SQL was changed.

## Proposed standalone origin ($0-first; no resource created)

Propose a dedicated SSR staging/preproduction target named `vf-reserve-app-preview`
under the existing account's `workers.dev` subdomain. Illustrative, **not live or approved**:
`https://vf-reserve-app-preview.veni-reserve.workers.dev`. Name availability and account
limits must be verified before a later deployment. Do not overwrite dev/stg or the
static `vf-reserve-playground` target.

Parent GitHub Pages remains independently deployed. Its feature PR currently links
only to the existing labelled simulation. Once a standalone app is approved and ready,
ordinary links can point directly to its `/`; no account tokens or tutorial data travel
with those links. A durable owned Reserve hostname can follow later, without moving the
parent's DNS zone. Tenant identity/slug stays independent of origin. Current proposed
`/book/:tenant_slug` is an unpublished gate, not a change to canonical-host policy.

Reserve's proposed app callback is its own `/auth/callback`, currently closed. That
app callback is distinct from the Reserve Auth provider's upstream `/auth/v1/callback`.
Exact local/staging/production callback allowlists require explicit review; never use
wildcard destinations or add an arbitrary cross-origin `next` to the parent account JS.

Cloudflare documents 100,000 daily Worker requests and 10 ms CPU/invocation on Free;
dynamic SSR is subject to Worker limits, unlike asset-only serving. Measure SSR/auth
CPU and account headroom; this is not a promise of unlimited free production hosting.
Supabase documents no separate OAuth Server fee (MAU quotas apply) and bounded Free
custom-provider capacity. Existing project plan/usage remains unknown. Local tests
and review require no paid services; no billing or infrastructure changes were made.

## Owner-side evidence / next authorization

In the existing Supabase Dashboard, an authorized owner can inspect the Veni Account
project and supply **non-secret facts only**: plan, OAuth Server on/off, signing algorithm,
issuer/discovery and authorization/consent URL, and approved callback URLs. For Reserve,
confirm custom OIDC availability/quota and account-linking controls. This is read-only;
do not toggle anything, rotate keys or provide client secrets, passwords or tokens.
Alternatively arrange legitimate read-only project access; no denied-access workaround.

Then approve a narrowly bounded two-project compatibility experiment with explicit
provider/client/consent/callback changes and synthetic test users, rollback and no
production enrolment. That approval is NOT included in this task. On failure, keep
gates closed, revoke only experiment sessions/clients and revert the exact reviewed
configuration changes; never delete existing users or rotate shared signing keys.

After proven identity, the next application slice is idempotent transactional SETUP
Tenant + active Owner bootstrap with audit, server membership selection and separately
approved canonical settings persistence. Theme revisions/private draft/publish remain
later gated work; no fake Save or registration is added to bridge missing dependencies.

## Primary references (reviewed 2026-11-13)

- https://supabase.com/docs/guides/auth/oauth-server
- https://supabase.com/docs/guides/auth/oauth-server/getting-started
- https://supabase.com/docs/guides/auth/oauth-server/oauth-flows
- https://supabase.com/docs/guides/auth/custom-oauth-providers
- https://supabase.com/docs/guides/auth/auth-identity-linking
- https://supabase.com/docs/guides/auth/third-party/custom-oidc
- https://supabase.com/docs/guides/auth/server-side/advanced-guide
- https://developers.cloudflare.com/workers/platform/pricing/

These public documents support a candidate design; they do not override the project
permission denial or prove actual project settings. Private canonical documents are
referenced by authority only, not copied into this public repository.
