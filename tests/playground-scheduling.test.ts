import { describe, expect, it } from "vitest";
import { PlaygroundSession, configurationErrors, emptyConfiguration } from "../app/features/playground/session";
import { copyHours, dayPeriods, validHours } from "../app/features/playground/scheduling";
import { offlineLocalities, timezoneRecommendation } from "../app/features/playground/localities";

// Acceptance scenario exists only in tests, never prepopulates visitor input.
export function workshopFixture() {
  const c = emptyConfiguration();
  c.business = { name: "Synthetic repair workshop", category: "", timezone: "Africa/Johannesburg" };
  c.location.name = "Pretoria test room"; c.location.localityId = "964137"; c.location.address = "Fictional address";
  c.people[0] = { id: "staff-1", name: "Synthetic owner", roles: ["Owner"] };
  c.staff[0].name = "Synthetic owner";
  c.services[0] = { ...c.services[0], name: "Repair consultation", durationMinutes: 30, bufferAfterMinutes: 10, eligibleStaffIds: ["staff-1"] };
  c.hours[3] = [{ opens: 547, closes: 727 }, { opens: 787, closes: 1027 }];
  c.hours[4] = [{ opens: 600, closes: 620 }];
  c.startInterval = 20; return c;
}
const now = Date.parse("2026-11-10T06:00:00Z"), date = "2026-11-11";
export function workshopSession(clock = () => now) {
  const s = new PlaygroundSession(clock); s.update(workshopFixture()); expect(s.complete()).toEqual([]); return s;
}
describe("weekday windows and start intervals", () => {
  it.each([5, 10, 15, 20, 30, 60, 7, 1440])("aligns interval %i to non-round openings, separately per split period", interval => {
    const s = workshopSession(), c = structuredClone(s.getSnapshot().config); c.startInterval = interval; s.update(c);
    const slots = s.slots(date, "service-1", "staff-1"); expect(slots.length).toBeGreaterThan(0);
    for (const slot of slots) {
      const window = dayPeriods(c.hours, date).find(p => slot.startMinute >= p.opens && slot.startMinute + 40 <= p.closes)!;
      expect(window).toBeDefined(); expect((slot.startMinute - window.opens) % interval).toBe(0);
    }
    expect(slots.some(slot => slot.startMinute === 787)).toBe(true);
  });
  it.each([0, -1, 1.5, NaN, 1441])("rejects unsafe interval %s", value => {
    const c = workshopFixture(); c.startInterval = value; expect(configurationErrors(c, 3).length).toBeGreaterThan(0);
  });
  it("keeps short and closed days local, with no service/buffer crossing lunch or closing", () => {
    const s = workshopSession(); expect(s.slots("2026-11-12", "service-1", "staff-1")).toEqual([]);
    expect(s.slots("2026-11-15", "service-1", "staff-1")).toEqual([]);
    expect(s.slots(date, "service-1", "staff-1").map(slot => slot.startMinute)).toContain(687);
    expect(s.book(date, "service-1", 707, "staff-1")).toContain("no longer");
    expect(s.book(date, "service-1", 987, "staff-1")).toBeNull();
    expect(s.book(date, "service-1", 1007, "staff-1")).toContain("no longer");
  });
  it("rejects overlapping, fractional, reverse and overnight periods; permits adjacent windows", () => {
    for (const periods of [[{ opens: 600, closes: 599 }], [{ opens: -1, closes: 500 }], [{ opens: 600.5, closes: 900 }], [{ opens: 500, closes: 700 }, { opens: 650, closes: 800 }]]) {
      const c = workshopFixture(); c.hours[0] = periods; expect(validHours(c.hours)).toBe(false);
    }
    const c = workshopFixture(); c.hours[3] = [{ opens: 600, closes: 620 }, { opens: 620, closes: 700 }];
    expect(dayPeriods(c.hours, date)).toEqual([{ opens: 600, closes: 700 }]);
    c.hours = Array.from({ length: 7 }, () => []); expect(configurationErrors(c)).toEqual([]);
  });
  it("copies selected days deeply without changing other weekdays", () => {
    const c = workshopFixture(), copied = copyHours(c.hours, 3, [1, 5]);
    expect(copied[1]).toEqual(c.hours[3]); expect(copied[5]).toEqual(c.hours[3]); expect(copied[4]).toEqual(c.hours[4]);
    copied[1][0].opens = 800; expect(copied[5][0].opens).toBe(547); expect(c.hours[3][0].opens).toBe(547);
  });
  it("preserves snapshots through hours/interval edits and restores all new baseline values", () => {
    const s = workshopSession(); s.book(date, "service-1", 547, "staff-1"); const original = s.getSnapshot().appointments[0];
    const baseline = structuredClone(s.getSnapshot().baseline), c = structuredClone(s.getSnapshot().config);
    c.hours[3] = []; c.startInterval = 7; c.location.address = "Different fictional text"; c.location.localityId = ""; s.update(c);
    expect(s.getSnapshot().appointments[0]).toEqual(original); s.softReset(); expect(s.getSnapshot().config).toEqual(baseline);
    s.hardReset(); expect(s.getSnapshot().config).toEqual(emptyConfiguration());
  });
});
describe("explicit offline locality selection", () => {
  it("finds Pretoria and ZA/country matches without inferring arbitrary addresses", () => {
    expect(offlineLocalities.search("Pretoria, South Africa").map(p => p.id)).toEqual(["964137"]);
    expect(timezoneRecommendation(offlineLocalities, "964137")).toBe("Africa/Johannesburg");
    expect(offlineLocalities.search("South Africa")).toHaveLength(4); expect(offlineLocalities.search("ZA")).toHaveLength(4);
    expect(offlineLocalities.search("123 Pretoria Road")).toEqual([]); expect(offlineLocalities.search("Springfield")).toEqual([]);
    expect(timezoneRecommendation(offlineLocalities, "unknown")).toBeNull();
  });
  it("preserves explicit timezone choices and cannot bypass the appointment/busy lock", () => {
    const s = workshopSession(), c = structuredClone(s.getSnapshot().config); c.business.timezone = "Europe/London"; s.update(c);
    c.location.localityId = "993800"; c.location.address = "Pretoria in arbitrary address text"; s.update(c);
    expect(s.getSnapshot().config.business.timezone).toBe("Europe/London");
    s.connectBusy(date, "staff-1", 600, 60); c.business.timezone = timezoneRecommendation(offlineLocalities, c.location.localityId)!; s.update(c);
    expect(s.getSnapshot().config.business.timezone).toBe("Europe/London");
  });
});
