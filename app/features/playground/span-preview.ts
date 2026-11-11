import type { FocusEvent, PointerEvent, MouseEvent } from "react";
import { DetailPreviewController } from "./reception-state";

/** The exact handlers used by BOTH span surfaces; independently testable without browser automation. */
export class SpanPreviewInteraction {
  private timer: DetailPreviewController;
  private pending = false;
  private active = false;
  private mode: "click" | "hover" = "click";
  private suppressed: HTMLElement | null = null;
  private restoring = false;
  trigger: HTMLElement | null = null;
  ids: string[] = [];
  constructor(private show: (ids: string[] | null) => void, private previewContains: (target: EventTarget | null) => boolean) {
    this.timer = new DetailPreviewController(ids => { this.pending = false; this.active = !!ids; this.show(ids); });
  }
  preference(mode: "click" | "hover") { this.mode = mode; this.timer.preference(mode); this.pending = false; }
  private enter(ids: string[], target: HTMLElement) {
    if (this.mode !== "hover" || this.suppressed === target) return;
    this.trigger = target; this.ids = ids; this.pending = true; this.timer.enter(ids);
  }
  dismiss(restore = false) {
    const trigger = this.trigger; this.suppressed = trigger; this.pending = false; this.timer.dismiss();
    if (restore && trigger?.isConnected) { this.restoring = true; trigger.focus({ preventScroll: true }); this.restoring = false; }
  }
  escape(event: { key: string; preventDefault: () => void; stopPropagation: () => void; stopImmediatePropagation?: () => void }) {
    if (event.key !== "Escape" || (!this.active && !this.pending)) return false;
    event.preventDefault(); event.stopPropagation(); event.stopImmediatePropagation?.(); this.dismiss(true); return true;
  }
  handlers(ids: string[], pin: (ids: string[], target: HTMLElement) => void) {
    return {
      onPointerEnter: (e: PointerEvent<HTMLElement>) => { if (e.pointerType !== "touch") this.enter(ids, e.currentTarget); },
      onPointerLeave: (e: PointerEvent<HTMLElement>) => { if (this.suppressed === e.currentTarget) this.suppressed = null; if (!e.currentTarget.contains(typeof document === "undefined" ? null : document.activeElement)) this.timer.leave(); },
      onFocus: (e: FocusEvent<HTMLElement>) => { if (!this.restoring) { this.suppressed = null; this.enter(ids, e.currentTarget); } },
      onBlur: (e: FocusEvent<HTMLElement>) => { if (!this.previewContains(e.relatedTarget)) this.timer.leave(); },
      onClick: (e: MouseEvent<HTMLElement>) => { this.dismiss(); pin(ids, e.currentTarget); },
    };
  }
  keep = () => this.timer.keep();
  leave = () => this.timer.leave();
  dispose() { this.timer.dispose(); this.pending = false; this.active = false; }
}
