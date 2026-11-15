# Reserve local Veni Account OAuth receiving client — 2026-11-15

**Status:** Draft, entirely local and deliberately disconnected from real production auth.
This follows the Veni Website parent-account consent prototype and stacks on the
Reserve local tenant-bootstrap work. No production service, DNS, login, billing,
tenancy or Supabase project is migrated by this change.

## Purpose and permission boundary

- **Parent:** Veni Website owns the Veni Account identity and user-facing consent.
- **Child:** Reserve is an OAuth 2.1 authorization-code + PKCE *receiving client*.
- **Business permissions:** None are inferred from OAuth sign-in. The `/app/*`
  gate still denies real product access. A later membership/tenant authorization
  check must be a separately reviewed design and implementation.
- **Scopes:** `email` only in this synthetic pilot. It is an OAuth2 flow,
  **not an OIDC login**: no `openid` scope and no ID token. Production OIDC requires
  verifying signed ID token/JWKS, issuer, audience, nonce and expiry with an audited
  library and approved issuer config.
- **Privacy:** Local account page exposes only a synthetic user UUID, return path,
  short expiry and `productAccess: not_granted`. It never renders email, OAuth
  access tokens, client secret or raw provider errors.

## Local-only controls

The routes exist only when all conditions hold:

1. Build route manifest has `VENI_LOCAL_OAUTH=1`, is not `NODE_ENV=production`
   and is not the `app_preview` Cloudflare environment.
2. Runtime is Vite development (`import.meta.env.DEV`) and Cloudflare binding
   `VENI_ENV=dev`.
3. Request origin is exactly `http://127.0.0.1:5193`; provider origin is exactly
   `http://127.0.0.1:54321`. Custom external domains or hosted Supabase URLs
   are rejected at config creation.
4. Secrets have been supplied as untracked local Worker bindings (`.dev.vars`),
   not committed to source control or public Pages assets.

No `VENI_LOCAL_OAUTH` flag is present in deployed Worker config. This branch
does not alter public preview Workers, live redirects, `/kids/` or current login.

## Local setup — **fictional data only**

Requires an appropriately configured **disposable** local Supabase Auth instance
that supports OAuth 2.1 server functionality, a registered confidential OAuth
client, and the `current_reserve_user` RPC from the local tenant-bootstrap
migrations. This exact combination has not yet been proven end-to-end locally;
the protocol tests below run with a synthetic provider and cannot replace that
integration test. Do not point the client at the hosted Website or Sports project.

1. Start local Supabase on `127.0.0.1:54321` and apply the already reviewed
   local migrations. Enable its local OAuth server **if supported by the installed
   CLI/GoTrue version**. Do not change hosted configurations.
2. Register a **confidential** OAuth client and allow *exactly*
   `http://127.0.0.1:5193/auth/veni/callback`, `email` scope. The same client ID,
   callback and scope must be on the Website consent UI allowlist **only in the
   local/test instance**. The production website allowlist remains empty.
3. Add the following variables to an *untracked* local `.dev.vars`, preserving
   existing entries if the file exists. Generate a fresh secret key with
   `node -e 'console.log(require("node:crypto").randomBytes(32).toString("base64url"))'`.
   Never paste these values into a PR or into chat.

   ```ini
   VENI_OAUTH_CLIENT_ID=<disposable-confidential-client-uuid>
   VENI_OAUTH_CLIENT_SECRET=<disposable-client-secret>
   VENI_OAUTH_PUBLISHABLE_KEY=<disposable-local-supabase-anon-or-publishable-key>
   VENI_OAUTH_COOKIE_KEY=<fresh-32-byte-base64url-key>
   ```

4. From Reserve repo root, launch `node local/veni-oauth-start.mjs`. Visit
   `http://127.0.0.1:5193/auth/veni/start?next=%2Fapp`. The exchange returns to
   `/auth/veni/callback`, then shows `/development/veni-account` only if Auth
   `/user`, `current_reserve_user` live-session RPC and JWT client/session checks
   all agree. `/app/*` remains locked.

The disposable provider must issue an Auth access token with `client_id` equal
to the registered OAuth client UUID, `sub` equal to Auth `/user` ID, a valid
`session_id`, `role=authenticated`, and an unexpired `exp`. The local RPC must
check the actual `auth.sessions` row and reject revoked sessions. If the local
stack cannot meet these conditions, **stop**; that is an environment gate, not
a reason to bypass verification.

## Concrete security contract

| Point | Enforced locally |
| --- | --- |
| Start | Fresh cryptographic `state`, SHA-256 PKCE S256, exact redirect URI |
| Return path | Only `/app`, `/app/onboarding`, `/app/customize`, `/app/settings` |
| CSRF / callback | One short encrypted HttpOnly `SameSite=Lax` transaction cookie, strict state and query validation |
| Exchange | Server-to-server POST, confidential-client Basic secret, code verifier, no external redirects |
| Identity | Supabase Auth `/auth/v1/user` confirms bearer token and user ID |
| Live session | Local RLS RPC `current_reserve_user` confirms `auth.sessions` is still active |
| JWT claim binding | Client ID, subject, session ID, role and expiry checked **after** trusted Auth/RPC checks |
| Session | AES-GCM sealed access token in a HttpOnly, 5-minute, non-refreshing localhost cookie |
| UI | Verified synthetic UUID; explicit product-access denial |
| Failure | Generic no-store response; transaction cookie cleared; no token or secret output |

`SameSite=Lax` is required for a top-level OAuth redirect. This local HTTP
cookie **must not** be reused in production: production requires HTTPS,
`Secure` and `__Host-` cookie names, rotation, logout/revocation UX, and a
fully assessed session strategy. The 5-minute local session is deliberate.

## Mock verification

Run with Node 24, no database/network/credentials needed:

```bash
node --experimental-strip-types --test tests/veni-oauth-client.test.mjs
```

Tests cover challenge binding, unique state, bounded return paths, confidential
token request, valid Auth + RPC, product-access denial, state/duplicate/cookie
tampering, client ID mismatch, invalid session ID, anonymous/revoked/expired
tokens, session revocation after login, and strict local origin enforcement.
**Synthetic provider responses are not evidence that real Supabase OAuth
server functionality or a browser redirect works yet.**

## Next integration gates (not approved by this PR)

1. Confirm real local Supabase OAuth server support, registered client and
   exact redirect; run browser callback/consent and revocation tests with disposable
   users. Confirm response cookies are preserved across React Router SSR.
2. Confirm the auth access token `client_id` and `session_id` claim contracts;
   confirm the exact local RPC uses a live session and remains usable for
   `email`-scoped OAuth users.
3. Reconcile Parent Website consent allowlist with a test-only registered
   client (parent currently ships with an empty allowlist).
4. Review production OIDC choice, token storage, `__Host-` cookies, strict
   origin and CSRF controls, rate limits, account linking, audit and logout.
5. Only after another explicit approval, stage a production migration while
   preserving a reversible extraction path. No hosted data should be copied
   in this preview.

Related stacked drafts: Website OAuth consent PR #3; Reserve SSR PR #16;
Reserve local tenant-bootstrap PR #20.
