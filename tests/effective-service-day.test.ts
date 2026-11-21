import { describe, expect, it } from "vitest";
import { readServiceDay, type ServiceDayQuery } from "../app/lib/practitioner-schedule.server";

const query: ServiceDayQuery = {
  target: "cf7a8197-fd6b-41d8-9000-000000000001", service: "cf7a8197-fd6b-41d8-9000-000000000002",
  practitioner: "cf7a8197-fd6b-41d8-9000-000000000003", location: "cf7a8197-fd6b-41d8-9000-000000000004",
  on_date: "2026-11-23", mode: "NAMED",
};
const identity = { tenant_id: query.target, staff_id: query.practitioner, service_id: query.service,
  location_id: query.location, date: query.on_date, mode: query.mode };
const day = { ...identity, eligible: true, online_bookable: true, duration_minutes: 30,
  buffer_before_minutes: 0, buffer_after_minutes: 5, min_notice_minutes: null, max_advance_days: 30,
  timezone: "Africa/Johannesburg", periods: [{ opens: 540, closes: 600 }], revision: 1, exclusions: [] };
const context = { interval: 10, occupied: [], earliest: 0 };
const read = (response: object) => readServiceDay(async () => Response.json(response), query, context);

describe("authoritative service day", () => {
  it("supplies duration and both buffers exclusively from the response", async () => {
    const stale = { ...context, durationMinutes: 1, bufferAfterMinutes: 0, bufferBeforeMinutes: 90 };
    const result = await readServiceDay(async args => {
      expect(args).toEqual(query);
      return Response.json(day);
    }, query, stale);
    expect(result.list()).toEqual([540, 550, 560]);
    expect(result.check(570)).toEqual({ ok: false, reason: "outside_staff_hours" });
  });
  it("preserves the reason for a structurally ineligible combination", async () => {
    const result = await read({ ...identity, eligible: false, reason: "staff_service_offline" });
    expect(result.list()).toEqual([]);
    expect(result.check(540)).toEqual({ ok: false, reason: "staff_service_offline" });
  });
  it.each(["tenant_id", "service_id", "staff_id", "location_id", "date", "mode"])(
    "validates %s on eligible and ineligible results", async field => {
      for (const source of [day, { ...identity, eligible: false, reason: "practitioner_hidden" }]) {
        await expect(read({ ...source, [field]: "different" })).rejects.toThrow();
      }
    });
  it.each([{ duration_minutes: 0 }, { duration_minutes: 10081 }, { duration_minutes: 5.5 },
    { buffer_before_minutes: -1 }, { buffer_before_minutes: "0" }, { buffer_after_minutes: 1441 },
    { buffer_after_minutes: null }, { min_notice_minutes: -1 }, { max_advance_days: 0 },
    { reason: "service_offline" }, { eligible: "true" }, { eligible: false, reason: "unknown" }, { online_bookable: false },
    { exclusions: [{ staff_id: query.practitioner, location_id: null, start: 1, end: 2, exception_id: "invalid", revision: 1 }] },
  ])("refuses malformed effective configuration %j", async patch => {
    await expect(read({ ...day, ...patch })).rejects.toThrow();
  });
  it("propagates denied access before evaluation", async () => {
    await expect(readServiceDay(async () => new Response(null, { status: 403 }), query, context)).rejects.toThrow("403");
  });
});
