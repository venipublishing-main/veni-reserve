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

## Current Day: booking-style time tiles (PR comment 6788840040)

This section supersedes the proportional Day presentation and its visual
acceptance checklist above. The earlier timeline implementation notes are retained
as history; the timeline is no longer rendered. Existing modal movement, person
colours, locality automation, scheduling and memory-only session rules remain.

### Location setup

Business name and address/locality are primary. Branch / venue name is optional
inside a collapsed disclosure with Main practice / Hatfield branch examples.
An empty canonical `location.name` means fallback, not a saved inferred label.
`locationLabel` safely resolves the current business name without changing Location
ID or eligibility links. `locationSummary` omits the fallback/equal business name
where the business heading already supplies it. An explicit branch stays explicit
when the business changes. Baseline reset restores this distinction and timezone
provenance. No multiple-location behaviour or remote address lookup was added.

### Occupancy is distinct from bookability

`timeButtonClass` is extracted unchanged from customer booking; customer/VVB actions
and selection semantics remain unchanged. Day uses equal-height rounded buttons in
left-to-right wrapping grids, one person panel per desktop column and a person
selector below 768px. No vertical ruler, proportional bars or permanent details list.

`timeTiles` projects each continuous weekday window at opening + n * startInterval.
The final bucket clips to closing and never spans a break. Blocks retain their exact
half-open intervals and identities. Appointment service time, post-service buffer
and simulated busy can share a bucket without sharing actual time; that alone is
not a conflict. Conflict flags require a real overlap within the particular tile.
Long appointments cover several tiles but the panel count deduplicates appointment
IDs. Every occupied tile routes to the same exact appointment/buffer details.

Without a service selection, free tiles say Choose service. With a filter, bookable
starts come directly from `session.slots` for the selected service/person/date;
other starts say Not bookable. Existing bookings remain visible regardless of
service eligibility. For a short valid start before later occupancy in the same
bucket, details retain that occupancy and offer Check [time] start with a service.
The same composer receives the date/person/time/service and revalidates submission.
No display grouping grants capacity or changes notice, eligibility or buffer rules.

Off-grid appointment starts, out-of-hours and removed-person bookings are exposed
through the exception overlay, including closed days. In-progress labels use exact
service instants and refresh locally; they do not mutate appointment status.

### Density and interaction

The board measures its available height and panel width to bound the overview.
At excessive density (or many fragmented working periods), explicit range groups
show start/booking counts and conflict/buffer/busy indicators. Each group retains
ALL underlying exact starts in order; a movable range dialog exposes them, including
break separators. Ordinary ungrouped grids show compact break separators. Opening
an occupied item from a range closes that dialog and opens the existing details;
free starts open the existing composer. Focus returns to the range trigger.
Only overlays/Agenda scroll, not a vertical time ruler. This is an implementation
strategy, not evidence of fit or readability in an actual browser.

Date/configuration/service changes remount the range board. Session epoch changes
on reset/expiry close range/detail/composer UI and invalidate stale drafts. Hover
remains read-only; booking and cancellation require explicit actions. Existing
pointer dragging, docking, Escape and focus restoration are preserved.

### Regression evidence and replaced assertions

All original 187 tests remain, with four obsolete presentation assertions updated:

- Non-bookable-person exclusion now checks named time-tile panels instead of lanes.
- Exact occupied/buffer boundaries now check configured tile starts rather than
  proportional `top` / `height` CSS. Exact interval assertions remain unchanged.
- Busy-overlap presentation checks explicit `data-conflict` rather than old tooltip
  wording. Exact conflict/column-projection regressions remain unchanged.
- Dense coverage checks one deduplicated booking plus range/conflict labels rather
  than three separate occupied-block counts and the old lane label.

New tests cover optional branch fallback/explicit preservation, eligibility IDs,
reset provenance, split/non-round origins, partial buckets, scheduler agreement at
six intervals, notice/horizon, ineligible filters, long bookings, mixed nonoverlapping
occupancy, per-tile real conflicts, in-progress boundaries, action routing, retained
exceptions, lossless dense grouping, many short periods, cancel/disconnect and stale
reset/expiry drafts. Code/SSR tests are not browser or visual acceptance.

### Focused owner acceptance — pending

- [ ] Complete a single-site setup with only business name + locality/timezone and
  the existing service/team settings; leave branch blank. Check no duplicate name
  in booking summaries. Add Hatfield branch, rename business, then reset baseline.
- [ ] At 1366x768 and 1440x900, capture Day with three fictional bookable people,
  split hours and 20-minute starts from 09:07. Verify equal-height clickable times,
  left-to-right order, complete working-day coverage and readable labels.
- [ ] Switch service filter; compare Bookable start times with public availability.
  Book from a candidate and inspect the same appointment via all covered tiles.
  Verify exact buffer times, one appointment count and immediate cancellation updates.
- [ ] Change interval after booking. Inspect retained off-grid exceptions. Add busy
  overlap: real conflicts must be red; sequential events sharing one bucket must not.
- [ ] Set one-minute starts: open range groups and verify every exact start, break,
  booking/buffer/busy interval is accessible. Test group -> details/composer focus.
- [ ] At 390x844 and 768x1024, check person selection where shown, stable touch dialogs,
  no clipped times, keyboard navigation, hover/click details and console errors.
- [ ] Drag/dock/recentre both desktop dialogs; reset or expire with a range/composer
  open. Check stale submission rejection and both unchanged VVB demo routes.

No browser automation was retried. Screenshots, fit/readability, actual focus and
pointer interaction remain pending owner review. No visual PASS is claimed.

Local validation for this revision: pinned typecheck, lint, all 215 tests across ten files, and build PASS. GitHub CI evidence is recorded on PR #10.

## Current Day: central capacity slab (owner brief, 11 November 2026)

This replaces the practitioner-panel Day default described above. The earlier
board remains a secondary **By practitioner** view; Agenda remains the list view.
No owner sketch was included with the supplied text attachment, so this revision
implements the written time-row/capacity-cell description rather than claiming
fidelity to an unseen image.

### Architecture and truthful capacity

`capacityRows` joins the exact scheduler-derived starts into one chronological row
per configured interval and one position per bookable practitioner. The main board
is a single slab. Where width allows, the same slab folds into two chronological
columns (read down, then right); it is never separated into practitioner panels or
scaled by appointment duration. Dense rows become explicitly labelled time ranges
whose dialog contains every exact row. Closed gaps are not fabricated as capacity.

White cells require a valid shared-scheduler start for the selected service, or at
least one eligible service when unfiltered. The composer is seeded with a service
that actually fits. Grey is blocked, not available. Bookings use the person's colour,
buffers a derived lighter tint/dashed border, busy is violet, and actual conflicts
use red stripes/text. Exact mixed occupancy remains coloured even where a shorter
start can fit; its `+ start` marker/details expose that valid start and overall
capacity counts include it. No colour or bucket grouping grants booking authority.

Long bookings retain one identity/count. Exact intervals, buffers and retained
exceptions remain available. Public booking, receptionist booking and capacity
projection use the same scheduler. Previous exact-overlap regressions remain.

### Larger teams and density

Projection and paging are tested with 17 synthetic practitioners. The local setup
cap remains three people: the brief's conceptual scaling does not silently expand
that earlier scope. The slab uses bounded people pages based on available width,
with explicit page/total labels and per-row all-person free-capacity totals. Time
ranges summarize all people and disclose bookings, buffers, busy and conflicts.
No extra people's capacity is silently merged into one practitioner's cell.

Capacity panels measure available width/height to bound rows and fold into readable
chronological columns. Actual desktop/mobile readability still requires browser
acceptance. Range overlays may scroll; this is not a return to a proportional diary.

### Explicit soft-buffer override simulation

The viewer can select a **Simulated operator**, defaulting to public rules/no
override. This selects a configured local person, not a real authenticated account.
`canOverrideBuffer` reads current roles/identity: Staff can override only their own
bookable-person buffer; Reception/Admin/Owner can override another practitioner's.
Unknown/public actors cannot override. This is demonstrable local policy, not
production authorization. Production requires server-side identity/role enforcement.

A buffer cell opens existing details; an eligible operator can review an override
in the existing composer. The composer has a clear warning and a specific unchecked
confirmation for the selected person/date/time/service and exact current buffer IDs.
Changes invalidate the confirmation. Submission rechecks actor permission, current
buffers, epoch/configuration, duplicate submission and scheduler constraints.

The reception-only path can remove eligible existing soft-buffer intervals from the
occupied input passed to the shared scheduler. It never removes service time or
external busy. The candidate's own service+buffer must still fit working hours,
notice, start grid, eligibility and horizon. Public `slots`/`book` remain strict.
A confirmed booking records actor and affected buffer IDs in memory. Original buffer
snapshots are retained; approved soft overlaps are disclosed in details rather than
mislabelled as hard clashes. Closed-time/hard-service/busy conflicts remain red.
Cancellation restores the remaining original buffer protection; no hidden trimming.

### Personnel colours and emails

Every person resolves a deterministic assigned default colour; editing stores an
explicit validated hex value on the person. It remains stable across name/role edits
and is included in baseline/reset. Appointments retain a colour snapshot; active
staff cells follow current configuration. Derived foreground contrast and a light
buffer tint keep states readable. Near-white booking colours receive a darker fill
so occupied cells cannot masquerade as free white cells; the configured swatch stays.

Email is optional local text and never used for sending, sign-in, OAuth or accounts.
A blank value resolves to a deterministic name+identity-suffix `example.test` address;
the suffix distinguishes identical names. Explicit emails remain unchanged on rename.
The resolved dummy is displayed, not persisted remotely. Baseline retains explicit
versus blank input; hard reset/expiry clears entered values. Use fictional addresses.

### Regression and manual acceptance

The prior 215 tests are retained. Presentation assertions now target the central
slab and `data-staff` capacity positions instead of default practitioner-panel names;
range grouping retains an explicit accessible label. New coverage exercises white
capacity reduction, blocked eligibility, exact buffer/busy/conflict states, long
booking identity, partial valid starts, 17-person paging and lossless time grouping;
public denial, self-only practitioner override, elevated-role override, warning and
confirmation identity, stale/duplicate/reset drafts, hard-conflict races, colour
contrast/reset and safe deterministic dummy addresses.

- [ ] At 1366x768 / 1440x900, verify one central chronological slab, time shown once
  per row, compact centered capacity cells and complete day coverage. No visual PASS
  until actual screenshots/readability have been reviewed.
- [ ] Book each of two/three practitioners at the same start. White capacity must
  reduce and reach zero when no valid start remains. Verify grey near closing/notice.
- [ ] Inspect long bookings and partial buckets; count once, view exact times, check
  buffers/busy/conflicts and retained off-grid/removed-person exceptions.
- [ ] Try public rules, own Staff identity, another Staff identity, then Reception /
  Admin / Owner. Check buffer permission, explicit warning/unchecked confirmation,
  refusal of service/busy/closed conflicts, and strict public availability afterward.
- [ ] Edit staff colours (including near-white) and fictional emails; verify generated
  `example.test` fallback, colour use, soft-reset restoration and expiry/hard reset.
- [ ] Check narrow-screen capacity, explicit dense ranges, keyboard/hover details,
  movable/dockable composer, focus return, reset while open and browser console.
- [ ] Recheck optional branch/locality/timezone safeguards and both VVB demo routes.

No browser controls were retried. No hosted state, OAuth, email delivery, paid
resource, persistence, merge or deployment is introduced.

Local validation: pinned typecheck, lint, 238 tests across eleven files, and build PASS. Browser acceptance remains pending.

## Owner sketch clarification: one white availability cell (11 November 2026)

The supplied sketch and follow-up clarify the meaning of white: **at least one
practitioner is available**, not one white position per free practitioner. This
supersedes the earlier central-slab cell-count interpretation and repeated attachment's
older starting SHA. Work continues from completed commit f45a82e, preserving its
buffer policies, staff colours/emails, location setup and lifecycle safeguards.

Day is now a single centred chronological stack, without a second time column.
Times appear inside the buttons, following the sketch. Each exact row has at most
one white Available button computed across ALL practitioners. Coloured buttons
show individual occupied practitioners and buffers. The white button disappears
when the shared scheduler has no valid start for anyone. Empty restricted rows show
a neutral No valid start marker; unavailable individual empty positions are omitted.
An exact short start within a partially occupied display bucket can correctly show
both the shared white button and the coloured occupied button; interval truth wins
over whole-bucket assumptions.

Clicking white opens the existing composer with an actually valid service/person
and the selected time. Its practitioner choices are strictly filtered by service,
date and current exact availability. Changing practitioner preserves the chosen
time; changing service offers only matching available people. Stale choices are
labelled unavailable and cannot commit. This entry never offers a buffer override;
that remains the separate explicit buffer-details/warning/confirmation path.

People paging applies only to individual occupied buttons. Shared availability
always includes all people, including those on another page. Omitted occupied
buttons have a visible count/link and conflict warning, never silent disappearance.
Dense time-range overlays retain every exact row; range summaries count **available
times**, not multiple available practitioner positions. The setup cap is still three;
projection and paging retain larger-team tests.

New tests prove one white cell for several free people, one white plus an occupied
cell, no white when fully unavailable, strict buffers, availability across pages,
service/practitioner filtering, composer seed, stale-submit rejection and partial
exact starts. The prior non-bookable-person presentation assertion now checks the
shared availability affordance instead of an empty practitioner's cell. All prior
scheduling, permission, reset, colour/email and location regressions remain.

Manual review remains pending:

- [ ] Compare a short configured day with the sketch: one centred stack, time labels
  inside cells, white 09:15 beside one booking, and no white when everyone is busy.
- [ ] Open white, switch eligible practitioner/service and verify the chosen time and
  strict availability; race another booking and verify stale submission is rejected.
- [ ] Check individual buffers, busy/conflicts and existing permission/warning flows.
- [ ] Check dense groups, occupied people-page indicators, narrow-screen layout,
  keyboard focus, dragging and reset/expiry. Verify no occupancy becomes inaccessible.

No browser controls were retried; sketch alignment describes implemented structure,
not a visual-fit or browser-interaction PASS.

Validation for the sketch clarification: pinned typecheck, lint, all 246 tests across eleven files, and build PASS. Actual browser/visual acceptance remains pending.
