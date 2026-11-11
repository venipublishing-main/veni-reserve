import { useEffect, useLayoutEffect, useRef, useState } from "react";
import { minutesLabel } from "../demo/booking";
import { bookingSpans, dayScale, spanBounds } from "./booking-spans";
import { rowAvailability } from "./capacity";
import type { CapacityRow } from "./capacity";
import type { SessionState } from "./session";
import { staffTheme } from "./personnel";
import { SpanPreviewInteraction } from "./span-preview";

export type SpanSurfaceProps = {
  state: SessionState; rows: CapacityRow[]; people: string[]; range: { start: number; end: number };
  pitch: number; mode: "click" | "hover"; scope: "day" | "range"; now?: number;
  pin: (ids: string[], target: HTMLElement) => void;
  book: (row: CapacityRow, target: HTMLElement) => void;
};
/** The same geometry AND event wiring live inside the active surface, including native dialogs. */
export function BookingSpanSurface({ state, rows, people, range, pitch, mode, scope, now, pin, book }: SpanSurfaceProps) {
  const root = useRef<HTMLDivElement>(null), previewRef = useRef<HTMLElement>(null);
  const [preview, setPreview] = useState<string[] | null>(null);
  const [point, setPoint] = useState({ x: 12, y: 12 });
  const [controller] = useState(() => new SpanPreviewInteraction(setPreview, target => target instanceof Node && !!previewRef.current?.contains(target)));
  useEffect(() => { controller.preference(mode); }, [controller, mode]);
  useEffect(() => { controller.dismiss(); }, [controller, state.appointments, state.calendar]);
  useLayoutEffect(() => {
    if (!preview || !controller.trigger) return;
    const anchor = controller.trigger.getBoundingClientRect(), dialog = root.current?.closest("dialog")?.getBoundingClientRect();
    const left = dialog ? dialog.left + 12 : 12, right = dialog ? dialog.right - 12 : window.innerWidth - 12;
    const top = dialog ? dialog.top + 12 : 12, bottom = dialog ? dialog.bottom - 12 : window.innerHeight - 12;
    setPoint({ x: Math.max(left, Math.min(anchor.right + 4, right - 300)), y: Math.max(top, Math.min(anchor.top, bottom - 220)) });
  }, [preview, controller]);
  useEffect(() => {
    const escape = (e: KeyboardEvent) => controller.escape(e);
    const outside = (e: PointerEvent) => { if (e.target instanceof Node && !root.current?.contains(e.target)) controller.dismiss(); };
    document.addEventListener("keydown", escape, true); document.addEventListener("pointerdown", outside, true);
    return () => { controller.dispose(); document.removeEventListener("keydown", escape, true); document.removeEventListener("pointerdown", outside, true); };
  }, [controller]);
  const spans = bookingSpans(state, state.diaryDate), scale = dayScale(state, state.diaryDate, pitch);
  const origin = scale.position(range.start), height = scale.position(range.end) - origin;
  const shown = spans.filter(s => people.includes(s.block.staffId) && spanBounds(s, scale, range));
  const omitted = spans.filter(s => !people.includes(s.block.staffId) && state.config.staff.some(p => p.id === s.block.staffId) && spanBounds(s, scale, range));
  return <div ref={root} className="span-surface" data-preview-scope={scope}>
    {omitted.length > 0 && <p className="text-xs">Other people pages: {new Set(omitted.map(s => s.block.appointmentId ?? s.block.id)).size} occupied items{omitted.some(s => s.block.conflict) ? " / CONFLICT" : ""}. Shared availability includes them.</p>}
    <div className="span-lane-headings" style={{ gridTemplateColumns: `80px repeat(${people.length}, minmax(0, 1fr))` }}><span>Start</span>{people.map(id => <span key={id} style={staffTheme(state.config, id)} className="capacity-person"><i />{state.config.staff.find(p => p.id === id)?.name}</span>)}</div>
    <div className="span-grid" style={{ height }}>
      {scale.parts.filter(p => p.closed && p.start >= range.start && p.end <= range.end).map(p => <div key={p.start} className="span-break" style={{ top: p.top - origin, height: p.height }}>Closed {minutesLabel(p.start)}-{minutesLabel(p.end)}</div>)}
      {rows.filter(r => r.start >= range.start && r.start < range.end).map(row => {
        const a = rowAvailability(row);
        return <button key={row.start} type="button" data-time={row.start} data-state={a.available ? "Available" : "Blocked"} data-aggregate={a.available || undefined}
          className="capacity-cell span-time" style={{ top: scale.position(row.start) - origin, height: pitch - 2 }} disabled={!a.available}
          aria-label={`${minutesLabel(row.start)}: ${a.available ? `${a.choices.length} eligible practitioners; choose service and practitioner` : "no valid start"}`}
          onClick={e => { controller.dismiss(); book(row, e.currentTarget); }}><time>{minutesLabel(row.start)}</time></button>;
      })}
      <div className="span-people">
        {people.map(id => <div className="span-person-lane" key={id} style={{ width: `${100 / people.length}%` }}>
          {shown.filter(s => s.block.staffId === id).map(s => {
            const b = s.block, bounds = spanBounds(s, scale, range)!;
            const appointment = state.appointments.find(a => a.id === b.appointmentId);
            const inProgress = now !== undefined && appointment && now >= appointment.start && now < appointment.start + appointment.durationMinutes * 60_000;
            const status = b.kind === "buffer" ? "Buffer" : b.kind === "busy" ? "Busy" : inProgress ? "In progress" : "Booked";
            const label = `${minutesLabel(b.start)}-${minutesLabel(b.end)} ${status}: ${b.label}${b.conflict ? " / CONFLICT" : ""}`;
            return <button key={b.id} type="button" className="booking-span" data-block-id={b.id} data-appointment={b.appointmentId} data-staff={id} data-state={status} data-conflict={b.conflict || undefined}
              style={{ ...staffTheme(state.config, id), top: bounds.top, height: bounds.height, left: `${s.lane * 100 / s.lanes}%`, width: `${100 / s.lanes}%` }}
              aria-label={`${label}${bounds.continuedBefore ? "; continues from earlier range" : ""}${bounds.continuedAfter ? "; continues in next range" : ""}`} title={label}
              {...controller.handlers(s.detailIds, pin)}>
              <span>{bounds.continuedBefore ? "↑ " : ""}{bounds.height < 32 ? `${b.conflict ? "! " : ""}${status} ` : ""}{minutesLabel(b.start)}-{minutesLabel(b.end)}{bounds.continuedAfter ? " ↓" : ""}</span>{bounds.height >= 32 && <span>{status}{b.conflict ? " / CONFLICT" : ""}</span>}
            </button>;
          })}
        </div>)}
      </div>
    </div>
    {preview && <aside ref={previewRef} className="span-preview" style={{ left: point.x, top: point.y }} role="region" aria-label="Read-only appointment preview" tabIndex={0}
      onPointerEnter={controller.keep} onPointerLeave={e => { if (!e.currentTarget.contains(document.activeElement)) controller.leave(); }} onFocus={controller.keep}
      onBlur={e => { if (!e.currentTarget.contains(e.relatedTarget)) controller.leave(); }}>
      {spans.filter(s => preview.includes(s.block.id)).map(({ block: b }) => <p key={b.id}><strong>{minutesLabel(b.start)}-{minutesLabel(b.end)} / {b.kind}</strong><br />{b.label}{b.conflict ? " / CONFLICT" : ""}</p>)}
      <button type="button" onClick={() => { const target = controller.trigger; controller.dismiss(); if (target) pin(preview, target); }}>Pin details</button>
      <button type="button" onClick={() => controller.dismiss(true)}>Dismiss preview</button>
    </aside>}
  </div>;
}
