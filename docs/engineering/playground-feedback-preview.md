# My Playground feedback preview release

Source candidate: `d9a1543957147f0bb32f97c1759b9d274ad93493` (owner-reported positive walkthrough, not blanket browser/mobile/accessibility acceptance).
Release worktree: `E:\Dev\veni-reserve-feedback-preview`.
Release branch: `feat/playground-feedback-preview-20261111`, stacked on PR #10's
`feat/playground-core-poc-20261110`. Leave PRs #9/#10, main and staging unchanged.
Week/Month/custom ranges, graphics and expanded customisation are backlog.

## Isolation and artifact

`preview/vite.config.mjs` builds a browser-only entry which imports the existing
Playground component, scheduler and booking/workspace UI. The main application's
SSR configuration and source remain unchanged. No environment-file loading or
public-directory copying is enabled. Build guards reject backend module imports
and network/environment/persistence primitives in application source.

Only `dist/playground-preview` is eligible for publication: two entry HTML files,
404 HTML, one hashed JS bundle, one hashed CSS bundle, `_headers`, and `version.json`.
The verifier rejects extra files, symlinks, source maps, known staging values and
checksum mismatches. It never uploads the repository or the normal `build/` output.
`version.json` records the real source commit and SHA-256 file checksums. Rebuild
after committing; the publication verifier requires the current head and clean tree.

`preview/wrangler.json` is dedicated to `vf-reserve-playground` in Veni Publishing's
account `c71916b32e9e18b2271be2b081c4f927`. There is no application Worker entry,
backend credential, environment, resource/service binding or custom domain.
Root and `/playground` are explicit static HTML entries. No SPA fallback is used.
Excluded API/auth paths return 404/405, not successful application/API shells.
Wrangler's pinned runtime requires compatibility date `2026-10-06`; no tool upgrade.

CSP denies connections and form submission, permits only same-origin scripts,
local blob/raster images and inline theme styles, and forbids framing. Other tested
headers include nosniff, no-referrer, noindex and restricted device permissions.
No analytics, session recording or application telemetry is added. Ordinary hosting
request logs may exist. Public/noindex is not authentication or confidentiality.

Independent mounted browser sessions, local raster handling, original-baseline
reset, hard reset and inactivity expiry are shared unchanged. Feedback is a separate
ephemeral form: only knowingly entered task/expected/actual/device text and version
are copied. No configuration, emails, logos or appointments are attached. Copying
does not submit feedback. Close the feedback dialog to discard its input.

## Release gates and manual publication

Run in the release worktree with Node 24 and pnpm 12.11.2:

```powershell
corepack pnpm install --frozen-lockfile
corepack pnpm typecheck
corepack pnpm lint
corepack pnpm test
corepack pnpm build
corepack pnpm build:playground-preview
node preview/verify-artifact.mjs --for-publication
corepack pnpm exec wrangler deploy --config preview/wrangler.json --dry-run
```

Before publication, require passing exact-release-head validate/database-security,
correct account, static-only $0 configuration, target absence/dedication and account
plan/capacity verification. Never enable billing to pass a gate. Wrangler `whoami`
verified `veni.publishing@gmail.com` and the account above; the dedicated target's
deployment listing returned provider code 10007 (does not exist) during preparation.
Account plan/headroom still requires the requested read-only Dashboard confirmation.

The [provider's static-assets billing documentation](https://developers.cloudflare.com/workers/static-assets/billing-and-limitations/)
states that static-asset requests/storage are free; Worker execution is different.
This release has no application Worker and only seven generated files. Public
pricing alone is not a substitute for the account gate. No paid feature is enabled.

Only after every gate passes, publish manually (never from automatic feature CI):

```powershell
corepack pnpm exec wrangler deploy --config preview/wrangler.json
node preview/smoke.mjs https://vf-reserve-playground.ACTUAL-SUBDOMAIN.workers.dev
```

Use the actual URL returned by deployment, not the placeholder above. Record the
deployment version ID, exact source SHA, URL and `version.json` digest in the handoff.
The HTTP script verifies entry/refresh routes, displayed HTML version, every served
payload hash, security headers, no application cookie, POST rejection and excluded
API/auth/private-source paths. It cannot establish JavaScript interaction or visual fit.
To check locally, start `wrangler dev --config preview/wrangler.json --local` on a
dedicated port AFTER building, then pass that local URL to the smoke script. Rebuild
before starting the server to avoid asset-watcher races. CI does this without deploying.

## Disable / rollback

No previous deployment exists for the first release. If it must be withdrawn,
the owner can select only `vf-reserve-playground` in Cloudflare Dashboard and disable
its workers.dev route, or remove only that dedicated target:

```powershell
corepack pnpm exec wrangler delete vf-reserve-playground --config preview/wrangler.json
```

Check the displayed target/account and confirm interactively; never substitute the
root config or `vf-reserve-dev`/`vf-reserve-stg`. Removing the target does not clear
already-open browser memory or the tester's device. For a subsequent release with
a recorded known-good provider version, use:

```powershell
corepack pnpm exec wrangler rollback KNOWN_GOOD_VERSION_ID --config preview/wrangler.json
```

Recheck the public URL/version afterward. These are recovery instructions, not
authorisation to delete or roll back any existing target during preparation.

## Tester introduction and acceptance

“My Playground is a temporary Veni Reserve feedback preview. Use a fictional
business to try setup, customer booking and reception. Nothing books a real service
or connects a real calendar. Refresh/exit/expiry loses the session. Use Guide / Copy
feedback to describe your task, expected result, actual result and device/browser;
copying does not send anything. Return the copied text to your inviter.”

- [ ] Desktop/tablet/mobile: root and direct `/playground` load and refresh.
- [ ] Fictional setup, branding/local logo, eligibility and scheduling journey.
- [ ] Reception wheel/middle-pan, controls/minimap, preview/focus/dialog behaviour.
- [ ] Independent tabs, baseline/hard reset, expiry, local image cleanup.
- [ ] Version and notices, clipboard/manual-copy fallback, no automatic attachments.
- [ ] Browser console/network: no CSP regressions, backend requests or entered-data
  transmission. Ordinary static hosting requests are expected.

Blocked browser controls must not be retried. The prior owner's local walkthrough
does not constitute public-preview browser acceptance. Pause for owner review
before wider circulation. No bulk invitations or automatic feature-push publishing.
