import { describe, expect, it } from "vitest";
import { readPractitionerDay } from "../app/lib/practitioner-schedule.server";

const query = { target: "tenant-a", practitioner: "staff-a", on_date: "2026-11-23" };
const projection = { tenant_id: query.target, staff_id: query.practitioner, date: query.on_date,
  timezone: "Africa/Johannesburg", revision: 1, periods: [{ opens: 540, closes: 720 }] };
const rules = { earliest: 0, durationMinutes: 45, interval: 15, bufferBeforeMinutes: 10,
  bufferAfterMinutes: 15, occupied: [] };

describe("authorised day projection", () => {
  it("forwards the scoped key and uses the returned periods and timezone", async () => {
    const day = await readPractitionerDay(async key => {
      expect(key).toEqual(query);
      return Response.json(projection);
    }, query, rules);
    const start = day.check(555);
    expect(start.ok && start.start).toBe(Date.parse("2026-11-23T07:15:00Z"));
  });

  it.each([{ tenant_id: "b" }, { staff_id: "b" }, { date: "2026-11-24" }, { revision: -1 },
    { timezone: null }, { periods: [null] }, { periods: [{ opens: "9", closes: 720 }] }])(
    "rejects a mismatched or malformed response %j", async patch => {
      await expect(readPractitionerDay(async () => Response.json({ ...projection, ...patch }), query, rules))
        .rejects.toThrow("Invalid practitioner schedule");
    });

  it("preserves transport denial", async () => {
    await expect(readPractitionerDay(async () => new Response(null, { status: 403 }), query, rules))
      .rejects.toThrow("403");
  });
});
