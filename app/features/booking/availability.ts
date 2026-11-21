/** All periods belong to one local day. Occupancy and busy intervals are half-open. */
export type WorkingPeriod = { opens: number; closes: number };
export type BusyInterval = { staffId: string; start: number; end: number };
export type DatedExclusion = { kind: "practitioner_absent" | "location_closed"; start: number; end: number };
export type AvailableSlot = { startMinute: number; staffId: string };
type LocalClock = (minute: number) => number | null;

type DayRules = {
  staffId: string;
  staffPeriods: readonly WorkingPeriod[];
  /** Absent means unrestricted. An explicit empty list means closed. */
  locationPeriods?: readonly WorkingPeriod[];
  durationMinutes: number;
  bufferBeforeMinutes: number;
  bufferAfterMinutes: number;
  interval: number;
  /** Inclusive bounds on the service start, expressed in epoch milliseconds. */
  earliest: number;
  latest?: number;
  occupied: readonly BusyInterval[];
  exclusions?: readonly DatedExclusion[];
};

export type AvailabilityRejection = "invalid_configuration" | "invalid_local_time" | "off_grid" |
  "outside_staff_hours" | "outside_location_hours" | "inside_notice_period" |
  "beyond_horizon" | "busy" | DatedExclusion["kind"];
export type AvailabilityDecision = { ok: false; reason: AvailabilityRejection } |
  { ok: true; start: number; serviceEnd: number; occupiedStart: number; occupiedEnd: number };

export function mergePeriods(periods: readonly WorkingPeriod[]): WorkingPeriod[] {
  const merged: WorkingPeriod[] = [];
  for (const period of [...periods].sort((a, b) => a.opens - b.opens)) {
    const previous = merged.at(-1);
    if (previous && period.opens <= previous.closes) previous.closes = Math.max(previous.closes, period.closes);
    else merged.push({ ...period });
  }
  return merged;
}

function validPeriod({ opens, closes }: WorkingPeriod) {
  return Number.isInteger(opens) && Number.isInteger(closes) && opens >= 0 && opens < closes && closes <= 1440;
}

export type PractitionerDayInput = DayRules & { date: string; timezone: string };

/** Evaluate already-resolved rules for one eligible practitioner at one location. */
export function practitionerDay(input: PractitionerDayInput) {
  return prepareDay(input, dayClock(input.date, input.timezone));
}

function prepareDay(rules: DayRules, instant: LocalClock) {
  const { durationMinutes, bufferBeforeMinutes, bufferAfterMinutes, interval, earliest, latest } = rules;
  const busy = rules.occupied.filter(entry => entry.staffId === rules.staffId);
  const exclusions = rules.exclusions ?? [];
  const valid = exclusions.every(e => (e.kind === "practitioner_absent" || e.kind === "location_closed") &&
    Number.isFinite(e.start) && Number.isFinite(e.end) && e.start < e.end) && Number.isInteger(interval) && interval > 0 && interval <= 1440 &&
    Number.isSafeInteger(durationMinutes) && durationMinutes > 0 &&
    Number.isSafeInteger(bufferBeforeMinutes) && bufferBeforeMinutes >= 0 &&
    Number.isSafeInteger(bufferAfterMinutes) && bufferAfterMinutes >= 0 &&
    Number.isFinite(earliest) && (latest === undefined || (Number.isFinite(latest) && latest >= earliest)) &&
    busy.every(entry => Number.isFinite(entry.start) && Number.isFinite(entry.end) && entry.start < entry.end) &&
    rules.staffPeriods.every(validPeriod) && (rules.locationPeriods?.every(validPeriod) ?? true);
  const staff = mergePeriods(rules.staffPeriods);
  const location = rules.locationPeriods && mergePeriods(rules.locationPeriods);

  function check(minute: number): AvailabilityDecision {
    if (!valid) return { ok: false, reason: "invalid_configuration" };
    if (!Number.isInteger(minute) || minute < 0 || minute >= 1440) return { ok: false, reason: "invalid_local_time" };
    const start = instant(minute);
    if (start === null) return { ok: false, reason: "invalid_local_time" };
    const from = minute - bufferBeforeMinutes;
    const finish = minute + durationMinutes;
    const until = finish + bufferAfterMinutes;
    const period = staff.find(p => p.opens <= from && until <= p.closes);
    if (!period) return { ok: false, reason: "outside_staff_hours" };
    if ((minute - period.opens) % interval !== 0) return { ok: false, reason: "off_grid" };
    if (location && !location.some(p => p.opens <= from && until <= p.closes)) return { ok: false, reason: "outside_location_hours" };

    const occupiedStart = instant(from);
    const serviceEnd = instant(finish);
    const occupiedEnd = instant(until);
    if (occupiedStart === null || serviceEnd === null || occupiedEnd === null ||
      occupiedEnd - occupiedStart !== (until - from) * 60_000) return { ok: false, reason: "invalid_local_time" };
    if (start < earliest) return { ok: false, reason: "inside_notice_period" };
    if (latest !== undefined && start > latest) return { ok: false, reason: "beyond_horizon" };
    const overlaps = (b: { start: number; end: number }) => occupiedStart < b.end && b.start < occupiedEnd;
    // An otherwise eligible start gets a stable reason even when several exclusions overlap.
    for (const kind of ["practitioner_absent", "location_closed"] as const) {
      if (exclusions.some(e => e.kind === kind && overlaps(e))) return { ok: false, reason: kind };
    }
    if (busy.some(overlaps)) return { ok: false, reason: "busy" };
    return { ok: true, start, serviceEnd, occupiedStart, occupiedEnd };
  }

  function list(): number[] {
    const starts: number[] = [];
    if (!valid) return starts;
    for (const { opens, closes } of staff) {
      for (let minute = opens; minute < closes; minute += interval) {
        if (check(minute).ok) starts.push(minute);
      }
    }
    return starts;
  }
  return { check, list };
}

export type SchedulingService = {
  id: string;
  durationMinutes: number;
  bufferAfterMinutes: number;
  eligibleStaffIds: readonly string[];
};

/** Both synthetic adapters retain their configured first-eligible person per time. */
export function availableSlots(input: {
  service: SchedulingService; staffIds: readonly string[]; staffId: string;
  periods: readonly WorkingPeriod[]; interval: number; earliest: number;
  instant: LocalClock; occupied: readonly BusyInterval[];
}): AvailableSlot[] {
  const slots = new Map<number, AvailableSlot>();
  for (const staffId of input.staffIds) {
    if ((input.staffId !== "any" && input.staffId !== staffId) || !input.service.eligibleStaffIds.includes(staffId)) continue;
    const day = prepareDay({ staffId, staffPeriods: input.periods, interval: input.interval,
      durationMinutes: input.service.durationMinutes, bufferAfterMinutes: input.service.bufferAfterMinutes,
      bufferBeforeMinutes: 0, earliest: input.earliest, occupied: input.occupied }, input.instant);
    for (const startMinute of day.list()) {
      if (!slots.has(startMinute)) slots.set(startMinute, { startMinute, staffId });
    }
  }
  return [...slots.values()].sort((a, b) => a.startMinute - b.startMinute);
}

/** Resolve one local day. Ambiguous/nonexistent wall times fail closed in POC 1A. */
export function dayClock(date: string, timezone: string): (minute: number) => number | null {
  const day = Date.parse(`${date}T00:00:00Z`);
  if (!/^\d{4}-\d{2}-\d{2}$/.test(date) || !Number.isFinite(day) ||
    new Date(day).toISOString().slice(0, 10) !== date) return () => null;
  let format: Intl.DateTimeFormat;
  try {
    format = new Intl.DateTimeFormat("en-CA", {
      timeZone: timezone, year: "numeric", month: "2-digit", day: "2-digit",
      hour: "2-digit", minute: "2-digit", hourCycle: "h23",
    });
  } catch {
    return () => null;
  }
  const wall = (instant: number) => {
    const p = format.formatToParts(instant);
    const n = (key: string) => Number(p.find(x => x.type === key)?.value);
    return Date.UTC(n("year"), n("month") - 1, n("day"), n("hour"), n("minute"));
  };
  const offsets = new Set<number>();
  for (let h = -36; h <= 60; h += 6) {
    const t = day + h * 3_600_000;
    offsets.add(wall(t) - t);
  }
  const cache = new Map<number, number | null>();
  return minute => {
    const cached = cache.get(minute);
    if (cached !== undefined) return cached;
    const target = day + minute * 60_000;
    const matches = [...offsets].map(offset => target - offset).filter(t => wall(t) === target);
    const result = matches.length === 1 ? matches[0] : null;
    cache.set(minute, result);
    return result;
  };
}
