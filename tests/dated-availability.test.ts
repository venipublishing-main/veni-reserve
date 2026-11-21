import { describe, expect, it } from "vitest";
import { practitionerDay, type DatedExclusion } from "../app/features/booking/availability";
import { readAvailabilityDay } from "../app/lib/practitioner-schedule.server";

const date = "2026-11-23";
const at = (minute: number) => Date.parse(date + "T00:00:00Z") + (minute - 120) * 60_000;
const rules = { durationMinutes: 20, bufferBeforeMinutes: 10, bufferAfterMinutes: 15,
  interval: 20, earliest: 0, occupied: [] };
const base = { ...rules, date, timezone: "Africa/Johannesburg", staffId: "a", staffPeriods: [{ opens: 540, closes: 720 }] };
const absence = (from: number, until: number): DatedExclusion => ({ kind: "practitioner_absent", start: at(from), end: at(until) });
const query = { target: "tenant", practitioner: "a", location: "office", on_date: date };
const projection = { tenant_id: query.target, staff_id: query.practitioner, location_id: query.location,
  date, timezone: base.timezone, revision: 1, periods: base.staffPeriods, exclusions: [] };

describe("dated availability", () => {
  it("blocks either buffer alone and permits exact adjacency at both occupied boundaries", () => {
    // A 10:00 service occupies [09:50, 10:35).
    for (const exclusion of [absence(589,591),absence(634,636)]) {
      expect(practitionerDay({ ...base, exclusions: [exclusion] }).check(600)).toEqual({ ok: false, reason: "practitioner_absent" });
    }
    expect(practitionerDay({ ...base, exclusions: [absence(580,590),absence(635,650)] }).check(600).ok).toBe(true);
  });
  it("overlapping and duplicate exclusions have order-independent lists and reasons", () => {
    const a = absence(575,650), b: DatedExclusion = { ...absence(580,610), kind: "location_closed" };
    const day = practitionerDay({ ...base, exclusions: [a,b,a] });
    const reversed = practitionerDay({ ...base, exclusions: [b,a] });
    const listed = day.list();
    expect(listed).toEqual(reversed.list());
    for (let minute = 540; minute < 720; minute++) {
      expect(day.check(minute)).toEqual(reversed.check(minute));
      expect(day.check(minute).ok).toBe(listed.includes(minute));
    }
    expect(day.check(600)).toEqual({ ok: false, reason: "practitioner_absent" });
    expect(day.check(650)).toEqual({ ok: false, reason: "off_grid" });
    expect(day.check(660).ok).toBe(true);
  });
  it("keeps ordinary schedule, busy, unrestricted location and explicit closure distinct", () => {
    expect(practitionerDay(base).check(600).ok).toBe(true);
    const closure: DatedExclusion = { ...absence(0,1440), kind: "location_closed" };
    expect(practitionerDay({ ...base, exclusions: [closure] }).check(600)).toEqual({ ok: false, reason: "location_closed" });
    expect(practitionerDay({ ...base, staffPeriods: [], exclusions: [closure] }).check(600)).toEqual({ ok: false, reason: "outside_staff_hours" });
    expect(practitionerDay({ ...base, occupied: [{ staffId: "a", start: at(600), end: at(620) }] }).check(600)).toEqual({ ok: false, reason: "busy" });
  });
  it.each([{ tenant_id: "other" }, { staff_id: "other" }, { location_id: "other" }, { date: "2026-11-24" },
    { exclusions: null }, { exclusions: [{ staff_id: "other", location_id: null, start: 1, end: 2 }] },
    { exclusions: [{ staff_id: null, location_id: "elsewhere", start: 1, end: 2 }] },
    { exclusions: [{ staff_id: "a", location_id: "office", start: 1, end: 2 }] },
    { exclusions: [{ staff_id: "a", location_id: null, start: 2, end: 1 }] }])(
    "rejects incomplete or differently scoped server data %j", async patch => {
      await expect(readAvailabilityDay(async () => Response.json({ ...projection, ...patch }), query, rules)).rejects.toThrow();
    });
});
