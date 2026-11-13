# Standalone Reserve entry and gated setup review

Issue #13 and its mandatory public addendum (comment 6844684823) define this slice.
Base: c09c24b3ae67190818f313af640693a0fa30aa41. No deployment or hosted writes.
Private design references were consulted; their contents are not copied here.

## Implemented boundary

| Route | Behaviour |
| --- | --- |
| `/` | Standalone Reserve navigation; equal optional Playground/direct signup entries |
| `/playground` | Existing memory-only simulation plus main-app-only optional signup link |
| `/signup`, `/login` | Honest account-integration gate; no password form, SDK, session or successful signup |
| `/app`, `/app/*` | GET/HEAD redirects to login with an exact allowlisted internal destination; writes fail 503 |
| `/auth/*` | Sanitized 503; no token/code processing, exchange, session or fabricated logout |
| `/book/:tenant_slug` | Proposed host-independent path; unpublished 503, no tenant lookup/real booking |
| `/development/setup` | Loopback + DEV-build + DEV-environment fixture only; production GET 404, all POST 405 |

The fixture is an explicitly unsaved Business -> Brand -> Review component journey.
It shares the unchanged M2.1 settings validator (extracted into a pure module) with
the existing server transport, and reuses booking theme tokens/time-button styling.
Colours are six-digit hex only; typography is a bounded system-font choice. There
are no arbitrary CSS, fonts, assets or network submissions. Changes between steps
remain in component memory; refresh/navigation or Discard removes them. This is
not a persistent private draft, real Tenant, account or a second onboarding database.
Save and Publish stay disabled. Other canonical steps have explicit dependency gates.

The static feedback release still imports the original Playground directly, not
the new main-app wrapper. Its source, configuration, request restrictions, memory
session/reset/expiry behaviour and public deployment remain unchanged.

## Evidence and dependencies

Read-only staging migration and catalog inspection on 2026-11-13: only the three
M1 migrations are applied; all eight public tables have RLS enabled. The checked-in
M2.1 business-settings migration is not deployed. No rows or credentials were read.
The existing M1 User references its own project's auth.users UUID. Email matching
or accepting the umbrella token would not establish Reserve Membership authority.

This is a route/component slice, NOT completion of M2, M7 or M9. Required next gates:

1. Shared identity choice, exact issuer/audience/callback contracts, account linking,
   logout/revocation, provider support and cost validation.
2. Transactional authenticated SETUP Tenant + initial active Owner bootstrap with
   audit/idempotency and server-side Membership lookup; multi-business selection.
3. Separately approved M2.1 deployment; existing revision-checked settings RPC; canonical
   Location/Service/Staff/Availability entities and capabilities. No parallel setup store.
4. Server-saved resume from canonical entities. Test interrupted setup, returning users,
   inactive Membership and cross-tenant access using genuine Auth/Postgres.
5. Theme container -> immutable revision -> current draft pointer. Unsaved UI changes
   become a revision only after authorized transactional Save. Private preview pins
   an exact revision/snapshot. Publication switches a complete validated assignment
   atomically with audit/history and expected-revision checks; never mutates a revision.
6. M4/M5 booking authority and readiness before public bookings; M7 publication and
   later M9 breadth. SETUP != ACTIVE; neither state encodes a subscription plan.

## Identity decision recommendation (not activated)

Read the umbrella's current account JS/register/sign-in/account pages and public
provider configuration. Its Auth project differs from Reserve staging. It uses a
browser Supabase client, persisted session/refresh handling and same-origin `next`.
No existing account flow was executed, and no credential/session store was read.
An external Reserve return URL cannot simply be handed to the current `next` logic.

Preferred direction for a separately approved spike: keep Veni Account as the common
identity authority; evaluate its Supabase OAuth/OIDC server with Reserve Auth as an
OIDC relying party. Users authenticate once with the common provider; Reserve receives
its own scoped session and deliberately mapped local identity projection, not copied
passwords or a second unrelated password account. Creating that local auth.users
projection is itself a hosted side effect and requires explicit approval.

Supabase documents an OAuth 2.1/OIDC server with PKCE and no separate server fee
(MAU quotas still apply), and up to three custom OAuth/OIDC providers on Free.
These are documented capabilities, not proof of compatibility/configuration in our
projects. Provider maturity, availability, quotas and actual end-to-end interoperability
must be checked in the spike before adoption.

Security acceptance for that spike:

- Exact trusted issuer, discovery/JWKS and allowed algorithms; signature, expiry,
  audience, nonce/state and PKCE verification. Never accept an upstream token directly
  as Reserve database authority. Fail closed on ambiguity/rotation/revocation.
- Bind identities by verified `(issuer, subject)` to the Reserve local User UUID.
  Do not infer equivalence or Owner authority from email, cookies, query parameters,
  client metadata or roles. Review provider automatic email-linking behaviour; block
  activation if secure explicit linking cannot be demonstrated. Existing-account
  linking needs proof of control of both identities and an audit trail.
- Reserve SSR validates its own session on every protected boundary and resolves
  active Membership/capabilities on the server; RLS remains independent. No service-role
  bypass for ordinary operations. Tenant bootstrap must enforce a real active Owner.
- Prefer server-owned auth exchange/refresh with host-only Secure, HttpOnly cookies,
  SameSite=Lax where compatible; no browser auth client needing those cookies. This
  differs from Supabase's shared browser/server SDK cookie model and needs a verified
  implementation, not merely adding HttpOnly to a browser-managed client.
- Explicit approved callbacks per environment, no wildcard external redirects, short-lived
  state-bound transaction cookies, CSRF/origin protection, no-store responses and URL/log
  redaction. Codes are one-use and removed before app navigation. No tokens in redirects.
- Reserve logout ends its local session first. Global Veni Account logout is a separate,
  explicit choice; test multiple tabs/products, expired sessions and refresh races.
  Do not claim local logout revokes every upstream session.

Alternatives: accepting third-party OIDC JWTs directly would require a deliberate
change to current auth.users/User/RLS mapping, not just enabling a switch. Consolidating
all data/Auth into the umbrella project has a much larger migration/isolation impact.
A separate Reserve password signup duplicates the current identity problem and is
not recommended. All remain unimplemented pending a recorded owner decision.

Primary references, reviewed 2026-11-13:

- https://supabase.com/docs/guides/auth/oauth-server
- https://supabase.com/docs/guides/auth/custom-oauth-providers
- https://supabase.com/docs/guides/auth/server-side/advanced-guide
- https://github.com/venipublishing-main/venipublishing-website/blob/main/assets/js/veni-account.js

## Hosting and discovery

Recommend a separately approved Reserve HTTPS SSR origin on the existing Workers
architecture. Choose an owned hostname later; no new domain/zone migration is required
for this local slice. Preserve umbrella Pages, /kids/, /account/ and DNS. Do not embed
the dynamic app into a GitHub Pages directory. Tenant UUID/slug and logical booking
paths remain independent of the hostname. `/book/:tenant_slug` is an interim proposed
application route, not a newly approved public canonical address.

`integration/veni-publishing/` provides the addendum's compatible local discovery
contract and insertion fragment. It is NOT applied to either umbrella repo or public
website. The real SaaS destination is intentionally unset. Review/apply the fragment
on a safe umbrella preview branch only after owner review. No broken signup link is
published, and the existing synthetic Playground link is labelled accordingly.

## Reproduction and evidence

Use Node 24, pinned Corepack pnpm 12.11.2, unset CLOUDFLARE_ENV (local DEV only).
Do not use `.dev.vars` containing provider credentials for this review.

```powershell
corepack pnpm install --frozen-lockfile
corepack pnpm typecheck
corepack pnpm lint
corepack pnpm test
corepack pnpm build
corepack pnpm exec vite preview --host 127.0.0.1 --port 5185 --strictPort
# Separate terminal: production build denies the local-only fixture.
node scripts/site-smoke.mjs http://127.0.0.1:5185
corepack pnpm build:playground-preview
node preview/verify-artifact.mjs --for-publication
corepack pnpm exec wrangler dev --config preview/wrangler.json --ip 127.0.0.1 --port 5184 --local
# Separate terminal:
node preview/smoke.mjs http://127.0.0.1:5184
# Interactive local design review (separate terminal):
corepack pnpm dev --host 127.0.0.1 --port 5174 --strictPort
node scripts/site-smoke.mjs http://127.0.0.1:5174 --dev
```

Publication artifact verification here checks isolation only; it does not authorize
deployment. It requires a clean committed worktree. Check ports first; do not stop
unrelated servers. CI runs the main built-route HTTP checks and existing static preview
checks, plus the real local database-security suite. It never publishes this branch.

### Engineering acceptance checklist

- [x] Separate worktree/stack; untouched public deployment and earlier branches.
- [x] Standalone homepage/logo/navigation; direct signup and optional tutorial paths.
- [x] Closed account/session/workspace/callback boundaries; no fake account success.
- [x] Exact internal return allowlist and no credential/query echo.
- [x] Shared business validator and bounded live theme preview; no saving or publication.
- [x] Unpublished umbrella fragment and host-independent routing contract.
- [ ] Trusted shared identity, transactional bootstrap and real returning-user resume.
- [ ] Persisted Theme revisions/private preview/publish with tenant authorization.
- [ ] Actual browser/mobile/keyboard acceptance (blocked browser controls not retried).

Tests distinguish closed-route denial from real authorization: no unit fixture is
evidence of a working shared-account integration. Existing genuine local database
cross-tenant tests remain the security foundation and are rerun in CI.

Manual review: enter `/` directly, use logo and browser Back, visit signup without
Playground, then Playground -> signup; neither should create/import anything. Open
`/development/setup`, use fictional settings, invalid timezone/currency/colour values,
Brand live preview, Back/Review and Discard. Refresh must lose edits. Verify keyboard
labels/focus and narrow-screen wrapping. Direct `/app/customize` must reach the account
gate. Confirm existing demo/reception interactions separately. No visual PASS is claimed
from SSR, unit or HTTP checks.

## Independent continuation: discovery and synthetic identity contracts

See [federation feasibility and origin recommendation](veni-account-federation-feasibility.md).
The parent-site discovery is now prepared against current production main in an
unpublished feature branch/draft PR; the older preview repository was not used.
Reserve home now exposes the existing gated Business setup and Public booking entry.
Actual /app and /auth gates remain unchanged. Test-only fixtures add no runtime Auth.
