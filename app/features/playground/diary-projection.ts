import { dayPeriods } from "./scheduling";
import type { SessionState } from "./session";

export type DiaryBlock = { id: string; staffId: string; start: number; end: number;
  kind: "appointment" | "buffer" | "busy" | "closed"; label: string; summary?: string; appointmentId?: string; conflict: boolean };
const overlaps = (a: DiaryBlock, b: DiaryBlock) => a.staffId === b.staffId && a.start < b.end && b.start < a.end;
/** A projection only: availability and booking decisions remain in the shared scheduler. */
export function diaryBlocks(state: SessionState, date: string): DiaryBlock[] {
  const c = state.config, blocks: DiaryBlock[] = [];
  for (const a of state.appointments.filter(a => a.date === date)) {
    blocks.push({ id: a.id, appointmentId: a.id, staffId: a.staffId, start: a.startMinute, end: a.startMinute + a.durationMinutes,
      kind: "appointment", label: `${a.serviceName} / ${a.staffName} / ${a.customerLabel}`, summary: `${a.serviceName} / ${a.customerLabel}`, conflict: false });
    if (a.bufferAfterMinutes) blocks.push({ id: `${a.id}-buffer`, appointmentId: a.id, staffId: a.staffId,
      start: a.startMinute + a.durationMinutes, end: a.startMinute + a.durationMinutes + a.bufferAfterMinutes,
      kind: "buffer", label: `Post-service buffer / ${a.staffName}`, conflict: false });
  }
  const busy = state.calendar.connected ? state.calendar.busy : null;
  if (busy) {
    const local = (instant: number) => {
      const parts = new Intl.DateTimeFormat("en-CA", { timeZone: c.business.timezone, year: "numeric", month: "2-digit", day: "2-digit", hour: "2-digit", minute: "2-digit", hourCycle: "h23" }).formatToParts(instant);
      const value = (key: string) => parts.find(p => p.type === key)!.value;
      return { date: `${value("year")}-${value("month")}-${value("day")}`, minute: Number(value("hour")) * 60 + Number(value("minute")) };
    };
    const start = local(busy.start), end = local(busy.end);
    if (start.date <= date && end.date >= date) {
      const from = start.date < date ? 0 : start.minute, to = end.date > date ? 1440 : end.minute;
      if (to > from) blocks.push({ id: "external-busy", staffId: busy.staffId, start: from, end: to, kind: "busy", label: "Simulated external busy", conflict: false });
    }
  }
  const periods = dayPeriods(c.hours, date);
  for (const person of c.staff) {
    let cursor = 0;
    for (const p of [...periods, { opens: 1440, closes: 1440 }]) {
      if (p.opens > cursor) blocks.push({ id: `closed-${person.id}-${cursor}`, staffId: person.id, start: cursor, end: p.opens, kind: "closed", label: "Closed", conflict: false });
      cursor = p.closes;
    }
  }
  return blocks.map(b => ({ ...b, conflict: b.kind !== "closed" && blocks.some(other => other.id !== b.id && overlaps(b, other)) }));
}
/** Overlapping blocks share columns without changing their actual time or duration. */
export function diaryColumns(blocks: DiaryBlock[]) {
  const items = blocks.filter(b => b.kind !== "closed").sort((a, b) => a.start - b.start || a.end - b.end);
  const result: { block: DiaryBlock; column: number; columns: number }[] = [];
  let group: typeof result = [], ends: number[] = [], groupEnd = -1;
  const flush = () => { for (const item of group) result.push({ ...item, columns: ends.length }); group = []; ends = []; };
  for (const block of items) {
    if (block.start >= groupEnd) flush();
    let column = ends.findIndex(end => end <= block.start);
    if (column < 0) column = ends.length;
    ends[column] = block.end; groupEnd = group.length ? Math.max(groupEnd, block.end) : block.end;
    group.push({ block, column, columns: 0 });
  }
  flush(); return result;
}
export function workingSpan(state: SessionState, date: string) {
  const periods = dayPeriods(state.config.hours, date);
  return periods.length ? { start: periods[0].opens, end: periods.at(-1)!.closes } : null;
}
export function exceptionBlocks(state: SessionState, date: string, blocks = diaryBlocks(state, date)) {
  const periods = dayPeriods(state.config.hours, date);
  return blocks.filter(b => b.kind !== "closed" && (!state.config.staff.some(p => p.id === b.staffId) ||
    !periods.some(p => b.start >= p.opens && b.end <= p.closes)));
}
/** Unoccupied gaps are candidates, never a service-specific availability promise. */
export function unoccupiedPeriods(state: SessionState, date: string, staffId: string, blocks = diaryBlocks(state, date)) {
  const occupied = blocks.filter(b => b.staffId === staffId && b.kind !== "closed").sort((a, b) => a.start - b.start);
  return dayPeriods(state.config.hours, date).flatMap(p => {
    const result: { start: number; end: number }[] = []; let cursor = p.opens;
    for (const b of occupied) {
      if (b.end <= cursor || b.start >= p.closes) continue;
      if (b.start > cursor) result.push({ start: cursor, end: Math.min(b.start, p.closes) });
      cursor = Math.max(cursor, b.end);
    }
    if (cursor < p.closes) result.push({ start: cursor, end: p.closes });
    return result;
  });
}
export function candidateMinute(state: SessionState, date: string, minute: number) {
  if (!Number.isInteger(state.config.startInterval) || state.config.startInterval <= 0) return minute;
  const period = dayPeriods(state.config.hours, date).find(p => minute >= p.opens && minute < p.closes);
  return period ? period.opens + Math.ceil((minute - period.opens) / state.config.startInterval) * state.config.startInterval : minute;
}
/** Density comes from available screen space, never the booking-start interval. */
export function boardTicks(start: number, end: number) {
  const step = Math.max(30, Math.ceil((end - start) / 6 / 30) * 30);
  const result = [start];
  for (let minute = Math.ceil(start / step) * step; minute < end; minute += step) if (minute > start && minute - start >= step / 2 && end - minute >= step / 2) result.push(minute);
  return [...result, end];
}
