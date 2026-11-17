import { approvedBufferOverlap } from "./personnel";
import { dayPeriods } from "./scheduling";
import { diaryBlocks } from "./diary-projection";
import type { DiaryBlock } from "./diary-projection";
import type { SessionState } from "./session";

export type TimeTile = {
  start: number; end: number; period: number; blocks: DiaryBlock[]; detailIds: string[];
  appointmentIds: string[]; conflict: boolean; bookable: boolean | null;
  startOccupied: boolean; inProgress: boolean;
};
/** Buckets describe occupancy, never rounded bookings. Valid starts are supplied by the shared adapter. */
export function timeTiles(state: SessionState, date: string, staffId: string,
  validStarts?: readonly { startMinute: number; staffId: string }[], now?: number): TimeTile[] {
  const interval = state.config.startInterval;
  if (!Number.isInteger(interval) || interval < 1 || interval > 1440) return [];
  const all = diaryBlocks(state, date).filter(b => b.staffId === staffId);
  const starts = new Set(validStarts?.filter(s => s.staffId === staffId).map(s => s.startMinute));
  return dayPeriods(state.config.hours, date).flatMap((p, period) => {
    const result: TimeTile[] = [];
    for (let start = p.opens; start < p.closes; start += interval) {
      const end = Math.min(start + interval, p.closes);
      const blocks = all.filter(b => b.kind !== "closed" && b.start < end && start < b.end);
      const appointmentIds = [...new Set(blocks.flatMap(b => b.appointmentId ? [b.appointmentId] : []))];
      // Expand every covered portion to the same appointment plus exact buffer details.
      const detailIds = all.filter(b => appointmentIds.includes(b.appointmentId ?? "") || blocks.some(x => x.id === b.id)).map(b => b.id);
      const conflict = blocks.some(a => all.some(b => a.id !== b.id && !approvedBufferOverlap(state, a, b) && Math.max(start, a.start, b.start) < Math.min(end, a.end, b.end)));
      const inProgress = now !== undefined && state.appointments.some(a => appointmentIds.includes(a.id) && now >= a.start && now < a.start + a.durationMinutes * 60_000);
      result.push({ start, end, period, blocks, detailIds, appointmentIds, conflict,
        bookable: validStarts === undefined ? null : starts.has(start),
        startOccupied: blocks.some(b => b.start <= start && start < b.end), inProgress });
    }
    return result;
  });
}
export function tileStatus(tile: TimeTile) {
  const states: string[] = [];
  if (tile.conflict) states.push("CONFLICT");
  if (tile.blocks.some(b => b.kind === "appointment")) states.push(tile.inProgress ? "In progress" : "Booked");
  if (tile.blocks.some(b => b.kind === "buffer")) states.push("Buffer");
  if (tile.blocks.some(b => b.kind === "busy")) states.push("Busy");
  if (states.length && tile.bookable === true) states.push("Bookable start");
  if (!states.length) states.push(tile.bookable === null ? "Choose service" : tile.bookable ? "Bookable start" : "Not bookable");
  return states.join(" / ");
}
export function tileAction(tile: TimeTile): { kind: "details"; ids: string[] } | { kind: "compose"; minute: number } | { kind: "none" } {
  if (tile.blocks.length) return { kind: "details", ids: tile.detailIds };
  if (tile.bookable !== false) return { kind: "compose", minute: tile.start };
  return { kind: "none" };
}
/** Grouping changes presentation only. Every exact start remains in one group, in order. */
export function groupTimeTiles(tiles: TimeTile[], limit = 32): TimeTile[][] {
  const periods = new Set(tiles.map(t => t.period)).size;
  const size = Math.max(periods > 3 ? 2 : 1, Math.ceil(tiles.length / Math.max(1, Math.floor(limit))));
  const groups: TimeTile[][] = [];
  for (let i = 0; i < tiles.length; i += size) groups.push(tiles.slice(i, i + size));
  return groups;
}
export function bookingCount(tiles: TimeTile[]) { return new Set(tiles.flatMap(t => t.appointmentIds)).size; }
/** A grouping budget, not a fixed-height promise: wrapped cards remain scrollable. */
export function tileDisplayLimit(width: number, height: number, measuredHeight: number, headerHeight: number) {
  const columns = Math.max(1, Math.floor((width + 6) / 146));
  const rows = Math.max(1, Math.floor((height - headerHeight - 68) / (Math.max(76, measuredHeight) + 6)));
  return Math.min(48, Math.max(4, columns * rows));
}
