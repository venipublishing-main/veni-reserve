import { describe, expect, it } from "vitest";
import { createElement } from "react";
import { renderToStaticMarkup } from "react-dom/server";
import { MemoryRouter } from "react-router";
import { PlaygroundSession, emptyConfiguration, configurationErrors, SESSION_POLICY } from "../app/features/playground/session";
import { locationLabel, locationSummary } from "../app/features/playground/location-label";
import { ConfigurationEditor } from "../app/features/playground/setup";
import { timeTiles, tileStatus, tileAction, bookingCount, groupTimeTiles } from "../app/features/playground/time-tiles";
import { exceptionBlocks } from "../app/features/playground/diary-projection";
import { ReceptionDraft } from "../app/features/playground/reception-state";
import { ReceptionComposer } from "../app/features/playground/reception-composer";
import { PlaygroundDiary } from "../app/features/playground/diary";

const date = "2026-11-11", now = Date.parse("2026-11-10T06:00:00Z");
function fixture() {
  const c = emptyConfiguration(); c.business = { name: "Synthetic studio", category: "", timezone: "Africa/Johannesburg", timezoneSource: "locality" };
  c.location.localityId = "964137";
  c.people[0] = { id: "staff-1", name: "Synthetic owner", roles: ["Owner"] }; c.staff[0].name = "Synthetic owner";
  c.services[0] = { ...c.services[0], name: "Synthetic consultation", durationMinutes: 30, bufferAfterMinutes: 10, eligibleStaffIds: ["staff-1"] };
  c.hours[3] = [{ opens: 547, closes: 727 }, { opens: 787, closes: 1027 }]; c.startInterval = 20; return c;
}
function active(clock = () => now, c = fixture()) { const s = new PlaygroundSession(clock); s.update(c); expect(s.complete()).toEqual([]); return s; }
const tiles = (s: PlaygroundSession, service?: string) => timeTiles(s.getSnapshot(), date, "staff-1", service ? s.slots(date, service, "staff-1") : undefined);
const render = (e: ReturnType<typeof createElement>) => renderToStaticMarkup(createElement(MemoryRouter, null, e));

describe("optional single-site branch label", () => {
  it("completes setup with no branch while retaining location identity and eligibility", () => {
    const s = active(), c = s.getSnapshot().config;
    expect(c.location.name).toBe(""); expect(c.location.id).toBe("location-1");
    expect(c.services[0].locationIds).toEqual([c.location.id]); expect(c.staff[0].locationIds).toEqual([c.location.id]);
    expect(locationLabel(c)).toBe("Synthetic studio"); expect(locationSummary(c)).toBe("");
    expect(s.book(date, "service-1", 547, "staff-1")).toBeNull(); expect(s.getSnapshot().appointments[0].locationId).toBe(c.location.id);
  });
  it("derives fallback after business edits without overwriting an explicit label", () => {
    const c = fixture(); c.business.name = "Renamed synthetic studio"; expect(locationLabel(c)).toBe(c.business.name); expect(c.location.name).toBe("");
    c.location.name = "Hatfield branch"; c.business.name = "Another synthetic studio";
    expect(locationLabel(c)).toBe("Hatfield branch"); expect(locationSummary(c)).toBe("Hatfield branch");
    c.location.name = c.business.name; expect(locationSummary(c)).toBe("");
  });
  it("validates optional labels and safely resolves incomplete configuration", () => {
    const c = fixture(); c.location.name = "<unsafe>"; expect(configurationErrors(c, 0)).not.toEqual([]);
    c.location.name = ""; c.business.name = "<Synthetic>\u202etest"; expect(locationLabel(c)).toBe("Synthetictest");
    c.business.name = ""; expect(locationLabel(c)).toBe("Business venue");
  });
  it.each(["", "Main practice"])("preserves original explicit/fallback distinction on reset: %s", branch => {
    const c = fixture(); c.location.name = branch; const s = active(() => now, c), changed = structuredClone(c);
    changed.location.name = "Changed branch"; changed.business.name = "Changed studio"; s.update(changed); s.softReset();
    expect(s.getSnapshot().config.location.name).toBe(branch); expect(s.getSnapshot().config.business).toEqual(c.business);
    s.hardReset(); expect(s.getSnapshot().config.location.name).toBe(""); expect(s.getSnapshot().config.business.timezone).toBe("");
  });
  it("renders optional branch examples in a closed disclosure", () => {
    const html = render(createElement(ConfigurationEditor, { config: fixture(), step: 0, update: () => {}, upload: async () => {} }));
    expect(html).toContain('<details><summary'); expect(html).toContain("Branch / venue name (optional)");
    expect(html).toContain("Hatfield branch"); expect(html).not.toContain("Location name");
  });
});

describe("exact occupancy tiles and shared scheduler agreement", () => {
  it("uses non-round split-period origins and clips the final partial display interval", () => {
    const c = fixture(); c.hours[3][0].closes = 730; const s = active(() => now, c), result = tiles(s);
    expect(result.filter(t => t.period === 0).map(t => t.start)).toEqual([547,567,587,607,627,647,667,687,707,727]);
    expect(result.find(t => t.start === 727)?.end).toBe(730); expect(result.find(t => t.period === 1)?.start).toBe(787);
    expect(result.some(t => t.start >= 730 && t.start < 787)).toBe(false);
  });
  it.each([1, 7, 15, 20, 60, 1440])("marks exactly adapter starts for interval %i, including notice/fit restrictions", interval => {
    const c = fixture(); c.startInterval = interval; const s = active(() => now, c);
    const expected = s.slots(date, "service-1", "staff-1").map(t => t.startMinute);
    expect(tiles(s, "service-1").filter(t => t.bookable).map(t => t.start)).toEqual(expected);
    expect(tiles(s).every(t => t.bookable === null)).toBe(true);
    expect(tiles(s).every(t => tileStatus(t) === "Choose service")).toBe(true);
  });
  it("keeps unrelated occupied bookings visible for an ineligible service filter", () => {
    const s = active(); s.book(date, "service-1", 547, "staff-1");
    const filtered = timeTiles(s.getSnapshot(), date, "staff-1", s.slots(date, "missing-service", "staff-1"));
    expect(filtered.some(t => t.bookable)).toBe(false); expect(bookingCount(filtered)).toBe(1);
    expect(tileAction(filtered[0]).kind).toBe("details");
  });
  it("projects one long booking and its buffer across tiles without duplicate identity/count", () => {
    const c = fixture(); c.services[0].durationMinutes = 65; c.services[0].bufferAfterMinutes = 15; const s = active(() => now, c);
    s.book(date, "service-1", 547, "staff-1"); const result = tiles(s), id = s.getSnapshot().appointments[0].id;
    expect(result.filter(t => t.appointmentIds.includes(id))).toHaveLength(4); expect(bookingCount(result)).toBe(1);
    for (const t of result.filter(t => t.appointmentIds.includes(id))) expect(tileAction(t)).toEqual({ kind: "details", ids: [id, `${id}-buffer`] });
    expect(result[3].blocks.map(b => [b.kind, b.start, b.end])).toEqual([["appointment",547,612],["buffer",612,627]]);
    expect(tileStatus(result[3])).toBe("Booked / Buffer"); expect(result[3].conflict).toBe(false);
  });
  it("does not create a conflict when two exact nonoverlapping appointments share a display bucket", () => {
    const c = fixture(); c.startInterval = 5; c.services[0].durationMinutes = 5; c.services[0].bufferAfterMinutes = 0;
    const s = active(() => now, c); s.book(date, "service-1", 547, "staff-1"); s.book(date, "service-1", 552, "staff-1");
    c.startInterval = 20; s.update(c); const result = tiles(s);
    expect(result[0].appointmentIds).toHaveLength(2); expect(result[0].conflict).toBe(false); expect(bookingCount(result)).toBe(2);
    expect(exceptionBlocks(s.getSnapshot(), date).map(b => b.id)).toEqual([s.getSnapshot().appointments[1].id]);
  });
  it("marks only exact overlapping parts, not every tile of a conflicted appointment", () => {
    const s = active(); s.book(date, "service-1", 547, "staff-1"); s.connectBusy(date, "staff-1", 572, 15);
    const result = tiles(s); expect(result[0].conflict).toBe(false); expect(result[1].conflict).toBe(true); expect(result[2].conflict).toBe(false);
    expect(tileStatus(result[1])).toContain("CONFLICT"); expect(tileStatus(result[1])).toContain("Busy");
  });
  it("allows a valid short start before later occupancy in the same bucket, without hiding that occupancy", () => {
    const c = fixture(); c.startInterval = 5; c.services[0].durationMinutes = 5; c.services[0].bufferAfterMinutes = 0;
    const s = active(() => now, c); s.book(date, "service-1", 557, "staff-1"); c.startInterval = 20; s.update(c);
    const first = tiles(s, "service-1")[0]; expect(first.bookable).toBe(true); expect(first.startOccupied).toBe(false);
    expect(first.blocks).toHaveLength(1); expect(tileAction(first).kind).toBe("details");
    expect(new ReceptionDraft(s).submit({ date, staffId: "staff-1", serviceId: "service-1", minute: 547 })).toBeNull();
  });
  it("uses exact instants for in-progress status and clears it at service end", () => {
    const s = active(); s.book(date, "service-1", 547, "staff-1"); const a = s.getSnapshot().appointments[0];
    expect(tileStatus(timeTiles(s.getSnapshot(), date, "staff-1", undefined, a.start + 60_000)[0])).toBe("In progress");
    expect(tileStatus(timeTiles(s.getSnapshot(), date, "staff-1", undefined, a.start + 30 * 60_000)[0])).toBe("Booked");
  });
  it("routes candidates to composer and restricted starts to no action", () => {
    const s = active(); expect(tileAction(tiles(s)[0])).toEqual({ kind: "compose", minute: 547 });
    expect(tileAction(tiles(s, "service-1").find(t => t.start === 707)!)).toEqual({ kind: "none" });
    const html = render(createElement(ReceptionComposer, { session: s, seed: { date, staffId: "staff-1", minute: 547, serviceId: "service-1" }, onClose: () => {}, returnFocus: null }));
    expect(html).toContain('value="547" selected'); expect(html).toContain('value="service-1" selected');
  });
  it("keeps retained off-grid, closed-day and removed-person bookings accessible", () => {
    const s = active(); s.book(date, "service-1", 567, "staff-1"); const a = s.getSnapshot().appointments[0], c = structuredClone(s.getSnapshot().config);
    c.startInterval = 30; s.update(c); expect(exceptionBlocks(s.getSnapshot(), date).some(b => b.appointmentId === a.id)).toBe(true);
    c.hours[3] = []; c.staff = []; s.update(c); expect(exceptionBlocks(s.getSnapshot(), date)).toHaveLength(2);
    expect(s.getSnapshot().appointments[0]).toEqual(a); expect(render(createElement(PlaygroundDiary, { session: s, today: date }))).toContain("Exceptions: 2 occupied items");
  });
  it("groups excessive density losslessly, retaining breaks, identities and conflicts", () => {
    const c = fixture(); c.startInterval = 1; const s = active(() => now, c); s.book(date, "service-1", 547, "staff-1"); s.connectBusy(date, "staff-1", 550, 15);
    const result = tiles(s), groups = groupTimeTiles(result, 12);
    expect(groups.length).toBeLessThanOrEqual(12); expect(groups.flat()).toEqual(result); expect(bookingCount(groups.flat())).toBe(1);
    expect(groups.flat().some(t => t.conflict)).toBe(true); expect(new Set(groups.flat().map(t => t.period)).size).toBe(2);
    const html = render(createElement(PlaygroundDiary, { session: s, today: date }));
    expect(html).toContain('aria-label="Time-range group"'); expect(html).toContain("CONFLICT"); expect(html).not.toContain("height:6.25%");
  });
  it.each(["soft", "hard", "expiry"])("invalidates tile-derived drafts and removes occupied projections after %s", reset => {
    let clock = now; const s = active(() => clock); const selection = { date, serviceId: "service-1", staffId: "staff-1", minute: tiles(s)[0].start };
    const draft = new ReceptionDraft(s), epoch = s.getSnapshot().epoch; draft.submit(selection);
    if (reset === "soft") s.softReset(); else if (reset === "hard") s.hardReset(); else { clock += SESSION_POLICY.inactivityMs; s.checkExpiry(); }
    expect(s.getSnapshot().epoch).toBeGreaterThan(epoch); expect(draft.submit(selection)).toContain("expired"); expect(bookingCount(tiles(s))).toBe(0);
  });
  it("updates occupancy immediately after cancellation and simulated-calendar disconnect", () => {
    const s = active(); s.book(date, "service-1", 547, "staff-1"); s.connectBusy(date, "staff-1", 607, 15);
    s.cancel(s.getSnapshot().appointments[0].id); s.disconnect(); expect(tiles(s).every(t => t.blocks.length === 0)).toBe(true);
    expect(tiles(s, "service-1").filter(t => t.bookable).map(t => t.start)).toEqual(s.slots(date, "service-1", "staff-1").map(t => t.startMinute));
  });
});

describe("tile bounds under time and period pressure", () => {
  it("does not advertise starts inside the notice period or beyond the booking horizon", () => {
    const s = active(() => Date.parse("2026-11-11T08:00:00Z"));
    const current = tiles(s, "service-1");
    expect(current.filter(t => t.start < 727).every(t => t.bookable === false)).toBe(true);
    expect(current.some(t => t.start === 787 && t.bookable)).toBe(true);
    const future = "2026-12-02";
    expect(timeTiles(s.getSnapshot(), future, "staff-1", s.slots(future, "service-1", "staff-1")).every(t => !t.bookable)).toBe(true);
  });
  it("groups many short working periods without losing any start or break identity", () => {
    const c = fixture(); c.hours[3] = Array.from({ length: 20 }, (_, i) => ({ opens: 540 + i * 10, closes: 545 + i * 10 }));
    const s = active(() => now, c), result = tiles(s), groups = groupTimeTiles(result, 32);
    expect(groups).toHaveLength(10); expect(groups.flat()).toEqual(result);
    expect(new Set(groups.flat().map(t => t.period)).size).toBe(20);
  });
});
