/** Shared slot calculation. Production commits still require server authorization,
 * authoritative revalidation and transactional concurrency protection. */
export type SchedulingService = {
  id: string;
  durationMinutes: number;
  bufferAfterMinutes: number;
  eligibleStaffIds: readonly string[];
};
export type BusyInterval = { staffId: string; start: number; end: number };
export type AvailableSlot = { startMinute: number; staffId: string };

export function availableSlots(input: {
  service: SchedulingService; staffIds: readonly string[]; staffId: string;
  opens: number; closes: number; interval: number; earliest: number;
  instant: (minute: number) => number | null;
  occupied: readonly BusyInterval[];
}): AvailableSlot[] {
  const { service, opens, closes, interval, earliest, instant, occupied } = input;
  if (!Number.isInteger(interval) || interval <= 0 || interval > 1440 ||
    !Number.isFinite(opens) || !Number.isFinite(closes) || opens < 0 || closes > 1440 ||
    service.durationMinutes <= 0 || service.bufferAfterMinutes < 0) return [];
  const people = input.staffIds.filter(id => service.eligibleStaffIds.includes(id) &&
    (input.staffId === "any" || input.staffId === id));
  const result: AvailableSlot[] = [];
  const length = service.durationMinutes + service.bufferAfterMinutes;
  for (let minute = opens; minute + length <= closes; minute += interval) {
    const start = instant(minute);
    const end = instant(minute + length);
    // Reject skipped/repeated local times and intervals crossing clock changes.
    if (start === null || end === null || end - start !== length * 60_000 || start < earliest) continue;
    const staffId = people.find(id => !occupied.some(busy =>
      busy.staffId === id && start < busy.end && end > busy.start));
    if (staffId) result.push({ startMinute: minute, staffId });
  }
  return result;
}

/** Resolve one local day. Ambiguous/nonexistent wall times fail closed in POC 1A. */
export function dayClock(date: string, timezone: string): (minute: number) => number | null {
  const day = Date.parse(`${date}T00:00:00Z`);
  if (!/^\d{4}-\d{2}-\d{2}$/.test(date) || !Number.isFinite(day) ||
    new Date(day).toISOString().slice(0, 10) !== date) return () => null;
  const format = new Intl.DateTimeFormat("en-CA", {
    timeZone: timezone, year: "numeric", month: "2-digit", day: "2-digit",
    hour: "2-digit", minute: "2-digit", hourCycle: "h23",
  });
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
  return minute => {
    const target = day + minute * 60_000;
    const matches = [...offsets].map(offset => target - offset).filter(t => wall(t) === target);
    return matches.length === 1 ? matches[0] : null;
  };
}
