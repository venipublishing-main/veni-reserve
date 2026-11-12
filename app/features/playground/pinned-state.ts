import type { PlaygroundSession, SessionState } from "./session";
import type { ComposerSeed } from "./reception-composer";
import { minutesLabel } from "../demo/booking";
import { diaryBlocks } from "./diary-projection";

export type PinRef = { kind: "appointment" | "buffer"; id: string; date: string } |
  { kind: "busy"; id: string; date: string; busy: NonNullable<SessionState["calendar"]["busy"]> };
export type PinSource = { kind: "day"; date: string } | { kind: "records"; refs: PinRef[]; candidate?: ComposerSeed };
export type FloatingPin = { key: string; source: PinSource; point: { x: number; y: number }; request: number; opener: HTMLElement | null };
export const MAX_PINS = 8;
export function pinKey(source: PinSource) {
  return source.kind === "day" ? `day:${source.date}` : JSON.stringify(source.refs.map(r => `${r.kind}:${r.id}`).sort());
}
/** The UI stores references, never copies of live appointment detail records. */
export class PinnedPanels {
  private state: readonly FloatingPin[] = [];
  private listeners = new Set<() => void>();
  private busyIds = new WeakMap<object, string>();
  private serial = 0;
  private epoch: number;
  constructor(epoch: number) { this.epoch = epoch; }
  getSnapshot = () => this.state;
  subscribe = (fn: () => void) => { this.listeners.add(fn); return () => { this.listeners.delete(fn); }; };
  private emit(next: readonly FloatingPin[]) { this.state = next; this.listeners.forEach(fn => fn()); }
  sync(epoch: number) { if (epoch !== this.epoch) { this.epoch = epoch; this.clear(); } }
  references(state: SessionState, date: string, ids: string[]): PinRef[] {
    const blocks = diaryBlocks(state, date), refs: PinRef[] = [];
    for (const id of [...new Set(ids)]) {
      const b = blocks.find(b => b.id === id); if (!b || b.kind === "closed") continue;
      if (b.appointmentId) {
        if (b.kind === "buffer" && ids.includes(b.appointmentId)) continue;
        refs.push({ kind: b.kind === "buffer" ? "buffer" : "appointment", id: b.appointmentId, date });
      } else if (b.kind === "busy" && state.calendar.busy) {
        const busy = state.calendar.busy;
        let key = this.busyIds.get(busy); if (!key) { key = `busy-${++this.serial}`; this.busyIds.set(busy, key); }
        refs.push({ kind: "busy", id: key, date, busy });
      }
    }
    return refs;
  }
  open(source: PinSource, opener: HTMLElement | null) {
    const key = pinKey(source);
    if (this.state.some(p => p.key === key)) { this.focus(key, true); return null; }
    if (this.state.length >= MAX_PINS) return `Up to ${MAX_PINS} pins can be compared. Close a pin or use Close all before opening another.`;
    this.emit([...this.state, { key, source, opener, point: { x: 24 + this.state.length * 44, y: 80 + this.state.length * 34 }, request: ++this.serial }]);
    return null;
  }
  focus(key: string, request = false) {
    const p = this.state.find(p => p.key === key); if (!p || (!request && this.state.at(-1) === p)) return;
    this.emit([...this.state.filter(p => p.key !== key), request ? { ...p, request: ++this.serial } : p]);
  }
  position(key: string, point: { x: number; y: number }) {
    const p = this.state.find(p => p.key === key); if (!p || (p.point.x === point.x && p.point.y === point.y)) return;
    this.emit(this.state.map(p => p.key === key ? { ...p, point } : p));
  }
  close(key: string) { this.emit(this.state.filter(p => p.key !== key)); }
  clear() { this.emit([]); }
}
export function resolvePinRef(state: SessionState, ref: PinRef) {
  if (ref.kind === "busy") return { date: ref.date, blocks: state.calendar.connected && state.calendar.busy === ref.busy ? diaryBlocks(state, ref.date).filter(b => b.kind === "busy") : [] };
  const a = state.appointments.find(a => a.id === ref.id);
  return { date: a?.date ?? ref.date, blocks: a ? diaryBlocks(state, a.date).filter(b => b.appointmentId === a.id && (ref.kind === "appointment" || b.kind === "buffer")) : [] };
}
export function pinTitle(state: SessionState, source: PinSource) {
  if (source.kind === "day") return `Day summary: ${source.date}`;
  return source.refs.map(r => {
    const a = r.kind === "busy" ? undefined : state.appointments.find(a => a.id === r.id);
    return `${r.kind === "buffer" ? "Buffer" : r.kind === "busy" ? "Busy" : "Appointment"}: ${resolvePinRef(state, r).date}${a ? ` ${minutesLabel(a.startMinute)} / ${a.staffName}` : ""}`;
  }).join(" / ");
}
export function monthBookingSeed(state: SessionState, date: string, serviceId: string, actorId: string): ComposerSeed {
  const service = state.config.services.find(s => s.id === serviceId);
  const person = state.config.staff.find(p => !service || service.eligibleStaffIds.includes(p.id));
  return { date, staffId: person?.id ?? "", serviceId: service?.id, actorId: state.config.people.some(p => p.id === actorId) ? actorId : "" };
}

// Weak ownership lasts through Reception/configuration navigation, never reload/storage.
const sessionPins = new WeakMap<PlaygroundSession, PinnedPanels>();
export function pinsForSession(session: PlaygroundSession) {
  let pins = sessionPins.get(session);
  if (!pins) {
    pins = new PinnedPanels(session.getSnapshot().epoch); sessionPins.set(session, pins);
    const manager = pins;
    session.subscribe(() => manager.sync(session.getSnapshot().epoch));
  }
  pins.sync(session.getSnapshot().epoch); return pins;
}
export function pinEscapeAllowed(key: string, prevented: boolean, modalOpen: boolean, insidePanel: boolean) {
  return key === "Escape" && !prevented && !modalOpen && !insidePanel;
}
