import type { BusyInterval } from "../booking/availability";

export type SimulatedCalendarState = { connected: boolean; busy: BusyInterval | null };
/** The scheduling engine consumes normalized intervals, never provider events or
 * credentials. A future real adapter must be server-only and separately authorized;
 * OAuth connections, freshness and revocation cannot be inferred from this mock. */
export interface CalendarBusyAdapter {
  readonly kind: "simulated" | "production";
  busyIntervals(): readonly BusyInterval[];
}
export function simulatedCalendar(state: SimulatedCalendarState): CalendarBusyAdapter {
  return { kind: "simulated", busyIntervals: () => state.connected && state.busy ? [state.busy] : [] };
}
