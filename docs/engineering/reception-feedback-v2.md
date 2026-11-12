# Reception feedback V2 — review candidate, not deployed

Scope: [PR #11 comment 6815191920](https://github.com/venipublishing-main/veni-reserve/pull/11#issuecomment-6815191920).
Branch: `feat/reception-feedback-v2-20261112`, stacked on
`feat/playground-feedback-preview-20261111` at reviewed release
`4218a3cf52bf485ee626f343c1bf1654fbcf16de`. The draft PR records the exact candidate
SHA and CI run; the generated `version.json` must match that SHA. No merge or
deployment is part of this change. PRs #9/#10/#11 retain their branches and bases.

## Changes and engineering checklist

- [x] By practitioner and expanded ranges use wrapping, auto-height cards with a
  76px minimum and a 140px preferred minimum width, bounded by the available width.
  Full person headings and status/group labels have no clamp/truncation. Grouping
  uses measured card/header heights; scrolling remains available for content growth.
  The maximum observed card height prevents regroup/resize oscillation. Groups
  still expose every exact configured start. Customer time buttons are unchanged.
- [x] Remove minimap UI, CSS, event wiring, focus targets and camera-only helpers.
  Day's flex viewport fills the remaining board area; the existing ResizeObserver
  refits only in Fit mode and otherwise clamps without resetting intentional zoom.
  Expanded Day uses the same renderer. Exact service/buffer geometry is unchanged.
  Occupancy/conflict indicators cover partly/fully offscreen content on both axes.
- [x] Keep scoped pointer-wheel zoom, middle-pan, Hand/Space, keyboard, +/- and
  Fit/Readable/directional controls. Keep foreground-modal gesture isolation.
- [x] Week projects Monday–Sunday business-local dates and existing appointment
  snapshots. Each appointment is counted once; buffers and simulated busy time are
  labelled separately. Conflicts/approved overrides use the existing projection.
  Closed/off-grid/removed-person records remain accessible. All cards remain in a
  scrolling list; there is no truncation, Month button or alternate scheduler.
- [x] Week day actions select that date in Day; card details carry their own date;
  New booking carries that date into the existing composer, including the selected
  simulated actor/service and unchanged notice/horizon/override checks.
- [x] First-use Day help waits for other modals, suspends board gestures, supports
  close/Escape/start and restores focus through the existing dialog. Its memory-only
  seen flag survives view/date/config changes and soft baseline restoration. Hard
  reset, expiry and fresh session clear it. Pending open work is cancelled on unmount.
  Release Guide and help share instructions; no minimap guidance remains in UI.
- [x] Preserve Agenda, static release boundaries, image/session cleanup, scheduler
  and existing regressions; no dependencies or persistence added.

Tests include allowed-length names, mixed statuses, measured-density budgets,
lossless grouping, year/month/leap boundaries, business-zone dates, all 200 synthetic
records, correct dated handlers, retained snapshots, conflicts/overrides/cancellation,
unchanged booking eligibility, modal waiting and help lifecycle. The former minimap
rectangle/recentre test is replaced by resize-camera and offscreen-occupancy tests;
Day/expanded markup now requires minimap absence. Other domain tests are preserved.
Markup/source/handler tests do not prove rendered text fit, pointer/touch behaviour,
focus restoration or browser-console cleanliness.

## Validation commands

Run in `E:\Dev\veni-reserve-reception-v2` with the pinned Node 24 / pnpm 12.11.2:

```powershell
corepack pnpm install --frozen-lockfile
corepack pnpm typecheck
corepack pnpm lint
corepack pnpm test
corepack pnpm build
corepack pnpm build:playground-preview
corepack pnpm verify:playground-preview
```

After committing, rebuild the isolated preview so its identifier is the candidate
SHA, then verify the clean-tree publication boundary WITHOUT publishing:

```powershell
corepack pnpm build:playground-preview
node preview/verify-artifact.mjs --for-publication
corepack pnpm exec wrangler dev --config preview/wrangler.json --ip 127.0.0.1 --port 5183 --local
```

While that local server runs, in a separate terminal:

```powershell
node preview/smoke.mjs http://127.0.0.1:5183
```

Stop only that local server afterward. The smoke script checks root/direct route,
release identifier, artifact hashes, security headers and rejected GET/POST backend
paths. Exact candidate-head `validate` and `database-security` must pass on GitHub.
No browser controls have been retried; no screenshots or visual PASS are claimed.

Local validation: pinned installation, typecheck, lint, all 330 tests across 15 files,
main build and isolated preview build/artifact verification passed. The existing
React Router use-client bundler warning remains non-blocking. The draft PR records
the final committed-source HTTP verification and exact-head CI results.

## Focused manual acceptance (pending)

- [ ] Desktop, tablet, phone and 200% browser text zoom: long practitioner names,
  mixed statuses, range labels and expanded ranges wrap fully; reach every start.
- [ ] Day and Expand day: recovered vertical space is used, no minimap/blank strip;
  exact 60-minute booking + 10-minute buffer remains aligned. Resize at Fit and
  intentionally zoomed scales; verify offscreen occupied/conflict notices.
- [ ] Wheel/pointer anchoring, middle-drag release/cancel, Hand/touch and keyboard
  controls; no action click after pan; previews remain screen-sized and correctly
  placed. Agenda and Week keep ordinary scrolling.
- [ ] Week at month/year boundaries: seven dates, accurate unique counts, empty/
  closed/retained days, long and dense cards. Day/card/New booking actions use the
  clicked date. Cancel a Week booking and check Day/Agenda/public availability.
- [ ] First Reception Day entry: help once; dismiss via close/Escape/Start; focus
  returns; reopen explicitly. No repeat across views/dates or soft restore. Hard
  reset/expiry enables it again after setup. Existing modals never stack with help.
- [ ] Browser console/network and Guide/feedback: no errors, backend transmission,
  unexpected persistence or automatic feedback submission.

## Separate release approval and rollback

Current public preview remains `https://vf-reserve-playground.veni-reserve.workers.dev/playground`:

- Source: `4218a3cf52bf485ee626f343c1bf1654fbcf16de`.
- Cloudflare version: `4341a172-0ce9-41fc-9ce6-4e730a31bd55`.
- Artifact: `playground-static-v1`; original release worktree and generated artifact
  retained at `E:\Dev\veni-reserve-feedback-preview`.
- Original `version.json` SHA-256:
  `19a91e64bd56cb155580844273d51b611864e266957a32f7f592c5feedd49985`.

After owner acceptance and SEPARATE explicit publication authorization: verify exact
candidate CI, clean artifact/source identity, account/Free-plan/dedicated target and
no backend bindings; confirm the current deployment still matches the rollback
record above. Use only `preview/wrangler.json` to deploy manually, then run the
existing smoke script against the actual public URL and record its new provider
version. Never enable automatic feature-push publication or touch dev/staging.

Retain the old artifact/worktree and provider version. If an authorised later release
needs rollback, use the pinned Wrangler in this worktree with the dedicated config:

```powershell
corepack pnpm exec wrangler rollback 4341a172-0ce9-41fc-9ce6-4e730a31bd55 --config preview/wrangler.json
```

Verify rollback HTTP evidence from the ORIGINAL release worktree, because the smoke
script compares the public source against its local HEAD. If the provider version
is unavailable, verify/redeploy the retained original artifact only with owner
authorization. Disabling the dedicated workers.dev route is also available. No
rollback/deployment/disable command was executed during V2 preparation.
