import { useEffect, useLayoutEffect, useRef, useState } from "react";
import { minutesLabel } from "../demo/booking";
import { bookingSpans, dayScale, clockScale, spanBounds } from "./booking-spans";
import { rowAvailability } from "./capacity";
import type { CapacityRow } from "./capacity";
import type { SessionState } from "./session";
import { staffTheme } from "./personnel";
import { SpanPreviewInteraction } from "./span-preview";
import { useTimetableNavigation } from "./use-timetable-navigation";
import { laneLeft, lanesWidth, LANE_WIDTH, TIME_RAIL, previewPosition, outsideViewport, worldToScreen } from "./timetable-camera";

export type SpanSurfaceProps = {
  state: SessionState; rows: CapacityRow[]; people: string[]; range: { start: number; end: number };
  pitch: number; mode: "click" | "hover"; scope: "day" | "range"; now?: number; active?: boolean;
  shared?: { date: string; camera: { zoom: number; x: number; y: number }; height: number; moving: boolean; offset: number };
  pin: (ids: string[], target: HTMLElement) => void;
  book: (row: CapacityRow, target: HTMLElement) => void;
};
/** The same geometry AND event wiring live inside the active surface, including native dialogs. */
export function BookingSpanSurface({ state, rows, people, range, pitch, mode, scope, now, active = true, pin, book, shared }: SpanSurfaceProps) {
  const root = useRef<HTMLDivElement>(null), previewRef = useRef<HTMLElement>(null);
  const [preview, setPreview] = useState<string[] | null>(null);
  const [point, setPoint] = useState({ left: 12, top: 12, width: 300, maxHeight: 220 });
  const [controller] = useState(() => new SpanPreviewInteraction(setPreview, target => target instanceof Node && !!previewRef.current?.contains(target)));
  const date = shared?.date ?? state.diaryDate;
  const spans = bookingSpans(state, date), scale = shared ? clockScale(state, date, range, pitch) : dayScale(state, date, pitch);
  const origin = scale.position(range.start), height = scale.position(range.end) - origin;
  const world = { width: lanesWidth(people.length), height };
  const nav = useTimetableNavigation(world, active, controller.navigation);
  const camera = shared ? { ...shared.camera, x: 0 } : nav.camera;
  useEffect(() => { if (shared) controller.navigation(shared.moving || !active); }, [shared?.moving, active, controller]);
  useEffect(() => { controller.preference(mode); }, [controller, mode]);
  useEffect(() => { controller.dismiss(); }, [controller, state.appointments, state.calendar]);
  useLayoutEffect(() => {
    if (!preview || !controller.trigger) return;
    const anchor = controller.trigger.getBoundingClientRect(), dialog = root.current?.closest("dialog")?.getBoundingClientRect();
    const left = dialog ? dialog.left + 12 : 12, right = dialog ? dialog.right - 12 : window.innerWidth - 12;
    const top = dialog ? dialog.top + 12 : 12, bottom = dialog ? dialog.bottom - 12 : window.innerHeight - 12;
    setPoint(previewPosition(anchor, { left, right, top, bottom }));
  }, [preview, controller]);
  useEffect(() => {
    const escape = (e: KeyboardEvent) => controller.escape(e);
    const outside = (e: PointerEvent) => { if (e.target instanceof Node && !root.current?.contains(e.target)) controller.dismiss(); };
    document.addEventListener("keydown", escape, true); document.addEventListener("pointerdown", outside, true);
    return () => { controller.dispose(); document.removeEventListener("keydown", escape, true); document.removeEventListener("pointerdown", outside, true); };
  }, [controller]);
  const shown = spans.filter(s => people.includes(s.block.staffId) && spanBounds(s, scale, range));
  const omitted = spans.filter(s => !people.includes(s.block.staffId) && state.config.staff.some(p => p.id === s.block.staffId) && spanBounds(s, scale, range));
  const offscreen = shown.filter(s => { const x = laneLeft(people.indexOf(s.block.staffId)); const bounds = spanBounds(s, scale, range)!; return outsideViewport(camera, { x, y: bounds.top, width: LANE_WIDTH, height: bounds.height }, nav.view); });
  const y = (minute: number) => worldToScreen(camera, { x: 0, y: scale.position(minute) - origin }).y;
  const labelEvery = Math.max(1, Math.ceil(18 / (pitch * camera.zoom)));
  return <div ref={root} className="span-surface" data-preview-scope={scope} data-shared={!!shared || undefined} title="">
    {!shared && <><div className="timetable-tools" aria-label="Timetable navigation">
      <button type="button" aria-label="Zoom in" onClick={() => nav.zoom(1.25)}>+</button><button type="button" aria-label="Zoom out" onClick={() => nav.zoom(.8)}>-</button>
      <button type="button" onClick={nav.fit}>Fit day</button><button type="button" onClick={nav.readable}>Readable / reset</button>
      <button type="button" aria-pressed={nav.hand} onClick={nav.toggleHand}>Hand</button>
      <button type="button" aria-label="Pan earlier" onClick={() => nav.shift(0, -120)}>Earlier</button><button type="button" aria-label="Pan later" onClick={() => nav.shift(0, 120)}>Later</button>
      {world.width > nav.view.width && <><button type="button" onClick={() => nav.shift(-126, 0)}>Previous person</button><button type="button" onClick={() => nav.shift(126, 0)}>Next person</button></>}
    </div>
    <p className="text-center text-xs">{minutesLabel(range.start)}-{minutesLabel(range.end)} / {camera.zoom < 1 ? "Overview: zoom for labels" : "Readable detail"}</p>
    <p className="text-xs">Wheel: zoom · Middle-drag: pan · Hand or focused Space-drag · Arrows: pan · Home: fit</p>
    {omitted.length > 0 && <p className="text-xs">Other people pages: {new Set(omitted.map(s => s.block.appointmentId ?? s.block.id)).size} occupied items{omitted.some(s => s.block.conflict) ? " / CONFLICT" : ""}. Shared availability includes them.</p>}
    {offscreen.length > 0 && <p className="text-xs">Partly or fully offscreen: {new Set(offscreen.map(s => s.block.appointmentId ?? s.block.id)).size} occupied items{offscreen.some(s => s.block.conflict) ? " / CONFLICT" : ""}. Use Earlier/Later, person controls or Fit day; availability includes all people.</p>}
    </>}
    <div className="span-navigation-frame" style={{ maxWidth: TIME_RAIL + world.width }}>
    {!shared && <div className="span-lane-headings"><span>Start</span><div className="span-heading-clip">{people.map((id, i) => <span key={id} style={{ ...staffTheme(state.config, id), left: laneLeft(i) - camera.x, width: LANE_WIDTH }} className="capacity-person"><i />{state.config.staff.find(p => p.id === id)?.name}</span>)}</div></div>}
    <div ref={shared ? undefined : nav.viewport} className="span-viewport" tabIndex={shared ? undefined : 0} role="group" aria-label="Selected-day timetable: wheel zoom, middle-drag pan" data-dragging={nav.dragging || undefined} data-hand={nav.hand || undefined} {...(shared ? {} : nav.viewportEvents)}>
      {scale.parts.filter(p => p.closed && p.start >= range.start && p.end <= range.end).map(p => <div key={p.start} className="span-break" aria-label={`Closed ${minutesLabel(p.start)}-${minutesLabel(p.end)}`} style={{ top: y(p.start), height: p.height * camera.zoom }}>{p.height * camera.zoom >= 16 ? `Closed ${minutesLabel(p.start)}-${minutesLabel(p.end)}` : ""}</div>)}
      {rows.filter(r => r.start >= range.start && r.start < range.end).map((row, i) => {
        const a = rowAvailability(row);
        return <button key={row.start} type="button" data-time={row.start} data-state={a.available ? "Available" : "Blocked"} data-aggregate={a.available || undefined}
          className="capacity-cell span-time" data-camera-y={scale.position(row.start) - origin} data-camera-height={pitch} data-camera-x={shared?.offset} data-camera-width={shared ? TIME_RAIL : undefined} style={{ top: y(row.start), height: Math.max(.1, (shared ? scale.position(row.end) - scale.position(row.start) - 2 : pitch - 2) * camera.zoom), zIndex: i % labelEvery ? 0 : 1 }} disabled={!a.available}
          aria-label={`${shared ? date + " " : ""}${minutesLabel(row.start)}: ${a.available ? `${a.choices.length} eligible practitioners; choose service and practitioner` : "no valid start"}`}
          onClick={e => { controller.dismiss(); book(row, e.currentTarget); }}><time style={i % labelEvery ? { visibility: "hidden" } : undefined}>{minutesLabel(row.start)}</time></button>;
      })}
      <div className="span-people">
        {people.map((id, i) => <div className="span-person-lane" key={id} style={{ left: laneLeft(i) - camera.x, width: LANE_WIDTH }}>
          {shown.filter(s => s.block.staffId === id).map(s => {
            const b = s.block, bounds = spanBounds(s, scale, range)!;
            const appointment = state.appointments.find(a => a.id === b.appointmentId);
            const inProgress = now !== undefined && appointment && now >= appointment.start && now < appointment.start + appointment.durationMinutes * 60_000;
            const status = b.kind === "buffer" ? "Buffer" : b.kind === "busy" ? "Busy" : inProgress ? "In progress" : "Booked";
            const label = `${minutesLabel(b.start)}-${minutesLabel(b.end)} ${status}: ${b.label}${b.conflict ? " / CONFLICT" : ""}`;
            return <button key={b.id} type="button" className="booking-span" data-block-id={b.id} data-appointment={b.appointmentId} data-staff={id} data-state={status} data-conflict={b.conflict || undefined}
              data-camera-y={bounds.top} data-camera-height={bounds.height} data-camera-x={(shared ? shared.offset + TIME_RAIL : 0) + laneLeft(i) + s.lane * LANE_WIDTH / s.lanes} data-camera-width={LANE_WIDTH / s.lanes}
              style={{ ...staffTheme(state.config, id), top: bounds.top * camera.zoom - camera.y, height: bounds.height * camera.zoom, borderWidth: Math.min(b.kind === "busy" ? 3 : 1, bounds.height * camera.zoom / 2), left: s.lane * LANE_WIDTH / s.lanes, width: LANE_WIDTH / s.lanes }}
              aria-label={`${label}${bounds.continuedBefore ? "; continues from earlier range" : ""}${bounds.continuedAfter ? "; continues in next range" : ""}`}
              {...controller.handlers(s.detailIds, pin)}>
              {bounds.height * camera.zoom >= 16 && <span>{bounds.continuedBefore ? "↑ " : ""}{b.conflict ? "! " : ""}{minutesLabel(b.start)}-{minutesLabel(b.end)}{bounds.continuedAfter ? " ↓" : ""}</span>}{bounds.height * camera.zoom >= 32 && <span>{status}{b.conflict ? " / CONFLICT" : ""}</span>}
            </button>;
          })}
        </div>)}
      </div>
    </div>
    </div>
    {!shared && <details className="text-xs"><summary>Timetable guide</summary>Fit day is an overview; zoom or choose Readable for exact labels at dense intervals. All starts and spans remain in the same day. Column widths stay fixed. Ctrl/Meta wheel keeps browser zoom. Touch uses these controls or Agenda. Closed breaks are hatched. Short spans keep exact endpoints in accessible details. Navigation never changes a booking.</details>}
    {preview && <aside ref={previewRef} className="span-preview" style={point} role="region" aria-label="Read-only appointment preview" tabIndex={0}
      onPointerEnter={controller.keep} onPointerLeave={e => { if (!e.currentTarget.contains(document.activeElement)) controller.leave(); }} onFocus={controller.keep}
      onBlur={e => { if (!e.currentTarget.contains(e.relatedTarget)) controller.leave(); }}>
      {spans.filter(s => preview.includes(s.block.id)).map(({ block: b }) => <p key={b.id}><strong>{minutesLabel(b.start)}-{minutesLabel(b.end)} / {b.kind}</strong><br />{b.label}{b.conflict ? " / CONFLICT" : ""}</p>)}
      <button type="button" onClick={() => { const target = controller.trigger; controller.dismiss(); if (target) pin(preview, target); }}>Pin details</button>
      <button type="button" onClick={() => controller.dismiss(true)}>Dismiss preview</button>
    </aside>}
  </div>;
}
