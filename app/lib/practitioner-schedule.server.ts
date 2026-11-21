import { practitionerDay, type DatedExclusion, type PractitionerDayInput, type WorkingPeriod } from "../features/booking/availability.ts";

type ScheduleKey = { target: string; practitioner: string; on_date: string };
type LocatedDayKey = ScheduleKey & { location: string };
type ReadSchedule<K> = (query: K) => Promise<Response>;
type RemainingRules = Omit<PractitionerDayInput, "staffId" | "staffPeriods" | "timezone" | "date" | "exclusions">;

function record(value: unknown): value is Record<string, unknown> {
  return typeof value === "object" && value !== null && !Array.isArray(value);
}

function period(value: unknown): value is WorkingPeriod {
  return record(value) && typeof value.opens === "number" && typeof value.closes === "number" &&
    Number.isInteger(value.opens) && Number.isInteger(value.closes) && value.opens >= 0 &&
    value.opens < value.closes && value.closes <= 1440;
}

function scheduleInput(day: Record<string, unknown>, query: ScheduleKey, rules: RemainingRules): PractitionerDayInput {
  if (day.tenant_id !== query.target || day.staff_id !== query.practitioner || day.date !== query.on_date ||
    typeof day.timezone !== "string" || !day.timezone || typeof day.revision !== "number" || !Number.isSafeInteger(day.revision) || day.revision < 0 ||
    !Array.isArray(day.periods) || !day.periods.every(period)) {
    throw new Error("Invalid practitioner schedule response");
  }
  return { ...rules, date: day.date, timezone: day.timezone, staffId: day.staff_id, staffPeriods: day.periods };
}

async function readProjection<K>(read: ReadSchedule<K>, query: K) {
  const response = await read(query);
  if (!response.ok) throw new Error("Practitioner schedule unavailable (HTTP " + response.status + ")");
  const day: unknown = await response.json();
  if (!record(day)) throw new Error("Invalid practitioner schedule response");
  return day;
}

/** Recurring-only M3.2 projection. */
export async function readPractitionerDay(read: ReadSchedule<ScheduleKey>, query: ScheduleKey, rules: RemainingRules) {
  return practitionerDay(scheduleInput(await readProjection(read, query), query, rules));
}

/** Use reserve_read_availability_day with the user's token. The single RPC reads
 * recurring hours and active exceptions from the same database snapshot. */
export async function readAvailabilityDay(read: ReadSchedule<LocatedDayKey>, query: LocatedDayKey, rules: RemainingRules) {
  const day = await readProjection(read, query);
  const input = scheduleInput(day, query, rules);
  if (day.location_id !== query.location || !Array.isArray(day.exclusions)) throw new Error("Invalid dated availability response");
  const exclusions: DatedExclusion[] = day.exclusions.map((e: unknown) => {
    if (!record(e) || typeof e.start !== "number" || !Number.isSafeInteger(e.start) ||
      typeof e.end !== "number" || !Number.isSafeInteger(e.end) || e.start >= e.end) throw new Error("Invalid exclusion interval");
    if (e.staff_id === query.practitioner && e.location_id === null) return { kind: "practitioner_absent", start: e.start, end: e.end };
    if (e.location_id === query.location && e.staff_id === null) return { kind: "location_closed", start: e.start, end: e.end };
    throw new Error("Invalid exclusion subject");
  });
  return practitionerDay({ ...input, exclusions });
}
