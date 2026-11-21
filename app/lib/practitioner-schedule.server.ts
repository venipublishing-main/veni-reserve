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
  return evaluateLocatedDay(await readProjection(read, query), query, rules);
}

function evaluateLocatedDay(day: Record<string, unknown>, query: LocatedDayKey, rules: RemainingRules) {
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

export type ServiceDayQuery = LocatedDayKey & { service: string; mode: "NAMED" | "NO_PREFERENCE" };
type ServiceDayContext = Omit<RemainingRules, "durationMinutes" | "bufferBeforeMinutes" | "bufferAfterMinutes">;
const structuralReasons = [
  "service_inactive", "practitioner_inactive", "location_inactive", "service_offline", "practitioner_offline",
  "practitioner_hidden", "no_preference_disabled", "staff_service_unavailable", "staff_location_unavailable",
  "service_location_unavailable", "staff_service_offline",
] as const;
export type ServiceDayRejection = typeof structuralReasons[number];

function structuralReason(value: unknown): value is ServiceDayRejection {
  return structuralReasons.some(reason => reason === value);
}

function bounded(value: unknown, min: number, max: number): value is number {
  return typeof value === "number" && Number.isSafeInteger(value) && value >= min && value <= max;
}

function uuid(value: unknown): boolean {
  return typeof value === "string" && /^[0-9a-f]{8}(?:-[0-9a-f]{4}){3}-[0-9a-f]{12}$/i.test(value);
}

/** One private reserve_read_service_day RPC using the caller's Reserve session. */
export async function readServiceDay(read: ReadSchedule<ServiceDayQuery>, query: ServiceDayQuery, context: ServiceDayContext) {
  const day = await readProjection(read, query);
  if (![query.target, query.service, query.practitioner, query.location].every(uuid) ||
    day.tenant_id !== query.target || day.service_id !== query.service || day.staff_id !== query.practitioner ||
    day.location_id !== query.location || day.date !== query.on_date || day.mode !== query.mode ||
    (day.mode !== "NAMED" && day.mode !== "NO_PREFERENCE")) throw new Error("Invalid service day identity");
  if (day.eligible === false && structuralReason(day.reason)) {
    const reason = day.reason;
    const check: (minute: number) => { ok: false; reason: ServiceDayRejection } = () => ({ ok: false, reason });
    return { eligible: false as const, reason, list: (): number[] => [], check };
  }
  if (day.eligible !== true || day.reason !== undefined || day.online_bookable !== true ||
    !bounded(day.duration_minutes, 1, 10080) || !bounded(day.buffer_before_minutes, 0, 1440) ||
    !bounded(day.buffer_after_minutes, 0, 1440) ||
    !(day.min_notice_minutes === null || bounded(day.min_notice_minutes, 0, 525600)) ||
    !(day.max_advance_days === null || bounded(day.max_advance_days, 1, 3650)) ||
    !Array.isArray(day.exclusions) || !day.exclusions.every(e => record(e) && uuid(e.exception_id) && bounded(e.revision, 1, 2147483647))) {
    throw new Error("Invalid effective service rules");
  }
  const serviceRules = { durationMinutes: day.duration_minutes, bufferBeforeMinutes: day.buffer_before_minutes,
    bufferAfterMinutes: day.buffer_after_minutes, onlineBookable: true as const,
    minNoticeMinutes: day.min_notice_minutes, maxAdvanceDays: day.max_advance_days };
  const evaluation = evaluateLocatedDay(day, query, { ...context, ...serviceRules });
  return { eligible: true as const, serviceRules, ...evaluation };
}
