import { dayPeriods } from "./scheduling";
import { useState, useSyncExternalStore } from "react";
import { ReceptionExperience } from "../booking/reception-experience";
import { bookingTheme } from "../booking/theme";
import { addDays, minutesLabel } from "../demo/booking";
import { zoneDatePreview } from "./timezone";
import type { PlaygroundSession, SessionState } from "./session";

export type DiaryBlock = { id: string; staffId: string; start: number; end: number;
  kind: "appointment" | "buffer" | "busy" | "closed"; label: string; appointmentId?: string; conflict: boolean };
const overlaps = (a: DiaryBlock, b: DiaryBlock) => a.staffId === b.staffId && a.start < b.end && b.start < a.end;
/** A projection only: availability and booking decisions remain in the shared scheduler. */
export function diaryBlocks(state: SessionState, date: string): DiaryBlock[] {
  const c = state.config, blocks: DiaryBlock[] = [];
  for (const a of state.appointments.filter(a => a.date === date)) {
    blocks.push({ id: a.id, appointmentId: a.id, staffId: a.staffId, start: a.startMinute, end: a.startMinute + a.durationMinutes,
      kind: "appointment", label: `${a.serviceName} / ${a.staffName} / ${a.customerLabel}`, conflict: false });
    if (a.bufferAfterMinutes) blocks.push({ id: `${a.id}-buffer`, appointmentId: a.id, staffId: a.staffId,
      start: a.startMinute + a.durationMinutes, end: a.startMinute + a.durationMinutes + a.bufferAfterMinutes,
      kind: "buffer", label: `Post-service buffer / ${a.staffName}`, conflict: false });
  }
  const busy = state.calendar.connected ? state.calendar.busy : null;
  if (busy) {
    const local = (instant: number) => {
      const parts = new Intl.DateTimeFormat("en-CA", { timeZone: c.business.timezone, year: "numeric", month: "2-digit", day: "2-digit", hour: "2-digit", minute: "2-digit", hourCycle: "h23" }).formatToParts(instant);
      const value = (key: string) => parts.find(p => p.type === key)!.value;
      return { date: `${value("year")}-${value("month")}-${value("day")}`, minute: Number(value("hour")) * 60 + Number(value("minute")) };
    };
    const start = local(busy.start), end = local(busy.end);
    if (start.date <= date && end.date >= date) {
      const from = start.date < date ? 0 : start.minute, to = end.date > date ? 1440 : end.minute;
      if (to > from) blocks.push({ id: "external-busy", staffId: busy.staffId, start: from, end: to, kind: "busy", label: "Simulated external busy", conflict: false });
    }
  }
  const periods = dayPeriods(c.hours, date);
  for (const person of c.staff) {
    let cursor = 0;
    for (const p of [...periods, { opens: 1440, closes: 1440 }]) {
      if (p.opens > cursor) blocks.push({ id: `closed-${person.id}-${cursor}`, staffId: person.id, start: cursor, end: p.opens, kind: "closed", label: "Closed", conflict: false });
      cursor = p.closes;
    }
  }
  return blocks.map(b => ({ ...b, conflict: b.kind !== "closed" && blocks.some(other => other.id !== b.id && overlaps(b, other)) }));
}
/** Overlapping blocks share columns without changing their actual time or duration. */
export function diaryColumns(blocks: DiaryBlock[]) {
  const items = blocks.filter(b => b.kind !== "closed").sort((a, b) => a.start - b.start || a.end - b.end);
  const result: { block: DiaryBlock; column: number; columns: number }[] = [];
  let group: typeof result = [], ends: number[] = [], groupEnd = -1;
  const flush = () => { for (const item of group) result.push({ ...item, columns: ends.length }); group = []; ends = []; };
  for (const block of items) {
    if (block.start >= groupEnd) flush();
    let column = ends.findIndex(end => end <= block.start);
    if (column < 0) column = ends.length;
    ends[column] = block.end; groupEnd = group.length ? Math.max(groupEnd, block.end) : block.end;
    group.push({ block, column, columns: 0 });
  }
  flush(); return result;
}
const tones = { appointment: "border-slate-800 bg-slate-100 text-slate-950", buffer: "border-dashed border-amber-800 bg-amber-50 text-amber-950",
  busy: "border-double border-violet-800 bg-violet-100 text-violet-950", closed: "border-slate-300 bg-slate-200 text-slate-700" };
export function PlaygroundDiary({ session, today }: { session: PlaygroundSession; today: string }) {
  const state = useSyncExternalStore(session.subscribe, session.getSnapshot, session.getSnapshot);
  const [view, setView] = useState<"day" | "agenda">("day");
  const c = state.config, date = state.diaryDate, blocks = diaryBlocks(state, date);
  const detached = blocks.filter(b => b.kind !== "closed" && !c.staff.some(p => p.id === b.staffId));
  const detail = (b: DiaryBlock) => <li key={b.id} id={`detail-${b.id}`} tabIndex={-1} className={`rounded-xl border-2 p-3 focus:outline-2 focus:outline-offset-2 focus:outline-slate-950 ${tones[b.kind]}`}>
    <strong>{minutesLabel(b.start)}–{minutesLabel(b.end)} · {b.kind === "appointment" ? "Appointment" : b.kind === "buffer" ? "Buffer" : "Simulated busy"}</strong>
    <p>{b.label}</p>{b.conflict && <p className="font-bold">Conflict: overlaps occupied or closed time. Nothing has been moved.</p>}
    {b.appointmentId && b.kind === "appointment" && <button className="mt-2 rounded border border-slate-700 bg-white px-3 py-2 text-slate-950" onClick={() => session.cancel(b.appointmentId!)}>Cancel {b.label}</button>}
  </li>;
  return <section style={bookingTheme(c.theme.primary, c.theme.accent)} className="space-y-4 rounded-2xl border bg-white p-4" aria-label="Reception diary">
    <h2 className="text-2xl font-semibold">Reception diary</h2>
    <div className="flex flex-wrap items-center gap-3">
      <button className="rounded border p-2" onClick={() => session.selectDiaryDate(addDays(date, -1))}>Previous day</button>
      <label>Date<input className="ml-2 rounded border p-2" type="date" value={date} onChange={e => session.selectDiaryDate(e.target.value)} /></label>
      <button className="rounded border p-2" onClick={() => session.selectDiaryDate(addDays(date, 1))}>Next day</button>
      {(["day", "agenda"] as const).map(v => <button key={v} aria-pressed={view === v} className={`rounded border p-2 ${view === v ? "bg-[var(--booking-accent)] text-[var(--booking-on-accent)]" : ""}`} onClick={() => setView(v)}>{v === "day" ? "Day" : "Agenda"}</button>)}
    </div>
    <p className="text-sm">Business timezone: {c.business.timezone}. {zoneDatePreview(c.business.timezone, date)} (selected-date local-noon reference).</p>
    <p className="text-sm">Legend: solid = appointment; dashed amber = post-service buffer; double violet = simulated busy; grey = closed. Empty space is not a promise of availability for every service.</p>
    {view === "day" && <div className="hidden md:block">
      <div className="overflow-x-auto"><div className="grid min-w-[600px]" style={{ gridTemplateColumns: `60px repeat(${Math.max(1, c.staff.length)}, minmax(160px, 1fr))` }}>
        <div aria-hidden="true">Time</div>{c.staff.map(p => <h3 key={p.id} className="break-words border p-2 font-semibold">{p.name}</h3>)}
        <div className="relative h-[1440px]">{Array.from({ length: 24 }, (_, h) => <span key={h} className="absolute text-xs" style={{ top: h * 60 }}>{minutesLabel(h * 60)}</span>)}</div>
        {c.staff.map(p => <div key={p.id} className="relative h-[1440px] border" aria-label={`${p.name} day lane`}>
          {blocks.filter(b => b.staffId === p.id && b.kind === "closed").map(b => <div key={b.id} className="absolute inset-x-0 overflow-hidden border bg-slate-200 px-1 text-xs text-slate-700" style={{ top: b.start, height: b.end - b.start }}>Closed {minutesLabel(b.start)}–{minutesLabel(b.end)}</div>)}
          {Array.from({ length: 24 }, (_, h) => <div key={h} className="pointer-events-none absolute inset-x-0 border-t border-slate-300" style={{ top: h * 60 }} />)}
          {diaryColumns(blocks.filter(b => b.staffId === p.id)).map(({ block: b, column, columns }) => <a key={b.id} href={`#detail-${b.id}`} className={`absolute overflow-hidden border-2 px-1 text-xs focus:z-10 focus:outline-2 focus:outline-offset-2 focus:outline-slate-950 ${tones[b.kind]}`}
            aria-label={`${minutesLabel(b.start)} to ${minutesLabel(b.end)} ${b.label}${b.conflict ? "; conflict" : ""}. View details.`}
            style={{ top: b.start, height: b.end - b.start, left: `${column * 100 / columns}%`, width: `${100 / columns}%` }}>{b.conflict ? "! " : ""}{b.kind} {minutesLabel(b.start)} {b.label}</a>)}
        </div>)}
      </div></div>
    </div>}
    {view === "agenda" && <ReceptionExperience today={today} selectedDate={date} onDateChange={d => session.selectDiaryDate(d)} business={{ name: c.business.name, descriptor: c.location.name, ...c.theme }} people={c.staff} services={c.services}
      appointmentsFor={d => state.appointments.filter(a => a.date === d)} onCancel={id => session.cancel(id)} onBooking={() => session.view("booking")} />}
    <div><h3 className="font-semibold">Readable agenda and block details</h3><p className="text-sm">On narrow screens this agenda replaces the time grid. Times below include protected buffers and closed boundaries.</p>
      {c.staff.map(p => <section key={p.id} className="my-4"><h4 className="font-semibold">{p.name}</h4>
        {blocks.filter(b => b.staffId === p.id && b.kind === "closed").map(b => <p key={b.id} className="text-sm">Closed: {minutesLabel(b.start)}–{minutesLabel(b.end)}</p>)}
        <ul className="mt-2 space-y-2">{blocks.filter(b => b.staffId === p.id && b.kind !== "closed").sort((a, b) => a.start - b.start).map(detail)}</ul>
        {!blocks.some(b => b.staffId === p.id && b.kind !== "closed") && <p>No occupied intervals for this person.</p>}
      </section>)}
      {detached.length > 0 && <section className="rounded border border-amber-700 p-3"><h3 className="font-semibold">Retained bookings / busy time for removed or non-bookable people</h3><p>Original names and occupied instants remain. Cancel explicitly, or disconnect simulated busy time, to release them.</p><ul className="space-y-2">{detached.map(detail)}</ul></section>}
    </div>
  </section>;
}
