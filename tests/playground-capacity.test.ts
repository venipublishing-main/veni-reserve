import { describe, expect, it } from "vitest";
import { createElement } from "react";
import { renderToStaticMarkup } from "react-dom/server";
import { MemoryRouter } from "react-router";
import { PlaygroundSession, emptyConfiguration, configurationErrors, editPerson, SESSION_POLICY } from "../app/features/playground/session";
import { canOverrideBuffer, personColour, personEmail, staffTheme } from "../app/features/playground/personnel";
import { capacityRows, capacitySummary, capacityPage, groupCapacityRows, rowAvailability, availablePeople } from "../app/features/playground/capacity";
import { ReceptionDraft } from "../app/features/playground/reception-state";
import { diaryBlocks } from "../app/features/playground/diary-projection";
import { ReceptionComposer } from "../app/features/playground/reception-composer";
import { PlaygroundDiary } from "../app/features/playground/diary";
const now = Date.parse("2026-11-10T06:00:00Z"), date = "2026-11-11";
function fixture() {
  let c = emptyConfiguration(); c.business = { name: "Synthetic studio", category: "", timezone: "Africa/Johannesburg" };
  c.people = [{ id: "staff-1", name: "Synthetic one", roles: ["Staff"] }, { id: "staff-2", name: "Synthetic two", roles: ["Staff"] }, { id: "operator", name: "Synthetic reception", roles: ["Reception"] }];
  c = editPerson(c, c.people[0], true); c = editPerson(c, c.people[1], true);
  c.services[0] = { ...c.services[0], name: "Synthetic consultation", durationMinutes: 15, bufferAfterMinutes: 30, eligibleStaffIds: ["staff-1", "staff-2"] };
  return c;
}
function active(clock = () => now) { const s = new PlaygroundSession(clock); s.update(fixture()); expect(s.complete()).toEqual([]); return s; }
function booked() { const s = active(); expect(s.book(date, "service-1", 540, "staff-1")).toBeNull(); return s; }
const pick = { date, serviceId: "service-1", staffId: "staff-1", minute: 555 };
const render = (e: ReturnType<typeof createElement>) => renderToStaticMarkup(createElement(MemoryRouter, null, e));

describe("central capacity projection", () => {
  it("has one exact time row and one capacity position per bookable practitioner", () => {
    const s = active(), rows = capacityRows(s, s.getSnapshot(), date);
    expect(rows).toHaveLength(32); expect(rows[0].start).toBe(540); expect(rows[0].cells.map(c => c.staffId)).toEqual(["staff-1", "staff-2"]);
    expect(rows[0].cells.every(c => c.available && c.status === "Available")).toBe(true);
    expect(rows.at(-1)!.cells.every(c => !c.available && c.status === "Blocked")).toBe(true);
    const html = render(createElement(PlaygroundDiary, { session: s, today: date }));
    expect(html).toContain("Central day capacity slab"); expect(html).toContain('data-state="Available"'); expect(html).not.toContain('data-staff="operator"');
    expect(html).not.toContain('aria-label="Synthetic one time tiles"');
  });
  it("reduces free cells as bookings fill the row, without counting services as capacity", () => {
    const s = booked(); let row = capacityRows(s, s.getSnapshot(), date)[0]; expect(row.cells.map(c => c.status)).toEqual(["Booked", "Available"]);
    s.book(date, "service-1", 540, "staff-2"); row = capacityRows(s, s.getSnapshot(), date)[0]; expect(row.cells.every(c => !c.available)).toBe(true);
    expect(capacitySummary([row]).bookings).toBe(2);
  });
  it("shows buffers, busy and exact conflicts distinctly while deduplicating long booking identity", () => {
    const s = booked(); let rows = capacityRows(s, s.getSnapshot(), date);
    expect(rows[1].cells[0].status).toBe("Buffer"); expect(rows[2].cells[0].status).toBe("Buffer"); expect(capacitySummary(rows).bookings).toBe(1);
    s.connectBusy(date, "staff-1", 570, 30); rows = capacityRows(s, s.getSnapshot(), date);
    expect(rows[1].cells[0].status).toBe("Buffer"); expect(rows[2].cells[0].status).toBe("CONFLICT"); expect(rows[3].cells[0].status).toBe("Busy");
  });
  it("never marks a start white merely because it is empty, including service eligibility", () => {
    const s = active(), c = structuredClone(s.getSnapshot().config); c.services[0].eligibleStaffIds = ["staff-1"]; s.update(c);
    const rows = capacityRows(s, s.getSnapshot(), date, "service-1"); expect(rows.every(r => r.cells[1].status === "Blocked")).toBe(true);
    expect(rows.filter(r => r.cells[0].available).map(r => r.start)).toEqual(s.slots(date, "service-1", "staff-1").map(t => t.startMinute));
  });
  it("preserves exact partial occupancy and valid short-start totals without painting it empty", () => {
    const s = active(), c = structuredClone(s.getSnapshot().config); c.startInterval = 5; c.services[0].durationMinutes = 5; c.services[0].bufferAfterMinutes = 0; s.update(c);
    s.book(date, "service-1", 550, "staff-1"); c.startInterval = 15; s.update(c);
    const cell = capacityRows(s, s.getSnapshot(), date)[0].cells[0]; expect(cell.available).toBe(true); expect(cell.status).toBe("Booked"); expect(cell.tile.conflict).toBe(false);
  });
  it("groups time and pages larger teams losslessly with overall capacity totals", () => {
    const s = active(), state = structuredClone(s.getSnapshot());
    state.config.staff = Array.from({ length: 17 }, (_, i) => ({ ...state.config.staff[0], id: `test-${i}` }));
    const provider = { slots: (_date: string, _service: string, id: string) => [{ startMinute: 540, staffId: id }] };
    const rows = capacityRows(provider, state, date), groups = groupCapacityRows(rows, 7);
    expect(rows[0].cells).toHaveLength(17); expect(capacitySummary([rows[0]]).available).toBe(17); expect(groups.flat()).toEqual(rows);
    const pages = [0,1,2].map(i => capacityPage(state.config.staff, i, 6)); expect(pages.flatMap(p => p.items)).toEqual(state.config.staff);
    expect(capacityPage(state.config.staff, 99, 6).index).toBe(2);
  });
});

describe("soft buffer override remains separate from public booking", () => {
  it("public slots/book never override, while a practitioner can override their own buffer", () => {
    const s = booked(), ids = s.bufferTouches(date, "service-1", 555, "staff-1");
    expect(s.slots(date, "service-1", "staff-1").some(t => t.startMinute === 555)).toBe(false);
    expect(s.book(date, "service-1", 555, "staff-1")).toContain("no longer");
    expect(s.receptionSlots(date, "service-1", "staff-1", "staff-1").some(t => t.startMinute === 555)).toBe(true);
    expect(s.receptionBook(date, "service-1", 555, "staff-1", "staff-1", ids)).toBeNull();
    expect(s.getSnapshot().appointments[1].bufferOverride).toEqual({ actorId: "staff-1", appointmentIds: ids });
    expect(s.getSnapshot().appointments[0].bufferAfterMinutes).toBe(30);
    expect(diaryBlocks(s.getSnapshot(), date).filter(b => b.kind !== "closed").some(b => b.conflict)).toBe(false);
    expect(s.slots(date, "service-1", "staff-1").some(t => t.startMinute === 570)).toBe(false);
  });
  it("denies practitioner overrides for another person and unknown/public actors", () => {
    const s = booked(), ids = s.bufferTouches(date, "service-1", 555, "staff-1");
    for (const actor of ["staff-2", "unknown", ""]) {
      expect(canOverrideBuffer(s.getSnapshot().config, actor, "staff-1")).toBe(false);
      expect(s.receptionBook(date, "service-1", 555, "staff-1", actor, ids)).toContain("cannot override");
    }
    expect(s.getSnapshot().appointments).toHaveLength(1);
  });
  it.each(["Reception", "Admin", "Owner"] as const)("permits %s to confirm another practitioner's soft buffer", role => {
    const s = booked(), c = structuredClone(s.getSnapshot().config); c.people[2].roles = [role]; s.update(c);
    expect(s.receptionBook(date, "service-1", 555, "staff-1", "operator", s.bufferTouches(date, "service-1", 555, "staff-1"))).toBeNull();
  });
  it("requires exact current buffer confirmation and rejects stale identities", () => {
    const s = booked(); expect(s.receptionBook(date, "service-1", 555, "staff-1", "operator", [])).toContain("confirmation");
    expect(s.receptionBook(date, "service-1", 555, "staff-1", "operator", ["other"])).toContain("confirmation");
    const ids = s.bufferTouches(date, "service-1", 555, "staff-1"); s.cancel(ids[0]);
    expect(s.receptionBook(date, "service-1", 555, "staff-1", "operator", ids)).toContain("confirmation");
  });
  it("never overrides hard service time or external busy, including a race after confirmation", () => {
    const s = booked(); expect(s.receptionSlots(date, "service-1", "staff-1", "operator").some(t => t.startMinute === 540)).toBe(false);
    const ids = s.bufferTouches(date, "service-1", 555, "staff-1"); s.connectBusy(date, "staff-1", 570, 15);
    expect(s.receptionBook(date, "service-1", 555, "staff-1", "operator", ids)).toContain("no longer");
    expect(s.getSnapshot().appointments).toHaveLength(1);
  });
  it("preserves closing, breaks, notice, interval and eligibility under override", () => {
    const s = booked(), c = structuredClone(s.getSnapshot().config); c.hours[3] = [{ opens: 540, closes: 570 }, { opens: 600, closes: 630 }]; s.update(c);
    expect(s.receptionSlots(date, "service-1", "staff-1", "operator")).toEqual([]);
    expect(s.receptionSlots(date, "service-1", "staff-2", "staff-1")).toEqual(s.slots(date, "service-1", "staff-2"));
    expect(s.receptionBook(date, "service-1", 556, "staff-1", "operator", s.bufferTouches(date, "service-1", 556, "staff-1"))).toContain("no longer");
  });
  it("invalidates duplicate/configuration-stale override drafts and rechecks role changes", () => {
    const s = booked(), draft = new ReceptionDraft(s), override = { actorId: "operator", confirmedBufferIds: s.bufferTouches(date, "service-1", 555, "staff-1") };
    expect(draft.submit(pick, override)).toBeNull(); expect(draft.submit(pick, override)).toContain("already");
    const next = new ReceptionDraft(s), c = structuredClone(s.getSnapshot().config); c.people[2].roles = ["Staff"]; s.update(c);
    expect(next.submit(pick, override)).toContain("Configuration changed"); expect(s.receptionBook(date, "service-1", 555, "staff-1", "operator", override.confirmedBufferIds)).toContain("cannot override");
  });
  it("renders the warning and specific confirmation for an operator buffer booking", () => {
    const s = booked(); const html = render(createElement(ReceptionComposer, { session: s, seed: { ...pick, actorId: "operator", override: true }, onClose: () => {}, returnFocus: null }));
    expect(html).toContain("protected recovery time"); expect(html).toContain("confirm this specific simulated buffer override"); expect(html).toContain('disabled="" type="submit"');
  });
  it.each(["soft", "hard", "expiry"])("invalidates override drafts on %s and clears recorded overrides", reset => {
    let time = now; const s = active(() => time); s.book(date, "service-1", 540, "staff-1"); const draft = new ReceptionDraft(s), ids = s.bufferTouches(date, "service-1", 555, "staff-1");
    if (reset === "soft") s.softReset(); else if (reset === "hard") s.hardReset(); else { time += SESSION_POLICY.inactivityMs; s.checkExpiry(); }
    expect(draft.submit(pick, { actorId: "operator", confirmedBufferIds: ids })).toContain("expired"); expect(s.getSnapshot().appointments).toEqual([]);
  });
});

describe("person colours and reserved dummy emails", () => {
  it("resolves stable defaults, distinct initial people colours, and editable colours with readable buffer tint", () => {
    const c = fixture(); expect(personColour(c.people[0])).not.toBe(personColour(c.people[1]));
    c.people[0].colour = "#ffffff"; const theme = staffTheme(c, "staff-1") as Record<string, string>;
    expect(theme["--staff-colour"]).toBe("#ffffff"); expect(theme["--staff-on-colour"]).toBe("#000000"); expect(theme["--staff-booking"]).toBe("#bfbfbf"); expect(theme["--staff-buffer"]).toBe("rgb(247 247 247)");
    c.people[0].colour = "red;url(x)"; expect(configurationErrors(c, 2)).toContain("Choose a six-digit colour for each person."); expect(personColour(c.people[0])).toMatch(/^#[0-9a-f]{6}$/);
  });
  it("generates deterministic unique example.test addresses without sending or creating accounts", () => {
    const c = fixture(); c.people[1].name = c.people[0].name;
    expect(personEmail(c.people[0])).toMatch(/^synthetic-one-[a-z0-9]+@example\.test$/);
    expect(personEmail(c.people[0])).not.toBe(personEmail(c.people[1])); expect(personEmail(c.people[0])).toBe(personEmail(c.people[0]));
    c.people[0].email = "chosen@example.test"; expect(personEmail(c.people[0])).toBe("chosen@example.test");
    c.people[0].email = "bad\n@example.test"; expect(configurationErrors(c, 2).length).toBeGreaterThan(0);
  });
  it("restores original colours/emails on soft reset and clears them on hard reset", () => {
    const c = fixture(); c.people[0].colour = "#123456"; c.people[0].email = "original@example.test";
    const s = new PlaygroundSession(() => now); s.update(c); s.complete(); const next = structuredClone(c); next.people[0].colour = "#abcdef"; next.people[0].email = "changed@example.test"; s.update(next);
    s.softReset(); expect(s.getSnapshot().config.people[0]).toEqual(c.people[0]);
    s.hardReset(); expect(s.getSnapshot().config.people[0].email).toBeUndefined(); expect(s.getSnapshot().config.people[0].name).toBe("");
  });
});

it("enforces notice, horizon and service eligibility even for an elevated simulated operator", () => {
  const s = active(() => Date.parse("2026-11-11T08:00:00Z"));
  expect(s.receptionSlots(date, "service-1", "staff-1", "operator").every(t => t.startMinute >= 720)).toBe(true);
  expect(s.receptionSlots("2026-12-02", "service-1", "staff-1", "operator")).toEqual([]);
  const c = structuredClone(s.getSnapshot().config); c.services[0].eligibleStaffIds = ["staff-2"]; s.update(c);
  expect(s.receptionSlots(date, "service-1", "staff-1", "operator")).toEqual([]);
});

describe("owner sketch: one shared white cell", () => {
  const firstRow = (s: PlaygroundSession) => render(createElement(PlaygroundDiary, { session: s, today: date })).split('data-time="540"')[1].split('data-time="555"')[0];
  it("renders one white time-labelled cell for two available practitioners, not two positions", () => {
    const s = active(), row = capacityRows(s, s.getSnapshot(), date)[0], html = firstRow(s);
    expect(rowAvailability(row).choices).toHaveLength(2);
    expect(html.match(/data-aggregate="true"/g)).toHaveLength(1); expect(html).toContain('<time>09:00</time>');
    expect(html).not.toContain('data-staff=');
  });
  it("keeps one white cell beside an individual booked cell, then removes white when all are unavailable", () => {
    const s = booked(); let html = firstRow(s);
    expect(html.match(/data-aggregate="true"/g)).toHaveLength(1); expect(render(createElement(PlaygroundDiary, { session: s, today: date }))).toContain('data-staff="staff-1"');
    expect(html.match(/<time>09:00<\/time>/g)).toHaveLength(1);
    s.book(date, "service-1", 540, "staff-2"); html = firstRow(s);
    expect(html).not.toContain('data-aggregate="true"'); expect(html).toContain('data-state="Blocked"'); const full = render(createElement(PlaygroundDiary, { session: s, today: date })); expect(full).toContain('data-staff="staff-1"'); expect(full).toContain('data-staff="staff-2"');
  });
  it("keeps protected buffers occupied and never counts operational override as white availability", () => {
    const s = booked(); s.book(date, "service-1", 540, "staff-2"); const row = capacityRows(s, s.getSnapshot(), date)[1];
    expect(rowAvailability(row).available).toBe(false); expect(rowAvailability(row).occupied.map(c => c.status)).toEqual(["Buffer", "Buffer"]);
    expect(s.receptionSlots(date, "service-1", "staff-1", "operator").some(t => t.startMinute === row.start)).toBe(true);
  });
  it("uses all people for availability regardless of which occupied people page is visible", () => {
    const s = active(), state = structuredClone(s.getSnapshot()); state.config.staff = Array.from({ length: 17 }, (_, i) => ({ ...state.config.staff[0], id: `person-${i}` }));
    const provider = { slots: (_date: string, _service: string, id: string) => id === "person-16" ? [{ startMinute: 540, staffId: id }] : [] };
    const row = capacityRows(provider, state, date)[0];
    expect(capacityPage(state.config.staff, 0, 3).items.some(p => p.id === "person-16")).toBe(false);
    expect(rowAvailability(row).choices.map(c => c.staffId)).toEqual(["person-16"]); expect(rowAvailability(row).available).toBe(true);
  });
  it("offers only eligible currently available practitioners for the selected start and service", () => {
    const s = booked(); expect(availablePeople(s, s.getSnapshot(), date, "service-1", 540).map(p => p.id)).toEqual(["staff-2"]);
    const c = structuredClone(s.getSnapshot().config); c.services[0].eligibleStaffIds = ["staff-1"]; s.update(c);
    expect(availablePeople(s, s.getSnapshot(), date, "service-1", 540)).toEqual([]);
    expect(rowAvailability(capacityRows(s, s.getSnapshot(), date, "service-1")[0]).available).toBe(false);
  });
  it("seeds the strict aggregate composer at the requested time and does not offer occupied practitioners", () => {
    const s = booked(); const html = render(createElement(ReceptionComposer, { session: s, seed: { date, minute: 540, staffId: "staff-2", serviceId: "service-1", actorId: "operator", aggregateAvailability: true }, returnFocus: null, onClose: () => {} }));
    expect(html).toContain('value="540" selected'); expect(html).toContain('value="staff-2" selected');
    expect(html).not.toContain('<option value="staff-1"'); expect(html).not.toContain("Consider soft-buffer override");
    expect(html).toContain("Only practitioners available");
  });
  it("rejects a white-cell selection that becomes occupied before submission", () => {
    const s = active(), draft = new ReceptionDraft(s), row = rowAvailability(capacityRows(s, s.getSnapshot(), date)[0]);
    const chosen = row.choices[0]; s.book(date, chosen.serviceId!, 540, chosen.staffId);
    expect(draft.submit({ date, serviceId: chosen.serviceId!, minute: 540, staffId: chosen.staffId })).toContain("no longer");
    expect(availablePeople(s, s.getSnapshot(), date, chosen.serviceId!, 540).map(p => p.id)).not.toContain(chosen.staffId);
  });
  it("retains a valid short start in the white choice while showing exact partial occupancy separately", () => {
    const s = active(), c = structuredClone(s.getSnapshot().config); c.startInterval = 5; c.services[0].durationMinutes = 5; c.services[0].bufferAfterMinutes = 0; s.update(c);
    s.book(date, "service-1", 550, "staff-1"); c.startInterval = 15; s.update(c);
    const row = rowAvailability(capacityRows(s, s.getSnapshot(), date)[0]);
    expect(row.available).toBe(true); expect(row.occupied).toHaveLength(1); expect(row.occupied[0].tile.conflict).toBe(false);
    expect(row.choices.map(c => c.staffId)).toContain("staff-1");
  });
});
