import { useEffect, useId, useRef, useState, useSyncExternalStore } from "react";
import type { ReactNode } from "react";
import { createPortal } from "react-dom";
import { clampPosition, DialogDrag } from "./reception-state";
import { pinEscapeAllowed } from "./pinned-state";
import type { FloatingPin, PinnedPanels } from "./pinned-state";

export function FloatingPanel({ pin, manager, title, active, visible = true, index, close, children }: {
  pin: FloatingPin; manager: PinnedPanels; title: string; active: boolean; visible?: boolean; index: number; close: () => void; children: ReactNode;
}) {
  const root = useRef<HTMLElement>(null), handle = useRef<HTMLElement>(null), drag = useRef(new DialogDrag());
  const pointer = useRef<number | null>(null), titleId = useId();
  const [dragging, setDragging] = useState(false);
  const move = (x: number, y: number) => { if (root.current) manager.position(pin.key, clampPosition({ x, y }, { width: window.innerWidth, height: window.innerHeight }, root.current.getBoundingClientRect())); };
  const stop = () => {
    drag.current.stop(); setDragging(false);
    if (pointer.current !== null && handle.current?.hasPointerCapture(pointer.current)) handle.current.releasePointerCapture(pointer.current);
    pointer.current = null;
  };
  useEffect(() => {
    const fit = () => { stop(); const p = manager.getSnapshot().find(p => p.key === pin.key); if (p) move(p.point.x, p.point.y); };
    fit(); window.addEventListener("resize", fit); window.addEventListener("blur", stop);
    const observer = new ResizeObserver(fit); if (root.current) observer.observe(root.current);
    // A newly opened real modal must also release a pin's captured pointer.
    const modal = new MutationObserver(() => { if (document.querySelector("dialog[open]")) stop(); });
    modal.observe(document.body, { subtree: true, attributes: true, attributeFilter: ["open"] });
    return () => { stop(); observer.disconnect(); modal.disconnect(); window.removeEventListener("resize", fit); window.removeEventListener("blur", stop); };
  }, [manager, pin.key]);
  useEffect(() => { if (visible && active && !document.querySelector("dialog[open]")) handle.current?.focus({ preventScroll: true }); }, [pin.request, visible]);
  return <section ref={root} role="region" aria-labelledby={titleId} data-floating-pin data-active={active} data-dragging={dragging || undefined}
    className="floating-pin" style={{ left: pin.point.x, top: pin.point.y, zIndex: 60 + index }}
    onPointerDownCapture={() => manager.focus(pin.key)} onFocusCapture={() => manager.focus(pin.key)}
    onKeyDown={e => { if (e.key === "Escape" && !document.querySelector("dialog[open]")) { e.preventDefault(); e.stopPropagation(); stop(); close(); } }}>
    <header ref={handle} tabIndex={0} className="floating-pin-handle" aria-label={`Move ${title}: arrow keys; Home to recentre; Escape to close`}
      onPointerDown={e => {
        if (e.button !== 0 || (e.target as HTMLElement).closest("button") || window.matchMedia("(max-width: 767px), (pointer: coarse)").matches) return;
        e.preventDefault(); e.stopPropagation(); e.currentTarget.focus({ preventScroll: true });
        const box = root.current!.getBoundingClientRect(); drag.current.start(e.pointerId, { x: e.clientX, y: e.clientY }, { x: box.left, y: box.top });
        pointer.current = e.pointerId; e.currentTarget.setPointerCapture(e.pointerId); setDragging(true);
      }} onPointerMove={e => {
        const point = drag.current.move(e.pointerId, { x: e.clientX, y: e.clientY }, { width: window.innerWidth, height: window.innerHeight }, root.current!.getBoundingClientRect());
        if (point) { e.preventDefault(); manager.position(pin.key, point); }
      }} onPointerUp={stop} onPointerCancel={stop} onLostPointerCapture={stop}
      onKeyDown={e => {
        if (e.target !== e.currentTarget || !["ArrowLeft", "ArrowRight", "ArrowUp", "ArrowDown", "Home"].includes(e.key)) return;
        e.preventDefault(); e.stopPropagation(); const box = root.current!.getBoundingClientRect();
        if (e.key === "Home") move((window.innerWidth - box.width) / 2, (window.innerHeight - box.height) / 2);
        else move(box.left + (e.key === "ArrowLeft" ? -20 : e.key === "ArrowRight" ? 20 : 0), box.top + (e.key === "ArrowUp" ? -20 : e.key === "ArrowDown" ? 20 : 0));
      }}>
      <h2 id={titleId}>{title}</h2><button type="button" onClick={close}>Close</button>
    </header>
    <div className="pin-position-controls">{["Dock left", "Recentre", "Dock right"].map((label, i) => <button type="button" key={label} onClick={() => {
      const box = root.current!.getBoundingClientRect(); move(i === 0 ? 12 : i === 2 ? window.innerWidth - box.width - 12 : (window.innerWidth - box.width) / 2, (window.innerHeight - box.height) / 2);
    }}>{label}</button>)}<span>Drag header or use arrow keys.</span></div>
    <div className="floating-pin-content">{children}</div>
  </section>;
}
export function FloatingPins({ manager, title, children }: { manager: PinnedPanels; title: (pin: FloatingPin) => string; children: (pin: FloatingPin) => ReactNode }) {
  const pins = useSyncExternalStore(manager.subscribe, manager.getSnapshot, manager.getSnapshot);
  const [minimized, setMinimized] = useState(false), tray = useRef<HTMLElement>(null);
  const active = pins.at(-1), request = active?.request;
  useEffect(() => { setMinimized(false); }, [request]);
  const restore = (pin?: FloatingPin) => {
    const next = manager.getSnapshot().at(-1);
    if (next) manager.focus(next.key, true);
    else (pin?.opener?.isConnected ? pin.opener : document.querySelector<HTMLElement>("[data-reception-new-booking]"))?.focus({ preventScroll: true });
  };
  const close = (pin: FloatingPin) => { manager.close(pin.key); restore(pin); };
  useEffect(() => {
    const escape = (e: KeyboardEvent) => {
      if (!pinEscapeAllowed(e.key, e.defaultPrevented, !!document.querySelector("dialog[open]"), !!document.activeElement?.closest("[data-floating-pin]"))) return;
      const active = manager.getSnapshot().at(-1); if (!active) return;
      e.preventDefault(); close(active);
    };
    document.addEventListener("keydown", escape); return () => document.removeEventListener("keydown", escape);
  }, [manager]);
  if (!pins.length || typeof document === "undefined") return null;
  return createPortal(<div className="floating-pins" data-minimized={minimized || undefined}>
    <nav ref={tray} tabIndex={-1} className="pin-tray" aria-label="Pinned items">
      <label>Pins ({pins.length}/8) <select value={active?.key ?? ""} onChange={e => { manager.focus(e.target.value, true); setMinimized(false); }}>{pins.map(p => <option key={p.key} value={p.key}>{title(p)}</option>)}</select></label>
      <button type="button" onClick={() => { setMinimized(v => !v); tray.current?.focus(); }}>{minimized ? "Show pins" : "Minimise pins"}</button>
      <button type="button" onClick={() => { manager.clear(); restore(); }}>Close all</button>
    </nav>
    {pins.map((p, i) => <FloatingPanel key={p.key} pin={p} manager={manager} title={title(p)} index={i} active={p.key === active?.key} visible={!minimized} close={() => close(p)}>{children(p)}</FloatingPanel>)}
  </div>, document.body);
}
