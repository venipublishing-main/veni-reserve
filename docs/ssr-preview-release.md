# Standalone SSR review preview — Issue 15

This is the real React Router application in a dedicated non-production Worker,
not the separately deployed static Playground. No live identity, business writes,
public bookings, provider adapters, persistence or analytics are enabled.

## Isolation and identity

`CLOUDFLARE_ENV=app_preview` is selected by `ssr-preview/build.mjs` **before**
React Router/Vite compilation. Operational route modules are excluded from this
artifact. The Worker independently denies writes/API/Auth/booking traffic before
route dispatch. `/app/*` redirects to the unavailable account entry. `/ready` is
intentionally 503; `/health` reports app_preview. `/development/setup` is 404.

`/preview/setup` reuses the unsaved Business / Brand / Review fixture. Trusted
server configuration alone enables it; other environments return 404. Fictional
input remains component memory and is discarded on leaving/refresh. Saving and
publishing are disabled. No uploads or credentials are requested.

Nonce-based script CSP, same-origin-only connections, no form submission,
no framing, no-store and noindex headers apply to the Worker and its assets.
Noindex is not access control: this preview is public. Ordinary provider request
logs may exist; observability and application telemetry are disabled.

## Repeatable gates (Node 24 / pnpm 12.11.2)

```
corepack pnpm install --frozen-lockfile
corepack pnpm typecheck
corepack pnpm lint
corepack pnpm test
corepack pnpm build
# Serve/check the normal application using scripts/site-smoke.mjs as in CI.
corepack pnpm build:ssr-preview
node ssr-preview/verify.mjs --for-publication
corepack pnpm exec wrangler dev --config build/server/wrangler.json --ip 127.0.0.1 --port 5186 --local
# Separate terminal:
node ssr-preview/smoke.mjs http://127.0.0.1:5186
corepack pnpm build:playground-preview
node preview/verify-artifact.mjs --for-publication
# Serve/check static preview using preview/smoke.mjs as in CI.
```

Publication requires a clean committed tree, exact-head validate and
database-security green (the latter runs genuine disposable local
Auth/PostgREST/RLS checks), owner confirmation of Workers Free/capacity, correct
account `c71916b32e9e18b2271be2b081c4f927`, and confirmed absent target on first release.
The configured 10 ms CPU ceiling and lack of paid bindings do not guarantee
unlimited traffic: Free request/CPU quotas can cause unavailable responses.
Never enable billing to resolve a limit.

Build again at the exact approved SHA after committing. The verifier checks the
flattened target/environment, allowlisted vars, no unexpected bindings, public
file inventory, absence of provider code/credentials, and SHA-256 asset hashes.
Keep `.vite` metadata excluded by generated `.assetsignore`. Upload only built
Worker modules and client assets; never source, environment or private files.

## Manual publication — no automatic deploy

After gates pass, deploy only this inspected flattened configuration (its
`targetEnvironment` must be `app_preview`; do not switch environments afterward):

```
corepack pnpm exec wrangler deploy --config build/server/wrangler.json
corepack pnpm exec wrangler deployments list --config build/server/wrangler.json
node ssr-preview/smoke.mjs <provider-returned-HTTPS-origin> <exact-release-SHA>
```

Never use root/default deploy or the static Playground configuration. Verify
`/__preview/version`, HTML source marker and `__preview-assets.json` agree. Allow
up to two minutes of propagation using no-cache probes every ten seconds; require
three consecutive matching version probes before running complete public smoke.
If a genuine failure persists, disable/delete **only the newly created**
`vf-reserve-app-preview` after verifying account/name. There is no older SSR
version on first publication. Future releases retain their previous Worker
version for `wrangler rollback --config build/server/wrangler.json <version-id>`.
Never roll back or edit dev/staging/static Playground/parent Pages for SSR failure.

Recheck the existing public Playground `/version.json` still reports
`c09c24b3ae67190818f313af640693a0fa30aa41`.

## Review checklist and remaining gates

- HTTP/artifact tests are not visual/browser acceptance. Owner must check phone,
  desktop, keyboard, hydration/console, standalone navigation, fictional setup
  Business/Brand/Review, preview labels, Playground reset/session loss.
- No real federation is claimed. Owner-approved access to non-secret Veni Account
  issuer/client/claims/redirect requirements remains a separate gate; do not retry
  the previously denied project. Keep registration and persistence unavailable.
- Parent discovery draft PR remains unpublished. Add verified SSR URL as primary
  discovery and keep optional simulation link separate, subject to owner review.
