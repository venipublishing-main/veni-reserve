# Reception feedback V2 — review candidate, not deployed

Initial scope: [PR #11 comment 6815191920](https://github.com/venipublishing-main/veni-reserve/pull/11#issuecomment-6815191920).
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
  scrolling list in the initial V2 candidate; the revision below replaces its primary presentation.
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

Leave the final candidate server running for owner review; stop only that server when the walkthrough ends. The smoke script checks root/direct route,
release identifier, artifact hashes, security headers and rejected GET/POST backend
paths. Exact candidate-head `validate` and `database-security` must pass on GitHub.
No browser controls have been retried; no screenshots or visual PASS are claimed.

Initial V2 validation: pinned installation, typecheck, lint, all 330 tests across 15 files,
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
  placed. Agenda keeps ordinary scrolling; Week supports horizontal scrolling and shared timetable gestures.
- [ ] Week at month/year boundaries: seven dates, accurate unique counts, empty/
  closed/retained days, long and dense records. Day/card/New booking actions use the
  clicked date. Cancel a Week booking and check Day/Agenda/public availability.
- [ ] First Reception Day entry: help once; dismiss via close/Escape/Start; focus
  returns; reopen explicitly. No repeat across views/dates or soft restore. Hard
  reset/expiry enables it again after setup. Existing modals never stack with help.
- [ ] Browser console/network and Guide/feedback: no errors, backend transmission,
  unexpected persistence or automatic feedback submission.

## Shared calendar / Move / Back revision

Scope: [PR #12 comment 6821535550](https://github.com/venipublishing-main/veni-reserve/pull/12#issuecomment-6821535550), following reviewed candidate `d8959cbdf9bbf9aeecd95ddc17cd419366065747` on the same branch/base.

- [x] Keep the customer's existing Back control, make it sticky, and add explicit change-selection actions outside required form validation. Restore panel focus, preserve entered visitor details and compatible selections, and guard successful submission. Source inspection identified recovery/focus and dependent-selection weaknesses; no browser reproduction is claimed.
- [x] Reception recovery stays outside the form with sticky controls. White-time entry retains its exact anchor until explicit Change date & time. Services are not mutually filtered into an empty selector; invalid selections remain recoverable.
- [x] Week's primary UI now uses horizontally navigable dated groups of the SAME Day span renderer. A shared linear business-clock scale aligns times across different hours and split breaks. The world spans the working-hours union (09:00?17:00 fallback when the entire week is closed), not midnight?midnight. Bounded practitioner widths, measured headings, column virtualization, native horizontal scroll, horizontal trackpad input and buttons keep all dates reachable. The existing vertical Week list's projection/legacy markup tests are retained, but that list is no longer mounted as the primary Week view. New tests assert the shared renderer and aligned geometry.
- [x] Month uses Monday?Sunday padded dates, unique record counts and practitioner markers meaning **has bookings**, never fullness. Closed/conflict/retained indicators are separate; delayed read-only hover/focus and pinned full summaries expose all records and dated Day/Week/details actions. No native titles or minimap added.
- [x] Move reuses the composer and session scheduler, with a pure proposed state excluding only the source appointment/buffer. One atomic update retains ID/count, visitor/service identity and recorded duration/buffer snapshots. Current source reference, epoch/config revision, occupancy, eligibility, horizon and adapter-enforced actor scope are checked again. Staff can move only their own booking to themselves; simulated elevated operators can move across eligible people; public/unselected actors cannot manage appointments.
- [x] Cancellation/failure leaves the original unchanged. No-op and duplicate submits are safe. Old buffer waivers are removed; destination overrides require fresh consent bound to the actual touched records, never overriding service/external-busy collisions. Removed source service/practitioner produces a clear failure rather than silently rewriting history.
- [x] Navigation help and release Guide describe shared Week, Month, selection recovery and explicit Move confirmation. Agenda styling, VVB behavior, static release boundaries and memory-only lifecycle remain intact.

Regression evidence includes pure domain tests, source/SSR assertions, camera/pointer helpers and synthetic session mutations. These do **not** establish visual fit, live focus behavior or mouse/touch acceptance. No blocked browser mechanism was retried. There is no new persistence, real integration, hosted access or deployment.

### Additional owner walkthrough (pending)

- [ ] Customer: zero/stale slots, incomplete details and validation errors. Back/change actions stay reachable on a short phone viewport; compatible choices and typed details survive. Back/Forward does not duplicate a booking.
- [ ] Reception white-time entry: exact time stays anchored while choosing an eligible person/service. Explicit Change date & time releases it. Recover from no slots without closing the dialog.
- [ ] Week: different weekday hours and split breaks align 10:00 across all dates; exact 60-minute service plus 10-minute buffer. Horizontal scrollbar/trackpad, middle/Hand pan, anchored wheel zoom, buttons/keyboard, long headings and narrow screens. Check all seven days and retained exceptions.
- [ ] Month: month/year/leap boundaries, unique counts, person markers, closed/conflicts/retained indicators, delayed focus/hover then pinned dense summary, correct-date Open Day/Week and appointment details. Check focus return and modal isolation.
- [ ] Move from Day, Week, Month, By practitioner and Agenda: old/new details, cancellation, same-place confirmation, own-interval overlap and cross-person eligibility. Try Staff versus Reception/Owner and an unselected operator. Original remains after failures; success updates all views/public availability with one ID/count.
- [ ] Fresh buffer consent after a destination record changes; source canceled/moved/config changed while composer open; double submit; reset/expiry; no click after pan. Verify preview placement and no competing tooltip.

Revision validation: typecheck, lint, all 360 tests across 18 files, main build and isolated preview build/artifact verification passed. The existing React Router use-client bundler warning remains non-blocking. The final PR handoff records the committed SHA, exact-head CI and local HTTP results. The generated version manifest identifies the served commit. **NOT DEPLOYED**; owner review and separate publication approval remain required.

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
