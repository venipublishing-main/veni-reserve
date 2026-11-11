# Playground POC 1A — guided setup and temporary business

Stacked on PR #9, not a production booking release. Local route: `/playground`.

## Authority and scope

- [Master Product Ledger](https://docs.google.com/document/d/1fgeRZ7bUbO4G-Hq0S22rlnM6XpykCuUFnM4d42IQJdg/edit): canonical business graph, shared preview components, immutable checkpoints, scheduling independent of theme, M0–M14 gates.
- [Architecture Reconciliation Register](https://docs.google.com/document/d/1PJb19Gw-DSyJxUWBzVf0L0GXkSZe6vKQkisdn-Kpq8Q/edit): React Router/TypeScript, provider boundaries, server-authoritative production access and commit.
- Owner's Playground design review and POC 1A instruction: memory-only, no auto-populated VVB business, five setup steps, immutable tutorial baseline, soft/hard resets and configurable inactivity expiry.

No database, account, credentials, persistence, analytics, communications, OAuth,
calendar provider or deployment is introduced. Existing VVB routes retain their
fixture defaults and branding. They delegate to the same booking/reception
components used by the playground; they do not become writable.

## Implementation

`features/booking/availability.ts` is the shared interval calculation used by the
existing demo wrapper and the playground. A real production commit still needs
authorization, authoritative revalidation, idempotency and transactional conflict
protection. The browser calculation is not a production security boundary.

The playground adds one explicit Location, Services, Staff, service/staff/location
eligibility, independent weekday working periods and validated branding. Nothing assigns a
business, service or staff identity for the visitor. The five steps collect those
names and require explicit eligibility. Scheduling defaults are visible and
editable where scoped: a configurable start interval (default 15 minutes), weekday periods, two-hour notice and fourteen-day horizon.

`PlaygroundSession` is created per mounted route, never globally or in a loader.
Booking and reception read the same store. Commits recheck current slots and retain
service/staff labels and duration/buffer snapshots. Cancellation frees occupied
time. Calendar simulation maintains one staff busy interval, separate from
appointments; disconnect removes that interval without cancelling appointments.

The production adapter is a separate server-only, fail-closed placeholder. It has
no endpoint or credentials and cannot perform production operations. A future
asynchronous server transport must implement the canonical production requirements;
the UI does not select production authority from a client-controlled mode flag.

## Resets and lifecycle

- Completing setup deep-clones and freezes the tutorial configuration. It cannot
  be overwritten by subsequent edits or another completion call.
- Soft reset restores that exact baseline, including its logo, and removes all
  appointments, configuration experiments and simulated integration state.
- Hard reset returns empty inputs, clears baseline/configuration/appointments/
  integrations, and revokes owned object URLs.
- Both user-triggered resets require confirmation. Automatic expiry does not.
- Default inactivity is 60 minutes; a warning appears during the final five.
  `SESSION_POLICY` and the session constructor make the policy configurable.
- Checks run periodically, on focus/visibility/pageshow, and inside mutating
  operations before applying the requested action. Reads do not extend activity.
- No localStorage, sessionStorage, IndexedDB or URL state. A fresh mount/refresh
  starts empty. Pagehide discards state even if browser back-forward caching is
  used. Unmount releases image references. Beforeunload requests a loss warning
  after edits; browsers control whether they display that warning.
- Async image results from a reset/expired/unmounted session are revoked rather
  than attached to the new session. Soft reset preserves the original logo while
  revoking subsequent experiment images.

Deletion is application-level cleanup, not forensic erasure of RAM, browser caches
or device storage. Do not enter private customer data.

## Asset and theme boundaries

PNG/JPEG/WebP only; maximum 2 MiB input and four million decoded pixels. MIME and
signature checks precede browser decoding. Images are resized to at most 1024 px
on their longest edge, re-encoded as PNG, and held as local object URLs. No SVG,
remote image import, uploaded fonts, arbitrary CSS, JavaScript or server upload.
Browser raster decoding is not a server malware-scanning service; decoded size
is checked after decoding. Only validated hexadecimal primary/accent colours enter CSS
custom properties, with derived contrasting foreground text. Theme edits cannot
change scheduling.

## Limits

- One location, up to ten services, one to three people, 200 synthetic appointments.
  Three people is a Playground cap, not a production limit.
- Staff inherit business weekday hours, including split same-day windows; no overnight hours or resource
  pools. Prices are illustrative amounts without payment/currency processing.
- Timezone-aware local-to-UTC mapping; nonexistent/repeated wall times and slots
  crossing clock changes fail closed. This is bounded POC support, not full M3
  completion. Timezone cannot change while appointments or simulated busy time remain.
- Synthetic visitor labels are generated; playground booking collects no contact
  details. Existing VVB preview retains its original fictional-details form.
- Primary/accent colours and local logo only, not a complete M7 Theme Studio. No cloud
  Save Draft, publishing, account conversion, rescheduling or real integrations.

## Validation and manual acceptance

Run pinned `pnpm typecheck`, `pnpm lint`, `pnpm test`, `pnpm build`.
Vitest covers the session transitions, expiry with a fake clock, shared scheduling,
both directions of overlap/buffer protection, cancellation, eligibility, simulated
busy state, immutable baseline, URL cleanup, late image results, fresh-instance
emptiness and rendered shared components with visitor configuration. Existing VVB
tests remain in the suite. SSR rendering is not browser interaction evidence.

Browser automation remains unavailable and was not retried. Before accepting UX,
perform this manual checklist at desktop, tablet and mobile widths:

1. Visit `/playground`; verify business/location/timezone and person/service names
   start blank. Complete all five steps using your own fictional business.
2. Try missing names, no eligible staff, closed/invalid hours and invalid price.
   Verify guidance and blocked progression. Add a second service/person.
3. Change primary colour and upload a small supported logo; verify live preview.
4. Complete setup; book a synthetic appointment and switch to reception. It
   initially selects the most recently booked date. Verify the entered business,
   service and staff and the automatically generated synthetic visitor label.
5. Verify the slot and buffer are blocked. Cancel in reception and check the slot
   returns. Try selecting a service with a different eligibility assignment.
6. Connect the simulated busy interval; verify affected slots disappear. Disconnect
   and verify slots return without changing appointments.
7. Edit configuration and logo; confirm soft reset restores ORIGINAL tutorial
   inputs/logo and clears bookings and simulated calendar state.
8. Confirm hard reset returns a blank tutorial. Cancel a reset to verify no loss.
9. Test the warning/timeout using a locally shortened policy in a separately
   reviewed test setup, or wait the full default interval; return from a hidden
   tab and ensure an expired session cannot resume a booking or edit.
10. Refresh/leave/back and confirm no previous session is recovered. Verify loss
    warnings where supported. Check keyboard operation and browser console.
11. Visit `/demo/vvb` and `/demo/vvb/workspace`; verify VVB appearance and existing
    read-only behaviour remain unchanged.

No screenshot, browser-console or interactive-browser PASS is claimed by the
code/SSR tests. Review this stacked PR before merging either branch or deploying.

## Owner-feedback refinement (PR #10 comment 6769488911)

`Configuration.people` contains local display identity and a role array (Owner,
Admin, Reception, Staff). `Configuration.staff` is the separately linked bookable
subset, using the same identity, not another person or a User/Membership. Roles
never grant booking eligibility or production authorization. Turning booking off
removes eligibility; turning it back on requires explicit service reassignment.
Removing a person never deletes appointments or busy instants. New optional people
get fresh IDs; deleted IDs are not recycled. Editing names preserves staff order.

Timezone selection is a filtered native select with friendly city/IANA labels.
The client offers its configured zone explicitly after mount; it never overwrites
the visitor's choice or requests location. Supported aliases resolve through Intl.
Missing supportedValuesOf falls back to a small validated choice list; missing
timezone support blocks setup safely. Initial rendering has no device/time-dependent
markup. Current-time and selected-diary-date reference offsets are calculated for
their respective instants; they are not fixed business offsets.

`diaryBlocks` projects the session into appointment, buffer, external busy and
closed intervals. It is not an availability engine. Half-open boundaries and
separate overlap columns preserve actual block positions; conflicts with busy or
closed time are labelled. Snapshots and a compact exception overlay keep
removed/non-bookable people out of provider lanes without losing their bookings.
Cancellation remains accessible while configuration is invalid. Disconnect also
remains available so invalid edits cannot trap a simulated connection.

Day and Agenda share the simulator's `diaryDate`; a booking selects its own date.
The revised Day board projects the selected working span into remaining viewport
height, independently of the start interval. Details open contextually; small
blocks remain in exact-item count overlays. On mobile a person selector keeps one
lane visible, and Agenda remains an explicit alternative. The existing reception component supplies the Agenda appointment
table with an optional controlled date; its VVB defaults remain unchanged.

Accent tokens affect setup/view selection, the preview stripe and booking icons.
Foregrounds are derived for contrast. Buffer, busy, closed and warning colours
retain their semantic meanings. Theme cannot affect scheduling. Both colours,
roles and bookability are included in the original immutable baseline and all
existing reset/expiry/logo ownership rules still apply.

### Refinement acceptance checklist

Automated code/render checks cover all previous tests plus three-person setup,
multi-role owner identity, non-bookable exclusion, snapshot/capacity retention,
timezone aliases/fallback/seasonal offsets/locks, diary geometry and conflict
columns, closed-time edits, cancellation/disconnect separation, shared dates,
midnight boundaries, accent safety and expanded lifecycle restoration.

Manual browser acceptance remains **pending**; no browser controls were retried.
At desktop, tablet and mobile widths:

- [ ] Enter three fictional people: a bookable Owner, a bookable Staff person and
  a non-bookable Reception person. Check eligibility, no-preference assignment and
  provider lanes. Remove/re-add a slot; no names should be invented.
- [ ] Filter timezones with keyboard/touch. Check the browser suggestion does not
  change your explicit choice, and current/selected-date offsets are understandable.
  Verify both appointments and busy periods independently lock timezone editing.
- [ ] Book with a buffer. Verify Day geometry and Agenda details, shared simulator
  date, mobile readability and keyboard access to short blocks/cancellation.
- [ ] Overlay simulated busy time on the appointment and buffer. Conflicts remain
  visible side by side. Cancel and disconnect separately; check availability.
- [ ] Rename/remove/make the booked person non-bookable, or shorten hours. Verify
  original snapshot details remain visible and cancellable. Re-enable booking and
  service eligibility: the original protected interval must still be unavailable.
- [ ] Try very light/dark accent and primary colours. Check previews, selected
  states, focus visibility and unchanged semantic colours in both reception views.
- [ ] Restore baseline, then hard-reset/expire: check people, roles, bookability,
  both colours, logo cleanup and diary/calendar state. Repeat the earlier lifecycle
  checklist and unchanged VVB routes; inspect the browser console.

Known limits: one simulated external busy interval, shared hours, no overnight
services, no drag/drop, no real calendar, and deliberately unavailable ambiguous
booking times. The working-span board is a wall-clock projection, not a DST transition
editor. It does not assert that empty space is bookable. Dense or very short blocks use compact summaries and exact-detail overlays;
Agenda remains available. Fit-to-screen acceptance requires browser evidence.


## Flexible scheduling and reception redesign (comment 6771026976)

### Scheduling and canonical reconciliation

Re-read Master Product Ledger sections 13.7, 13.10, 13.11, 13.21 and 17.5.
The ledger separates start intervals, duration/buffer occupancy and visual density;
no superseding grid-origin rule was found. This bounded slice uses each continuous
opening + n * interval, as explicitly requested. The UI rejects overlapping
periods; adjacent periods are merged for evaluation because there is no closed
interval between them. Public booking and reception both call `PlaygroundSession`
and its existing shared `availableSlots` calculation. No second booking engine.

`hours` explicitly contains seven Sunday-first arrays. Empty means closed. Periods
have whole-minute endpoints in [0,1440], with opening before closing; overnight
periods are unsupported. Copy-to-selected-days deep-copies periods. Start interval
presets are 5/10/15/20/30/60 with custom integers 1-1440. Each complete service plus
buffer must fit one uninterrupted window. A short/closed day (even an entirely
closed week) yields no starts, without invalidating other configuration. Hours,
interval, address and selected locality belong to the immutable tutorial baseline.
Snapshots and absolute occupied instants are never rewritten after configuration
changes. Per-person/date-specific overrides remain outside this slice.

### Offline locality boundary and sources

`LocalityProvider` isolates catalogue search/selected-identity resolution from
`selectLocality`; the primary address/locality text remains local and is never
submitted or parsed as a verified address. Selecting a known result applies its
timezone when no manual override exists. Manual selection is collapsed by default;
explicit overrides (including older values without provenance) remain unchanged.
Timezone provenance is memory-only configuration and is included in baseline reset. The session's appointment/busy lock applies equally to recommendations.
Unknown/ambiguous searches require selection/manual timezone, never a guessed match.
A future authorized geocoding adapter may supply selected-place identities through
this boundary; async transport, credentials, consent and lifecycle cancellation
would need their own reviewed implementation. No real provider is implemented.

Bounded catalogue, verified 2026-11-10, names/country/ZA search only:

- [Pretoria](https://www.geonames.org/964137/pretoria.html)
- [Johannesburg](https://www.geonames.org/993800/johannesburg.html)
- [Cape Town](https://www.geonames.org/3369157/cape-town.html)
- [Durban](https://www.geonames.org/1007311/durban.html)

All four source records identify Africa/Johannesburg. Data attribution:
[GeoNames, CC BY 4.0](https://www.geonames.org/about.html). This is not a global
locality database or street-address verification service. Browser timezone remains
an unrelated explicit suggestion. No geolocation, keys or remote address requests.
[Google Geocoding](https://developers.google.com/maps/documentation/geocoding/usage-and-billing)
and [Time Zone API](https://developers.google.com/maps/documentation/timezone/get-started)
require billing; a free cap would not establish a no-billing implementation.

### Reception interaction and containment

The Day board derives its span from the first opening to last closing and shows
internal breaks. Its proportional geometry fills the remaining viewport; sparse
adaptive ticks do not depend on start-grid precision. There is no minute-sized
fixed height or vertically scrollable Day timeline. Closed days have a compact
state. Desktop shows bookable people; narrow screens select one person. Agenda
keeps the shared reception table in embedded mode (without duplicate workspace
sidebar) and exposes the same composer. VVB uses the unchanged default layout.

Appointments retain service/visitor/status/time information at ordinary densities.
Very short or dense items retain exact temporal strips, accessible names and a
per-person occupied-item count opening exact details. Conflicts stay side by side;
out-of-hours/removed-person items have a compact exception count and overlay,
including on a closed day. There is no permanent detail list beneath Day and no
fragment-navigation jump. Arbitrary density cannot guarantee every label fits.

New booking and unoccupied-gap buttons open `ReceptionComposer` on the current
person/date/candidate, not a public-page redirect. Gaps are candidates only. Service
eligibility and current starts come from `session.slots`; commit uses `session.book`
with all existing rules. A `ReceptionDraft` rejects a second successful submission,
expired/reset sessions and changed configuration. Occupancy/busy/notice changes
are revalidated at submission. Configuration changes request a fresh composer;
there is no automatic privileged override. Synthetic visitor labels are generated.

Native modal dialogs provide focus containment and Escape dismissal, with focus
restored to the trigger or New booking fallback after removal. Both composer and
pinned details headers support pointer dragging and arrow-key moves above 1024px
with a fine pointer; dock-left/right/recentre/reset-position buttons do not require
dragging. Touch and tablet use a stable bottom dialog. Bounds recalculate on resize/content changes.
Mobile uses a fixed bottom dialog, with scrolling only inside long forms/details.
This is window movement, never appointment rescheduling.

Click is the default viewer-only details preference. Click/tap/Enter pins details.
Hover mode adds a 450ms delayed, read-only preview; a 250ms leave delay permits
moving into it. Focus and pointer can retain it; Escape, Dismiss or switching to
Click closes it. No booking/cancellation occurs on hover. Actions appear only in
pinned details/composer. Preview timers are disposed on unmount and date changes;
route epoch changes close dialogs/composers on soft/hard reset/expiry. Existing
logo epoch guards remain. Guidance:
[W3C content on hover or focus](https://www.w3.org/WAI/WCAG22/Understanding/content-on-hover-or-focus.html).
These are implemented behaviours, not a claim of completed browser accessibility
acceptance.

### Automated evidence and mandatory manual acceptance

New synthetic tests cover non-round openings at 09:07, split 09:07-12:07 and
13:07-17:07 periods, a short Thursday, multiple standard/custom intervals,
buffer/break/closing edges, copy isolation, Pretoria/unknown/ambiguous selection,
explicit timezone override and lock, reception stale/duplicate submissions,
notice/busy races, reset/expiry with open drafts, preview timing/disposal,
proportional projection, exceptions, bounds and dialog semantics. Prior VVB and
playground regressions remain; old fixed-pixel/permanent-list assertions now check
the deliberately changed proportional/overlay representation.

No browser automation was attempted. Unit/render tests and HTTP status checks
**cannot prove fit-to-view, drag, focus, touch, screenshots or console cleanliness**.
The following remain pending owner browser acceptance:

- [ ] At **1366x768** and **1440x900** CSS pixels, default zoom, capture Day screenshots
  including essential toolbar, first/last tick and bottom screen edge. With three
  fictional people and ordinary 30-60 minute appointments, verify the whole working
  day is visible without vertical timeline scrolling. Record actual viewport and
  zoom; do not infer it from screenshot resolution alone.
- [ ] At **390x844** and **768x1024**, capture Day and Agenda. Select each person;
  verify whole-day access, readable summaries, no horizontal control clipping and
  stable mobile composer. Rotate/resize with composer open.
- [ ] Use a fictional repair service, 30 minutes plus 10-minute buffer, Wednesday
  09:07-12:07 / 13:07-17:07, Thursday 10:00-10:20, interval 20. Expect Wednesday
  starts 09:07,09:27,...,11:27 then 13:07 onward; no 11:47 or 16:47; Thursday
  cannot fit the service. Try interval 7, 5 and invalid custom fractions/zero.
  Copy Wednesday to selected weekdays, then edit one copy and check independence.
- [ ] Type Pretoria and select its match; verify the timezone populates without a second confirmation.
  Choose another timezone manually, change city/address and verify it is preserved.
  Test unknown/country-only searches and direct fallback. Book or connect busy time
  and verify neither a recommendation nor address edit bypasses the timezone lock.
- [ ] Create from New booking and a free gap; check prefills, eligible services,
  unavailable candidates and immediate Day/Agenda/public changes. Repeat submit;
  only one appointment may exist. Change configuration/busy/notice while a draft
  is pending in a controlled synthetic test and verify safe rejection/revalidation.
- [ ] Shorten hours, close the day, remove/make a booked person non-bookable. Open
  Exceptions and verify original service, visitor, time and buffer remain. Cancel
  explicitly. Overlay busy time on an appointment/buffer and inspect all conflicts.
- [ ] Add dense/5-minute items. Check exact counts, temporal positions and complete
  overlay details. Empty space must never imply service-specific availability.
- [ ] Default Click: hover does nothing; click/tap/Enter pins details. Select Hover:
  wait for read-only preview, move into it, focus it, Escape/dismiss it and pin it.
  Verify no mutation or modal opens merely by hovering. Check keyboard focus
  restoration after close, cancellation and disappearing trigger.
- [ ] Drag composer by its header to each edge; resize; use arrow keys and all
  non-drag positioning controls. Mobile must not require dragging. Confirm native
  dialog focus containment and Escape dismissal.
- [ ] Restore baseline and hard-reset/expire while a draft/delayed preview is pending
  in a controlled synthetic test. No stale booking or popup may survive. Check
  original hours/location/roles/colours/logo restoration and late image cleanup.
- [ ] Recheck unchanged VVB routes, keyboard navigation, contrast and browser console.

Screenshots and measured layout evidence are pending; this revision does not
claim visual acceptance. No hosted change, merge, deployment or paid resource.


## Owner polish pass: locality, Day and dialog movement (11 November 2026)

- Primary location field: **Business address, city or locality**. Matching offline
  results are labelled buttons. Only selection applies the recommendation; typing
  alone never infers an arbitrary address. **Change manually** is collapsed, and
  returning to the locality suggestion requires an explicit action after override.
- Day keeps proportional working-span geometry and the shared adapter. Each person
  has a distinct teal/blue/rose family, labelled independently of colour. Scheduled
  cards use tinted surfaces, a strong leading edge and subtle elevation; buffers
  use the same family with softer dashed styling. Busy stays violet/double-bordered.
  Red stripes, an inset red edge and CONFLICT labels distinguish clashes even in
  tiny strips. Free regions have dashed boundaries and explicit New booking actions.
- Dialog correction: pinned details previously did not enable movement. Both pinned
  details and composer now enable it. Native inset constraints are explicitly reset;
  desktop left/top are authoritative. Pointer identity, offset, cancellation and
  lost-capture cleanup are explicit. Resize stops an active drag and clamps position.
  No assertion is made that this alone explains every owner-observed browser issue.
- No availability, adapter, persistence or VVB route changes. No new dependencies.

Validation: typecheck, lint, 187 tests in nine files and build passed before final
review. Tests exercise suggestion/override/lock states, pointer deltas and bounds,
release/cancellation state, movement controls and conflict presentation semantics.
These are code/SSR results, not browser interaction or visual-fit evidence.

### Focused owner acceptance (pending; browser controls not retried)

- [ ] At 1366x768 and 1440x900, type Pretoria, select the result and verify automatic
  Africa/Johannesburg. Change manually to another zone; choose another locality and
  confirm the override stays. Unknown addresses show fallback, not verification.
- [ ] Populate three fictional people and bookings. Check all working hours remain
  visible, service/time/visitor/status readability, lane identity, softer buffers,
  distinct busy periods and obvious red-striped overlaps. Inspect tiny/dense items
  through counts/details; they must never disappear. Capture screenshots.
- [ ] Click free time and complete a booking; confirm immediate Day/Agenda/public
  availability updates. Check retained/out-of-hours exceptions and closed days.
- [ ] Drag both the composer and pinned-details header on desktop, including text
  within the header. Verify visible movement, edges clamped, no movement after
  release, close-button behaviour, arrow keys, dock/recentre/reset, resize and Escape.
- [ ] At tablet 768x1024 and mobile 390x844, verify the dialog stays fixed while
  forms scroll; no drag is required. Check focus return and click/hover details.
- [ ] Reset or expire with a popup open; confirm closure and stale submission denial.
  Recheck both VVB demo routes, keyboard access and browser console.

Manual dragging, responsive screenshots, readable board density and console checks
remain **NOT VERIFIED**. Do not equate the automated results with visual acceptance.
