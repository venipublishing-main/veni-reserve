import { dayPeriods } from "./scheduling";
import { diaryBlocks } from "./diary-projection";
import type { DiaryBlock } from "./diary-projection";
import type { SessionState } from "./session";
/** Week uses one linear business-clock scale; no independently compressed breaks. */
export function clockScale(state: SessionState, date: string, range: { start: number; end: number }, pitch: number): ReturnType<typeof dayScale> {
  const rate = pitch / Math.max(1, state.config.startInterval);
  const position = (minute: number) => (minute - range.start) * rate;
  const periods = dayPeriods(state.config.hours, date);
  const cuts = [...new Set([range.start, range.end, ...periods.flatMap(p => [Math.max(range.start, p.opens), Math.min(range.end, p.closes)])])].filter(m => m >= range.start && m <= range.end).sort((a, b) => a - b);
  const parts = cuts.slice(0, -1).map((start, i) => ({ start, end: cuts[i + 1], top: position(start), height: (cuts[i + 1] - start) * rate, closed: !periods.some(p => start >= p.opens && cuts[i + 1] <= p.closes) }));
  return { parts, height: position(range.end), position, minuteAt: pixel => range.start + pixel / rate };
}

export function dayScale(state: SessionState, date: string, pitch: number) {
  const parts: { start: number; end: number; top: number; height: number; closed: boolean }[] = [];
  let top = 0, previous: number | undefined;
  const interval = state.config.startInterval;
  if (!Number.isInteger(interval) || interval < 1 || interval > 1440) return { parts, height: 0, position: () => 0, minuteAt: () => 0 };
  for (const p of dayPeriods(state.config.hours, date)) {
    if (previous !== undefined && previous < p.opens) { parts.push({ start: previous, end: p.opens, top, height: 24, closed: true }); top += 24; }
    for (let minute = p.opens; minute < p.closes; minute += interval) {
      parts.push({ start: minute, end: Math.min(minute + interval, p.closes), top, height: pitch, closed: false }); top += pitch;
    }
    previous = p.closes;
  }
  const position = (minute: number) => {
    const part = parts.find(p => minute >= p.start && minute < p.end);
    if (part) return part.top + (minute - part.start) / (part.end - part.start) * part.height;
    return !parts.length || minute < parts[0].start ? 0 : top;
  };
  const minuteAt = (pixel: number) => {
    const part = parts.find(p => pixel >= p.top && pixel < p.top + p.height);
    if (part) return part.start + (pixel - part.top) / part.height * (part.end - part.start);
    return !parts.length ? 0 : pixel < 0 ? parts[0].start : parts.at(-1)!.end;
  };
  return { parts, height: top, position, minuteAt };
}
export type BookingSpan = { block: DiaryBlock; lane: number; lanes: number; detailIds: string[] };
/** Allocate a whole appointment+buffer as one unit, across the full day (never per row/range). */
export function bookingSpans(state: SessionState, date: string): BookingSpan[] {
  const blocks = diaryBlocks(state, date).filter(b => b.kind !== "closed");
  const result: BookingSpan[] = [];
  for (const staffId of new Set(blocks.map(b => b.staffId))) {
    const units = new Map<string, DiaryBlock[]>();
    for (const b of blocks.filter(b => b.staffId === staffId)) { const key = b.appointmentId ?? b.id; units.set(key, [...(units.get(key) ?? []), b]); }
    const ordered = [...units.values()].sort((a, b) => Math.min(...a.map(x => x.start)) - Math.min(...b.map(x => x.start)) || a[0].id.localeCompare(b[0].id));
    const ends: number[] = [], assigned: { items: DiaryBlock[]; lane: number }[] = [];
    for (const items of ordered) {
      const start = Math.min(...items.map(b => b.start)), end = Math.max(...items.map(b => b.end));
      let lane = ends.findIndex(t => t <= start); if (lane < 0) lane = ends.length;
      ends[lane] = end; assigned.push({ items, lane });
    }
    for (const { items, lane } of assigned) for (const block of items) result.push({ block, lane, lanes: ends.length, detailIds: items.map(b => b.id) });
  }
  return result;
}
export function spanBounds(span: BookingSpan, scale: ReturnType<typeof dayScale>, range: { start: number; end: number }) {
  const b = span.block, start = Math.max(b.start, range.start), end = Math.min(b.end, range.end);
  if (start >= end) return null;
  return { top: scale.position(start) - scale.position(range.start), height: scale.position(end) - scale.position(start),
    continuedBefore: b.start < range.start, continuedAfter: b.end > range.end };
}
