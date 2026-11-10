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
eligibility, common operating hours and validated branding. Nothing assigns a
business, service or staff identity for the visitor. The five steps collect those
names and require explicit eligibility. Scheduling defaults are visible and
editable where scoped: 15-minute grid, two-hour notice and fourteen-day horizon.

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
- Shared staff operating hours, same-day windows; no overnight hours or resource
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
closed time are labelled. Snapshots and a separate retained-bookings section keep
removed/non-bookable people out of provider lanes without losing their bookings.
Cancellation remains accessible while configuration is invalid. Disconnect also
remains available so invalid edits cannot trap a simulated connection.

Day and Agenda share the simulator's `diaryDate`; a booking selects its own date.
The Day grid uses one pixel per wall-clock minute for a full local day. Short
blocks link to complete keyboard-focusable details. On mobile the readable agenda
replaces the grid. The existing reception component supplies the Agenda appointment
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
booking times. The full-day diary is a wall-clock projection, not a DST transition
editor. It does not assert that empty space is bookable. Small grid labels may be
clipped; complete details and the mobile agenda are always available below.
