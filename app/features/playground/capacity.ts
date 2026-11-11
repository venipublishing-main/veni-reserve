import type { PlaygroundSession, SessionState } from "./session";
import { timeTiles } from "./time-tiles";
import type { TimeTile } from "./time-tiles";
export type CapacityCell = { staffId: string; tile: TimeTile; serviceId?: string; available: boolean; status: string };
export type CapacityRow = { start: number; end: number; period: number; cells: CapacityCell[] };
/** Capacity is one position per practitioner, not one position per eligible service. */
export function capacityRows(session: Pick<PlaygroundSession, "slots">, state: SessionState, date: string, serviceId = "", now?: number): CapacityRow[] {
  const rows: CapacityRow[] = [];
  for (const person of state.config.staff) {
    const services = state.config.services.filter(s => !serviceId || s.id === serviceId);
    const starts = new Map<number, string>();
    for (const service of services) for (const slot of session.slots(date, service.id, person.id)) if (slot.staffId === person.id && !starts.has(slot.startMinute)) starts.set(slot.startMinute, service.id);
    const tiles = timeTiles(state, date, person.id, [...starts.keys()].map(startMinute => ({ startMinute, staffId: person.id })), now);
    tiles.forEach((tile, i) => {
      // A partial occupied bucket stays coloured, even if a short exact start can fit.
      const available = starts.has(tile.start);
      const kinds = new Set(tile.blocks.map(b => b.kind));
      const status = tile.conflict ? "CONFLICT" : kinds.has("appointment") ? (tile.inProgress ? "In progress" : "Booked") : kinds.has("busy") ? "Busy" : kinds.has("buffer") ? "Buffer" : available ? "Available" : "Blocked";
      rows[i] ??= { start: tile.start, end: tile.end, period: tile.period, cells: [] };
      rows[i].cells.push({ staffId: person.id, tile, serviceId: starts.get(tile.start), available, status });
    });
  }
  return rows;
}
export function groupCapacityRows(rows: CapacityRow[], limit: number): CapacityRow[][] {
  const size = Math.max(1, Math.ceil(rows.length / Math.max(1, Math.floor(limit))));
  return Array.from({ length: Math.ceil(rows.length / size) }, (_, i) => rows.slice(i * size, (i + 1) * size));
}
export function capacityPage<T>(people: T[], page: number, pageSize: number) {
  const size = Math.max(1, Math.floor(pageSize)), pages = Math.max(1, Math.ceil(people.length / size));
  const index = Math.max(0, Math.min(Math.floor(page), pages - 1));
  return { items: people.slice(index * size, (index + 1) * size), index, pages, total: people.length };
}
export function capacitySummary(rows: CapacityRow[]) {
  return { available: rows.reduce((n, r) => n + r.cells.filter(c => c.available).length, 0),
    bookings: new Set(rows.flatMap(r => r.cells.flatMap(c => c.tile.appointmentIds))).size,
    conflict: rows.some(r => r.cells.some(c => c.tile.conflict)),
    buffers: rows.some(r => r.cells.some(c => c.tile.blocks.some(b => b.kind === "buffer"))),
    busy: rows.some(r => r.cells.some(c => c.tile.blocks.some(b => b.kind === "busy"))) };
}

/** The owner-facing white affordance is existential, not a practitioner capacity count. */
export function rowAvailability(row: CapacityRow) {
  const choices = row.cells.filter(c => c.available && c.serviceId);
  return { available: choices.length > 0, choices, occupied: row.cells.filter(c => c.tile.blocks.length > 0) };
}
/** Strict scheduler choices for the aggregate white-cell composer, never buffer overrides. */
export function availablePeople(session: Pick<PlaygroundSession, "slots">, state: SessionState, date: string, serviceId: string, minute: number) {
  return state.config.staff.filter(p => session.slots(date, serviceId, p.id).some(s => s.staffId === p.id && (minute < 0 || s.startMinute === minute)));
}
