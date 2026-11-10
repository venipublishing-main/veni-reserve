export type WorkingPeriod = { opens: number; closes: number };
/** Sunday=0. Empty periods mean closed. Staff inherit this business schedule. */
export type WeeklyHours = WorkingPeriod[][];
export const WEEKDAYS = ["Sunday", "Monday", "Tuesday", "Wednesday", "Thursday", "Friday", "Saturday"];
export const START_INTERVALS = [5, 10, 15, 20, 30, 60];
export const defaultHours = (): WeeklyHours => WEEKDAYS.map((_, day) => day > 0 && day < 6 ? [{ opens: 540, closes: 1020 }] : []);
export function validHours(hours: WeeklyHours) {
  return hours.length === 7 && hours.every(periods => {
    const sorted = [...periods].sort((a, b) => a.opens - b.opens);
    return sorted.every((p, i) => Number.isInteger(p.opens) && Number.isInteger(p.closes) && p.opens >= 0 &&
      p.closes <= 1440 && p.closes > p.opens && (!i || p.opens >= sorted[i - 1].closes));
  });
}
export function dayPeriods(hours: WeeklyHours, date: string): WorkingPeriod[] {
  if (!validHours(hours)) return [];
  const periods = [...(hours[new Date(`${date}T12:00:00Z`).getUTCDay()] ?? [])].sort((a, b) => a.opens - b.opens);
  // Touching windows have no closed period between them. Merge without double capacity.
  return periods.reduce<WorkingPeriod[]>((result, p) => {
    const previous = result.at(-1);
    if (previous?.closes === p.opens) previous.closes = p.closes; else result.push({ ...p });
    return result;
  }, []);
}
export function copyHours(hours: WeeklyHours, source: number, targets: number[]): WeeklyHours {
  return hours.map((periods, day) => structuredClone(targets.includes(day) ? hours[source] : periods));
}
