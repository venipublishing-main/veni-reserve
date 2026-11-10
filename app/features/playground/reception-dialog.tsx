import { useEffect, useRef, useState } from "react";
import type { ReactNode } from "react";
import { clampPosition } from "./reception-state";

export function ReceptionDialog({ title, children, onClose, movable = false, returnFocus }: {
  title: string; children: ReactNode; onClose: () => void; movable?: boolean; returnFocus: HTMLElement | null;
}) {
  const ref = useRef<HTMLDialogElement>(null);
  const [point, setPoint] = useState<{ x: number; y: number } | null>(null);
  const drag = useRef<{ x: number; y: number } | null>(null);
  const move = (x: number, y: number) => {
    const box = ref.current!.getBoundingClientRect();
    setPoint(clampPosition({ x, y }, { width: window.innerWidth, height: window.innerHeight }, box));
  };
  useEffect(() => {
    const dialog = ref.current!; dialog.showModal();
    const fit = () => {
      const box = dialog.getBoundingClientRect();
      setPoint(old => clampPosition(old ?? { x: (window.innerWidth - box.width) / 2, y: (window.innerHeight - box.height) / 2 }, { width: window.innerWidth, height: window.innerHeight }, box));
    };
    fit(); window.addEventListener("resize", fit);
    const observer = typeof ResizeObserver === "undefined" ? null : new ResizeObserver(fit); observer?.observe(dialog);
    return () => {
      observer?.disconnect(); window.removeEventListener("resize", fit); dialog.close();
      const fallback = document.querySelector<HTMLElement>("[data-reception-new-booking]");
      (returnFocus?.isConnected ? returnFocus : fallback)?.focus({ preventScroll: true });
    };
  }, [returnFocus]);
  return <dialog ref={ref} aria-labelledby="reception-dialog-title" className="reception-dialog rounded-2xl border border-slate-300 bg-white text-slate-900 shadow-2xl"
    style={point ? { left: point.x, top: point.y } : undefined} onCancel={e => { e.preventDefault(); onClose(); }}>
    <header className={`flex items-center justify-between gap-3 border-b bg-slate-50 p-3 ${movable ? "reception-drag-handle" : ""}`}
      tabIndex={movable ? 0 : undefined} aria-label={movable ? "Move booking window with arrow keys or drag; reposition controls below" : undefined}
      onPointerDown={e => {
        if (!movable || e.pointerType === "touch" || !window.matchMedia("(min-width: 768px)").matches || (e.target as HTMLElement).closest("button")) return;
        e.preventDefault(); const box = ref.current!.getBoundingClientRect(); drag.current = { x: e.clientX - box.left, y: e.clientY - box.top }; e.currentTarget.setPointerCapture(e.pointerId);
      }} onPointerMove={e => { if (drag.current) move(e.clientX - drag.current.x, e.clientY - drag.current.y); }}
      onPointerUp={() => { drag.current = null; }} onPointerCancel={() => { drag.current = null; }}
      onKeyDown={e => {
        if (!movable || e.target !== e.currentTarget || !["ArrowLeft", "ArrowRight", "ArrowUp", "ArrowDown"].includes(e.key)) return;
        e.preventDefault(); const box = ref.current!.getBoundingClientRect(); move(box.left + (e.key === "ArrowLeft" ? -20 : e.key === "ArrowRight" ? 20 : 0), box.top + (e.key === "ArrowUp" ? -20 : e.key === "ArrowDown" ? 20 : 0));
      }}>
      <h2 id="reception-dialog-title" className="text-lg font-semibold">{title}</h2><button type="button" className="rounded-lg border bg-white px-3 py-2" onClick={onClose}>Close</button>
    </header>
    {movable && <div className="hidden gap-2 border-b px-4 py-2 text-sm md:flex">{["Dock left", "Recentre", "Dock right"].map((label, i) => <button className="rounded border px-2 py-1" type="button" key={label} onClick={() => {
      const box = ref.current!.getBoundingClientRect(); move(i === 0 ? 12 : i === 1 ? (window.innerWidth - box.width) / 2 : window.innerWidth - box.width - 12, (window.innerHeight - box.height) / 2);
    }}>{label}</button>)}</div>}
    <div className="space-y-4 p-4">{children}</div>
  </dialog>;
}
