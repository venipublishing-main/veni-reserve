import { practitionerDay, type PractitionerDayInput, type WorkingPeriod } from "../features/booking/availability.ts";

type ScheduleKey = { target: string; practitioner: string; on_date: string };
type ReadSchedule = (query: ScheduleKey) => Promise<Response>;
type RemainingRules = Omit<PractitionerDayInput, "staffId" | "staffPeriods" | "timezone" | "date">;

function record(value: unknown): value is Record<string, unknown> {
  return typeof value === "object" && value !== null && !Array.isArray(value);
}

function period(value: unknown): value is WorkingPeriod {
  return record(value) && typeof value.opens === "number" && typeof value.closes === "number" &&
    Number.isInteger(value.opens) && Number.isInteger(value.closes) && value.opens >= 0 &&
    value.opens < value.closes && value.closes <= 1440;
}

/** The transport calls reserve_read_practitioner_schedule with the current user's token.
 * Eligibility, service rules, location limits and busy time come from the caller. */
export async function readPractitionerDay(read: ReadSchedule, query: ScheduleKey, rules: RemainingRules) {
  const response = await read(query);
  if (!response.ok) throw new Error("Practitioner schedule unavailable (HTTP " + response.status + ")");
  const day: unknown = await response.json();
  if (!record(day) || day.tenant_id !== query.target || day.staff_id !== query.practitioner || day.date !== query.on_date ||
    typeof day.timezone !== "string" || !day.timezone || typeof day.revision !== "number" || !Number.isSafeInteger(day.revision) || day.revision < 0 ||
    !Array.isArray(day.periods) || !day.periods.every(period)) {
    throw new Error("Invalid practitioner schedule response");
  }
  return practitionerDay({ ...rules, date: day.date, timezone: day.timezone, staffId: day.staff_id, staffPeriods: day.periods });
}
