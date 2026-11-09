import { describe, expect, it } from "vitest";
import {
  addDays,
  DEMO_SERVICES,
  demoAvailableSlots,
  minutesLabel,
  syntheticAppointments,
  todayInTimeZone,
} from "../app/features/demo/booking";

const exam = DEMO_SERVICES[0];
const now = new Date("2026-11-09T10:00:00+02:00");

function available(
  date: string,
  staffId: string = "any",
  current: Date = now,
) {
  return demoAvailableSlots({ date, staffId, service: exam, now: current });
}

describe("synthetic booking availability (never authoritative)", () => {
  it("uses the business timezone for calendar day and crosses months correctly", () => {
    expect(todayInTimeZone(new Date("2026-11-09T22:30:00Z"), "Africa/Johannesburg")).toBe("2026-11-10");
    expect(addDays("2026-11-30", 1)).toBe("2026-12-01");
    expect(minutesLabel(9 * 60 + 30)).toBe("09:30");
  });

  it("does not list Sunday or invalid dates", () => {
    expect(available("2026-11-15")).toEqual([]);
    expect(available("2026-02-30")).toEqual([]);
    expect(available("not-a-date")).toEqual([]);
  });

  it("requires the complete service + buffer to fit within hours", () => {
    const minutes = available("2026-11-10").map((slot) => slot.startMinute);
    expect(minutes).toContain(16 * 60);
    expect(minutes).not.toContain(16 * 60 + 30);
    expect(available("2026-11-14").some((slot) => slot.startMinute === 12 * 60 + 30)).toBe(false);
  });

  it("does not show booked/overlapping occupied time for named staff", () => {
    const p1 = available("2026-11-10", "p1").map((slot) => slot.startMinute);
    expect(p1).not.toContain(9 * 60);
    expect(p1).not.toContain(9 * 60 + 30);
    expect(p1).toContain(10 * 60);
    expect(p1).not.toContain(14 * 60);
  });

  it("offers no-preference slots only when an eligible person is available", () => {
    const slots = available("2026-11-10");
    expect(slots.find((slot) => slot.startMinute === 9 * 60)?.staffId).toBe("p2");
    expect(slots.length).toBeGreaterThan(0);
    expect(demoAvailableSlots({
      date: "2026-11-10",
      service: DEMO_SERVICES[2],
      staffId: "p1",
      now,
    })).toEqual([]);
  });

  it("enforces minimum notice in the demonstration", () => {
    const closeToOpening = new Date("2026-11-10T08:15:00+02:00");
    const starts = available("2026-11-10", "any", closeToOpening).map((slot) => slot.startMinute);
    expect(starts).not.toContain(9 * 60);
    expect(starts).toContain(10 * 60 + 30);
  });

  it("uses only fictional visitors in workspace fixtures", () => {
    const appointments = syntheticAppointments("2026-11-10");
    expect(appointments).toHaveLength(4);
    expect(appointments.every((item) => item.customerLabel.startsWith("Sample client"))).toBe(true);
    expect(syntheticAppointments("2026-11-15")).toEqual([]);
  });
});
