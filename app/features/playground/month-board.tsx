import { useEffect, useLayoutEffect, useRef, useState } from "react";
import { addDays, formatDemoDate, minutesLabel } from "../demo/booking";
import { weekDates, weekOverview } from "./week-overview";
import type { SessionState } from "./session";
import { SpanPreviewInteraction } from "./span-preview";
import { personColour } from "./personnel";
import { previewPosition } from "./timetable-camera";

export function monthAnchor(date: string, delta = 0) {
  const [year, month] = date.split("-").map(Number);
  return new Date(Date.UTC(year, month - 1 + delta, 1)).toISOString().slice(0, 10);
}
export function monthDates(date: string) {
  const first = monthAnchor(date), start = weekDates(first)[0], next = monthAnchor(date, 1);
  const days: string[] = [];
  for (let d = start; d < next || days.length % 7 !== 0; d = addDays(d, 1)) days.push(d);
  return days;
}
export function monthOverview(state: SessionState, date: string) {
  return monthDates(date).filter((_, i) => i % 7 === 0).flatMap(d => weekOverview(state, d));
}
export function MonthBoard({ state, today, mode, suspended, selectDate, pinDay }: {
  state: SessionState; today: string; mode: "click" | "hover"; suspended: boolean;
  selectDate: (date: string) => void; pinDay: (date: string, target: HTMLElement) => void;
}) {
  const days = monthOverview(state, state.diaryDate), month = state.diaryDate.slice(0, 7);
  const [preview, setPreview] = useState<string[] | null>(null);
  const previewRef = useRef<HTMLElement>(null);
  const [point, setPoint] = useState({ left: 12, top: 12, width: 300, maxHeight: 220 });
  const [controller] = useState(() => new SpanPreviewInteraction(setPreview, target => target instanceof Node && !!previewRef.current?.contains(target)));
  useEffect(() => { controller.preference(mode); }, [mode, controller]);
  useEffect(() => {
    const sync = () => controller.navigation(suspended || !!document.querySelector("dialog[open]"));
    sync(); const observer = new MutationObserver(sync); observer.observe(document.body, { subtree: true, childList: true, attributes: true, attributeFilter: ["open"] });
    return () => observer.disconnect();
  }, [suspended, controller]);
  useEffect(() => { controller.dismiss(); }, [month, controller]);
  useEffect(() => {
    const escape = (e: KeyboardEvent) => controller.escape(e);
    document.addEventListener("keydown", escape, true); return () => { controller.dispose(); document.removeEventListener("keydown", escape, true); };
  }, [controller]);
  useLayoutEffect(() => { if (preview && controller.trigger) setPoint(previewPosition(controller.trigger.getBoundingClientRect(), { left: 12, top: 12, right: window.innerWidth - 12, bottom: window.innerHeight - 12 })); }, [preview, controller]);
  const pin = (ids: string[], target: HTMLElement) => { controller.dismiss(); pinDay(ids[0], target); };
  return <div className="reception-board mt-3 min-h-0 flex-1 overflow-auto" aria-label="Month appointment overview">
    <nav className="timetable-tools"><button onClick={() => selectDate(monthAnchor(state.diaryDate, -1))}>Previous month</button><button onClick={() => selectDate(today)}>This month</button><button onClick={() => selectDate(monthAnchor(state.diaryDate, 1))}>Next month</button><strong>{month}</strong></nav>
    <p className="mb-2 text-sm">Markers mean has bookings, not fully booked. Hover previews are read-only; click a date for its full summary.</p>
    <div className="month-grid grid grid-cols-7 gap-1" style={{ minWidth: 490 }}>
      {["Mon", "Tue", "Wed", "Thu", "Fri", "Sat", "Sun"].map(d => <strong key={d}>{d}</strong>)}
      {days.map(day => <button key={day.date} type="button" className={`min-h-24 rounded border p-2 text-left text-sm ${day.date.startsWith(month) ? "bg-white" : "bg-slate-100 text-slate-600"}`} aria-label={`${day.date}: ${day.appointments.length} bookings${day.closed ? ", Closed" : ""}`} {...controller.handlers([day.date], pin)}>
        <time dateTime={day.date}>{day.date.slice(8)}{!day.date.startsWith(month) && <span className="block text-xs">{day.date.slice(0, 7)}</span>}</time><span className="block">{day.appointments.length} bookings</span>
        <span className="flex flex-wrap gap-1">{[...new Map(day.appointments.map(({ appointment: a }) => [a.staffId, a])).values()].map(a => <i key={a.staffId} aria-label={`${a.staffName}: has bookings`} className="inline-block h-3 w-3 rounded-full border" style={{ background: a.staffColour ?? personColour(state.config.people.find(p => p.id === a.staffId) ?? { id: a.staffId, name: "", roles: [] }) }} />)}</span>
        {day.closed && <span className="block text-xs">Closed</span>}{day.appointments.some(a => a.conflict) || day.busy.some(b => b.conflict) ? <strong className="block text-xs text-red-800">CONFLICT</strong> : null}{day.appointments.some(a => a.retained) && <span className="block text-xs">Retained</span>}
      </button>)}
    </div>
    {preview && !suspended && <aside ref={previewRef} className="span-preview" style={point} role="region" aria-label="Read-only day summary" tabIndex={0} onPointerEnter={controller.keep} onPointerLeave={e => { if (!e.currentTarget.contains(document.activeElement)) controller.leave(); }} onFocus={controller.keep} onBlur={e => { if (!e.currentTarget.contains(e.relatedTarget)) controller.leave(); }}>
      <DaySummary state={state} date={preview[0]} /><button onClick={() => { if (controller.trigger) pin(preview, controller.trigger); }}>Pin day summary</button><button onClick={() => controller.dismiss(true)}>Dismiss</button>
    </aside>}
  </div>;
}

export function DaySummary({ state, date, openDay, openWeek, openDetails, newBooking }: {
  state: SessionState; date: string; openDay?: (date: string) => void; openWeek?: (date: string) => void;
  openDetails?: (date: string, ids: string[], target: HTMLElement) => void; newBooking?: (date: string, target: HTMLElement) => void;
}) {
    const day = weekOverview(state, date).find(d => d.date === date)!;
    return <><p>{formatDemoDate(date)} · {date} / {day.appointments.length} bookings{day.closed ? " / Closed" : ""}</p>
      {!day.appointments.length && <p>No appointments. This does not promise availability.</p>}
      <ul className="space-y-2">{day.appointments.map(({ appointment: a, conflict, retained, detailIds }) => <li key={a.id} className="rounded border p-2 text-sm" style={{ overflowWrap: "anywhere" }}>
        <p>{minutesLabel(a.startMinute)}–{minutesLabel(a.startMinute + a.durationMinutes)} / {a.staffName} / {a.serviceName} / {a.customerLabel}</p>
        {!!a.bufferAfterMinutes && <p>Buffer: {a.bufferAfterMinutes} minutes</p>}{conflict && <strong>CONFLICT </strong>}{retained && <span>Retained exception </span>}{a.bufferOverride && <span>Confirmed buffer override</span>}
        {openDetails && <button className="rounded border p-2" onClick={e => openDetails(date, detailIds, e.currentTarget)}>Details / Move appointment</button>}
      </li>)}</ul>
      {!!day.busy.length && <p>Simulated busy intervals: {day.busy.length} (not bookings){day.busy.some(b => b.conflict) ? " / CONFLICT" : ""}</p>}
      {openDay && openWeek && <div className="flex flex-wrap gap-2"><button className="rounded border p-2" onClick={() => openDay(date)}>Open day</button><button className="rounded border p-2" onClick={() => openWeek(date)}>Open week</button>{newBooking && <button className="rounded border p-2 font-semibold" onClick={e => newBooking(date, e.currentTarget)}>New booking</button>}</div>}</>;
}
