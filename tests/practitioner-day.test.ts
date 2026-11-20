import { describe, expect, it } from "vitest";
import { practitionerDay } from "../app/features/booking/availability";

const date = "2026-11-23";
const at = (minute: number) => Date.parse(date + "T00:00:00Z") + (minute - 120) * 60_000;
const base = {
  staffId: "practitioner-a", date, timezone: "Africa/Johannesburg",
  staffPeriods: [{ opens: 540, closes: 720 }], durationMinutes: 45,
  bufferBeforeMinutes: 10, bufferAfterMinutes: 15, interval: 15,
  earliest: at(0), occupied: [],
};
const rejected = (reason: string) => ({ ok: false, reason });

describe("one eligible practitioner's local day", () => {
  it("fits the complete occupied interval and accepts closing-time equality", () => {
    const day = practitionerDay(base);
    expect(day.check(540)).toEqual(rejected("outside_staff_hours"));
    expect(day.check(555)).toEqual({ ok: true, start: at(555), serviceEnd: at(600), occupiedStart: at(545), occupiedEnd: at(615) });
    expect(day.check(660).ok).toBe(true);
    expect(day.check(675)).toEqual(rejected("outside_staff_hours"));
    expect(day.list()).toEqual([555, 570, 585, 600, 615, 630, 645, 660]);
  });

  it("includes the earliest and latest service starts, down to the millisecond", () => {
    const exact = at(600);
    expect(practitionerDay({ ...base, earliest: exact, latest: exact }).list()).toEqual([600]);
    expect(practitionerDay({ ...base, earliest: exact + 1 }).check(600)).toEqual(rejected("inside_notice_period"));
    expect(practitionerDay({ ...base, latest: exact - 1 }).check(600)).toEqual(rejected("beyond_horizon"));
  });

  it("anchors each merged staff period at its own opening, even when a location opens later", () => {
    const staffPeriods = [{ opens: 543, closes: 600 }, { opens: 600, closes: 720 }, { opens: 782, closes: 950 }];
    const day = practitionerDay({ ...base, staffPeriods, locationPeriods: [{ opens: 550, closes: 900 }] });
    expect(day.check(558)).toEqual(rejected("outside_location_hours")); // pre-buffer begins at 548
    expect(day.check(573).ok).toBe(true);
    expect(day.check(600)).toEqual(rejected("off_grid"));
    expect(day.check(797).ok).toBe(true);
    expect(day.check(753)).toEqual(rejected("outside_staff_hours"));
    expect(day.check(857)).toEqual(rejected("outside_location_hours")); // post-buffer ends at 917
  });

  it("requires staff coverage even if the location is open, and honours explicit closure", () => {
    expect(practitionerDay({ ...base, staffPeriods: [], locationPeriods: base.staffPeriods }).check(600)).toEqual(rejected("outside_staff_hours"));
    expect(practitionerDay({ ...base, locationPeriods: [] }).check(600)).toEqual(rejected("outside_location_hours"));
    expect(practitionerDay(base).check(600).ok).toBe(true);
  });

  it("rejects crossing a lunch break even with start and end in working periods", () => {
    const day = practitionerDay({ ...base, staffPeriods: [{ opens: 540, closes: 650 }, { opens: 655, closes: 720 }] });
    expect(day.check(600)).toEqual(rejected("outside_staff_hours"));
  });

  it("uses half-open busy time for the practitioner at every location", () => {
    const occupied = [
      { staffId: base.staffId, locationId: "other", start: at(500), end: at(590) },
      { staffId: base.staffId, locationId: "other", start: at(660), end: at(710) },
      { staffId: "practitioner-b", locationId: "here", start: at(580), end: at(700) },
    ];
    expect(practitionerDay({ ...base, occupied }).check(600).ok).toBe(true);
    for (const extra of [{ start: at(590) - 1, end: at(590) + 1 }, { start: at(660) - 1, end: at(660) + 1 }]) {
      expect(practitionerDay({ ...base, occupied: [...occupied, { staffId: base.staffId, ...extra }] }).check(600)).toEqual(rejected("busy"));
    }
  });

  it("is invariant under reordered, overlapping and duplicate windows or busy intervals", () => {
    const periods = [{ opens: 560, closes: 630 }, ...base.staffPeriods, ...base.staffPeriods];
    const busy = [575, 665].map(minute => ({ staffId: base.staffId, start: at(minute), end: at(minute + 2) }));
    const forward = practitionerDay({ ...base, staffPeriods: periods, locationPeriods: periods, occupied: busy });
    const reverse = practitionerDay({ ...base, staffPeriods: [...periods].reverse(), locationPeriods: [...periods].reverse(), occupied: [...busy].reverse() });
    expect(forward.list().length).toBeGreaterThan(0);
    expect(reverse.list()).toEqual(forward.list());
    const listed = new Set(forward.list());
    for (let minute = 530; minute <= 730; minute++) {
      expect(forward.check(minute)).toEqual(reverse.check(minute));
      expect(forward.check(minute).ok).toBe(listed.has(minute));
    }
  });

  it.each([
    ["2026-03-08", 150, 15], ["2026-11-01", 90, 15], // missing and repeated starts
    ["2026-03-08", 90, 120], ["2026-11-01", 30, 180], // unambiguous endpoints across a transition
  ] as const)("rejects unsafe local time on %s at minute %i for %i minutes", (date, minute, durationMinutes) => {
    const day = practitionerDay({ ...base, date, timezone: "America/New_York", earliest: 0,
      durationMinutes, bufferBeforeMinutes: 0, bufferAfterMinutes: 0, staffPeriods: [{ opens: 0, closes: 600 }] });
    expect(day.check(minute)).toEqual(rejected("invalid_local_time"));
    expect(day.list()).not.toContain(minute);
    expect(day.check(375).ok).toBe(true);
  });

  it("rejects invalid zones, dates, candidate minutes and rule inputs", () => {
    for (const input of [{ timezone: "Bad/Zone" }, { date: "2026-02-30" }]) {
      const day = practitionerDay({ ...base, ...input });
      expect(day.check(600)).toEqual(rejected("invalid_local_time"));
      expect(day.list()).toEqual([]);
    }
    expect(practitionerDay(base).check(600.5)).toEqual(rejected("invalid_local_time"));
    const day = practitionerDay({ ...base, interval: 0 });
    expect(day.check(600)).toEqual(rejected("invalid_configuration"));
    expect(day.list()).toEqual([]);
  });
});
