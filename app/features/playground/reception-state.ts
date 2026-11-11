import type { PlaygroundSession } from "./session";

export type BookingSelection = { date: string; staffId: string; serviceId: string; minute: number };
/** One composer attempt, invalid across reset/expiry/configuration changes. */
export class ReceptionDraft {
  private readonly epoch: number;
  private readonly revision: number;
  private submitted = false;
  constructor(private session: PlaygroundSession) {
    this.epoch = session.getSnapshot().epoch; this.revision = session.getSnapshot().configRevision;
  }
  submit(selection: BookingSelection) {
    if (this.session.checkExpiry() || this.session.getSnapshot().epoch !== this.epoch || this.session.getSnapshot().phase !== "active") return "This composer expired or was reset. Open a new booking.";
    if (this.submitted) return "This booking has already been submitted.";
    if (this.session.getSnapshot().configRevision !== this.revision) return "Configuration changed. Close this composer and review a new booking.";
    const error = this.session.book(selection.date, selection.serviceId, selection.minute, selection.staffId);
    if (!error) this.submitted = true;
    return error;
  }
}
export type DetailsMode = "click" | "hover";
/** Cancel delayed previews on preference changes, dismissal and disposal. */
export class DetailPreviewController {
  mode: DetailsMode = "click";
  private timer: ReturnType<typeof setTimeout> | undefined;
  private dismissTimer: ReturnType<typeof setTimeout> | undefined;
  constructor(private show: (ids: string[] | null) => void) {}
  enter(ids: string[]) {
    this.keep(); if (this.mode !== "hover") return;
    clearTimeout(this.timer); this.timer = setTimeout(() => this.show(ids), 450);
  }
  keep() { clearTimeout(this.dismissTimer); }
  leave() { clearTimeout(this.timer); this.dismissTimer = setTimeout(() => this.show(null), 250); }
  dismiss(restoreFocus?: () => void) { this.dispose(); this.show(null); restoreFocus?.(); }
  preference(mode: DetailsMode) { this.mode = mode; this.dismiss(); }
  dispose() { clearTimeout(this.timer); clearTimeout(this.dismissTimer); }
}
export function clampPosition(point: { x: number; y: number }, viewport: { width: number; height: number }, size: { width: number; height: number }) {
  return { x: Math.max(12, Math.min(point.x, viewport.width - size.width - 12)), y: Math.max(12, Math.min(point.y, viewport.height - size.height - 12)) };
}

/** Pointer identity and offset survive rerenders; cancellation cannot continue a stale drag. */
export class DialogDrag {
  private active: { id: number; x: number; y: number } | null = null;
  start(id: number, pointer: { x: number; y: number }, origin: { x: number; y: number }) {
    this.active = { id, x: pointer.x - origin.x, y: pointer.y - origin.y };
  }
  move(id: number, pointer: { x: number; y: number }, viewport: { width: number; height: number }, size: { width: number; height: number }) {
    if (!this.active || this.active.id !== id) return null;
    return clampPosition({ x: pointer.x - this.active.x, y: pointer.y - this.active.y }, viewport, size);
  }
  stop() { this.active = null; }
}
