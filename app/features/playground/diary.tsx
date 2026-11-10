import { useEffect, useRef, useState, useSyncExternalStore } from "react";
import { ReceptionExperience } from "../booking/reception-experience";
import { bookingTheme } from "../booking/theme";
import { addDays, minutesLabel } from "../demo/booking";
import { zoneDatePreview } from "./timezone";
import type { PlaygroundSession } from "./session";
import { diaryBlocks, diaryColumns, workingSpan, exceptionBlocks, unoccupiedPeriods, candidateMinute, boardTicks } from "./diary-projection";
import type { DiaryBlock } from "./diary-projection";
import { ReceptionComposer } from "./reception-composer";
import type { ComposerSeed } from "./reception-composer";
import { ReceptionDialog } from "./reception-dialog";
import { DetailPreviewController } from "./reception-state";
import type { DetailsMode } from "./reception-state";
export { diaryBlocks, diaryColumns } from "./diary-projection";

const tones = { appointment: "border-[var(--booking-primary)] bg-[var(--booking-primary)] text-[var(--booking-on-primary)]", buffer: "border-dashed border-amber-800 bg-amber-50 text-amber-950",
  busy: "border-double border-violet-800 bg-violet-100 text-violet-950", closed: "border-slate-300 bg-slate-200 text-slate-700" };
const button = "rounded-xl border border-slate-300 bg-white px-3 py-2 text-sm font-semibold focus-visible:outline-2 focus-visible:outline-offset-2 focus-visible:outline-slate-900";
export function PlaygroundDiary({ session, today }: { session: PlaygroundSession; today: string }) {
  const state = useSyncExternalStore(session.subscribe, session.getSnapshot, session.getSnapshot);
  const [view, setView] = useState<"day" | "agenda">("day");
  const [person, setPerson] = useState(state.config.staff[0]?.id ?? "");
  const [mode, setMode] = useState<DetailsMode>("click");
  const [preview, setPreview] = useState<string[] | null>(null);
  const [details, setDetails] = useState<string[] | null>(null);
  const [composer, setComposer] = useState<ComposerSeed | null>(null);
  const [message, setMessage] = useState("");
  const [previewPoint, setPreviewPoint] = useState({ x: 12, y: 12 });
  const opener = useRef<HTMLElement | null>(null);
  const pendingPreviewOpener = useRef<HTMLElement | null>(null), previewOpener = useRef<HTMLElement | null>(null);
  const [controller] = useState(() => new DetailPreviewController(ids => {
    if (ids) previewOpener.current = pendingPreviewOpener.current;
    setPreview(ids);
  }));
  const board = useRef<HTMLDivElement>(null), [height, setHeight] = useState(360);
  const c = state.config, date = state.diaryDate, blocks = diaryBlocks(state, date), span = workingSpan(state, date);
  const exceptions = exceptionBlocks(state, date, blocks), selectedPerson = c.staff.some(p => p.id === person) ? person : c.staff[0]?.id ?? "";
  useEffect(() => () => controller.dispose(), [controller]);
  useEffect(() => { controller.dismiss(); setDetails(null); }, [date, controller]);
  useEffect(() => {
    if (!preview) return;
    const dismiss = (e: KeyboardEvent) => { if (e.key === "Escape") { controller.dismiss(); e.stopPropagation(); } };
    document.addEventListener("keydown", dismiss); return () => document.removeEventListener("keydown", dismiss);
  }, [preview, controller]);
  useEffect(() => {
    const element = board.current; if (!element) return;
    const measure = () => setHeight(element.clientHeight || 360); measure();
    const observer = typeof ResizeObserver === "undefined" ? null : new ResizeObserver(measure); observer?.observe(element);
    window.addEventListener("resize", measure); return () => { observer?.disconnect(); window.removeEventListener("resize", measure); };
  }, [view, date]);
  const openDetails = (ids: string[], target: HTMLElement) => { controller.dismiss(); opener.current = target; setDetails(ids); };
  const openComposer = (target: HTMLElement, staffId = selectedPerson, minute?: number) => {
    controller.dismiss(); opener.current = target; setComposer({ date, staffId, minute });
  };
  const previewEvents = (ids: string[]) => ({
    onPointerEnter: (e: React.PointerEvent<HTMLElement>) => {
      if (e.pointerType === "touch" || details || composer) return;
      const box = e.currentTarget.getBoundingClientRect(); pendingPreviewOpener.current = e.currentTarget;
      setPreviewPoint({ x: Math.max(12, Math.min(box.right + 8, window.innerWidth - 332)), y: Math.max(12, Math.min(box.top, window.innerHeight - 250)) }); controller.enter(ids);
    },
    onPointerLeave: (e: React.PointerEvent<HTMLElement>) => { if (!e.currentTarget.contains(document.activeElement)) controller.leave(); },
    onFocus: (e: React.FocusEvent<HTMLElement>) => {
      if (details || composer) return;
      const box = e.currentTarget.getBoundingClientRect(); pendingPreviewOpener.current = e.currentTarget;
      setPreviewPoint({ x: Math.max(12, Math.min(box.right + 8, window.innerWidth - 332)), y: Math.max(12, Math.min(box.top, window.innerHeight - 250)) }); controller.enter(ids);
    },
    onBlur: (e: React.FocusEvent<HTMLElement>) => { if (!document.getElementById("reception-preview")?.contains(e.relatedTarget)) controller.leave(); },
  });
  const blockLabel = (b: DiaryBlock) => `${minutesLabel(b.start)}-${minutesLabel(b.end)} ${b.kind}: ${b.label}${b.kind === "appointment" ? " / Scheduled" : ""}${b.conflict ? " / CONFLICT" : ""}`;
  const detailItems = (ids: string[], pinned: boolean) => <ul className="space-y-3">{ids.map(id => blocks.find(b => b.id === id)).filter((b): b is DiaryBlock => !!b).map(b => <li key={b.id} className="rounded-xl border border-slate-300 bg-slate-50 p-3 text-sm text-slate-950">
    <strong>{minutesLabel(b.start)}-{minutesLabel(b.end)} / {b.kind}</strong><p>{b.label}</p>{b.kind === "appointment" && <p>Status: Scheduled</p>}
    {b.conflict && <p className="font-semibold text-amber-900">Conflict with occupied or closed time. Nothing has moved.</p>}
    {pinned && b.appointmentId && b.kind === "appointment" && <button type="button" className={`${button} mt-2`} onClick={() => { session.cancel(b.appointmentId!); setDetails(null); setMessage("Synthetic appointment cancelled."); }}>Cancel appointment</button>}
    {pinned && b.kind === "busy" && <button type="button" className={`${button} mt-2`} onClick={() => { session.disconnect(); setDetails(null); setMessage("Simulated calendar disconnected."); }}>Disconnect simulated calendar</button>}
  </li>)}</ul>;
  const visiblePreview = preview?.filter(id => blocks.some(b => b.id === id));
  return <section style={bookingTheme(c.theme.primary, c.theme.accent)} className="reception-workspace flex min-h-0 flex-1 flex-col rounded-2xl border border-slate-200 bg-white p-3 shadow-sm" aria-label="Reception workspace">
    <div className="flex flex-wrap items-center justify-between gap-2">
      <h2 className="text-lg font-semibold">Reception</h2>
      <div className="flex flex-wrap items-center gap-2">
        <button className={button} aria-label="Previous day" onClick={() => session.selectDiaryDate(addDays(date, -1))}>&larr;</button>
        <label className="text-sm">Date <input className="rounded-lg border p-1.5" type="date" value={date} onChange={e => session.selectDiaryDate(e.target.value)} /></label>
        <button className={button} aria-label="Next day" onClick={() => session.selectDiaryDate(addDays(date, 1))}>&rarr;</button>
        {(["day", "agenda"] as const).map(v => <button key={v} aria-pressed={view === v} className={button} style={view === v ? { background: "var(--booking-accent)", color: "var(--booking-on-accent)" } : undefined} onClick={() => { controller.dismiss(); setView(v); }}>{v === "day" ? "Day" : "Agenda"}</button>)}
        <button data-reception-new-booking className={button} onClick={e => openComposer(e.currentTarget)} disabled={!c.staff.length}>+ New booking</button>
      </div>
    </div>
    <div className="mt-2 flex flex-wrap items-center justify-between gap-2 text-xs text-slate-600">
      <span>{c.business.name} / {c.business.timezone}</span>
      <label>Details: <select aria-label="Details preference" className="rounded border bg-white p-1" value={mode} onChange={e => { const mode = e.target.value as DetailsMode; setMode(mode); controller.preference(mode); }}><option value="click">Click</option><option value="hover">Hover</option></select></label>
      {exceptions.length > 0 && <button className="rounded-lg border border-amber-700 bg-amber-50 px-2 py-1 font-semibold text-amber-950" onClick={e => openDetails(exceptions.map(b => b.id), e.currentTarget)}>Exceptions: {exceptions.length} occupied items (retained / out of hours)</button>}
      <details className="relative"><summary className="cursor-pointer">Legend & timezone</summary><div className="absolute right-0 z-10 mt-1 w-72 max-w-[calc(100vw-24px)] rounded-xl border bg-white p-3 shadow-lg">{zoneDatePreview(c.business.timezone, date)}. Solid = scheduled; dashed amber = buffer; double violet = simulated busy; grey = closed. Empty space is only a candidate until a service is validated. All people inherit weekday hours.</div></details>
    </div>
    {message && <p role="status" className="mt-1 text-xs">{message}</p>}
    {view === "day" && <>
      <label className="mt-2 text-sm md:hidden">Person <select className="rounded-lg border bg-white p-2" value={selectedPerson} onChange={e => setPerson(e.target.value)}>{c.staff.map(p => <option key={p.id} value={p.id}>{p.name}</option>)}</select></label>
      {!span ? <div className="flex flex-1 items-center justify-center rounded-xl bg-slate-50 p-5 text-center"><p>Closed on this day. Check exceptions for retained appointments, or choose another date.</p></div> : <div className="reception-board mt-3 grid min-h-0 flex-1" style={{ gridTemplateColumns: `48px repeat(${Math.max(c.staff.length, 1)}, minmax(0, 1fr))`, gridTemplateRows: "44px minmax(0, 1fr)" }}>
        <div className="text-xs text-slate-500">Time</div>{c.staff.map(p => {
          const items = blocks.filter(b => b.staffId === p.id && b.kind !== "closed" && b.end > span.start && b.start < span.end);
          return <div key={p.id} data-selected={p.id === selectedPerson} className="board-person flex min-w-0 flex-col justify-center border-l px-2 text-sm"><strong className="truncate">{p.name}</strong>
            <button className="truncate text-left text-xs underline" onClick={e => openDetails(items.map(b => b.id), e.currentTarget)} disabled={!items.length}>{items.length} occupied items / exact details (includes compact blocks)</button></div>;
        })}
        <div ref={board} className="relative mb-3 mt-2">{boardTicks(span.start, span.end).map(t => <span key={t} className="absolute -translate-y-1/2 text-[11px] text-slate-500" style={{ top: `${(t - span.start) / (span.end - span.start) * 100}%` }}>{minutesLabel(t)}</span>)}</div>
        {c.staff.map(p => {
          const percent = (n: number) => (n - span.start) / (span.end - span.start) * 100;
          const items = blocks.filter(b => b.staffId === p.id && b.end > span.start && b.start < span.end);
          return <div key={p.id} data-selected={p.id === selectedPerson} className="board-person relative mb-3 mt-2 min-h-0 border-l border-slate-200" aria-label={`${p.name} day lane`}>
            {unoccupiedPeriods(state, date, p.id, blocks).map(gap => <button key={`free-${gap.start}`} className="absolute inset-x-0 overflow-hidden border-y border-dotted border-slate-200 bg-white text-left text-xs text-slate-500 hover:bg-slate-100 focus:z-10 focus:outline-2 focus:outline-slate-800"
              aria-label={`New booking candidate for ${p.name}, ${minutesLabel(gap.start)} to ${minutesLabel(gap.end)}. Choose a service to check availability.`}
              style={{ top: `${percent(gap.start)}%`, height: `${(gap.end - gap.start) / (span.end - span.start) * 100}%` }}
              onClick={e => { const box = e.currentTarget.getBoundingClientRect(); const raw = e.detail === 0 ? gap.start : gap.start + Math.max(0, Math.min(0.999, (e.clientY - box.top) / box.height)) * (gap.end - gap.start); openComposer(e.currentTarget, p.id, candidateMinute(state, date, Math.floor(raw))); }}>
              {(gap.end - gap.start) / (span.end - span.start) * height >= 28 && <span className="px-2">+ Unoccupied</span>}
            </button>)}
            {items.filter(b => b.kind === "closed").map(b => <button key={b.id} className="absolute inset-x-0 overflow-hidden border-y border-dashed border-slate-400 bg-slate-200 text-xs text-slate-700" style={{ top: `${percent(Math.max(b.start, span.start))}%`, height: `${(Math.min(b.end, span.end) - Math.max(b.start, span.start)) / (span.end - span.start) * 100}%` }} aria-label={blockLabel(b)} onClick={e => openDetails([b.id], e.currentTarget)}>Closed</button>)}
            {diaryColumns(items).map(({ block: b, column, columns }) => {
              const pixels = (Math.min(b.end, span.end) - Math.max(b.start, span.start)) / (span.end - span.start) * height;
              return <button key={b.id} type="button" {...previewEvents([b.id])} aria-describedby={visiblePreview?.includes(b.id) ? "reception-preview" : undefined}
                className={`absolute overflow-hidden rounded-md border px-1 text-left text-xs focus:z-10 focus:outline-2 focus:outline-offset-1 focus:outline-slate-950 ${tones[b.kind]}`}
                aria-label={`${blockLabel(b)}. Open pinned details.`} onClick={e => openDetails([b.id], e.currentTarget)}
                style={{ borderWidth: pixels < 6 ? 0 : 1, top: `${percent(Math.max(b.start, span.start))}%`, height: `${(Math.min(b.end, span.end) - Math.max(b.start, span.start)) / (span.end - span.start) * 100}%`, left: `${column * 100 / columns}%`, width: `${100 / columns}%` }}>
                {pixels >= 26 ? <span className="block leading-3">{b.conflict ? "! " : ""}{minutesLabel(b.start)}-{minutesLabel(b.end)} {b.kind === "appointment" ? "Scheduled" : b.kind}<br />{b.summary ?? b.label}</span> : pixels >= 14 ? <span className="whitespace-nowrap">{b.conflict ? "! " : ""}{minutesLabel(b.start)} {b.kind === "appointment" ? "Scheduled" : b.kind} {b.summary ?? b.label}</span> : null}
              </button>;
            })}
          </div>;
        })}
      </div>}
    </>}
    {view === "agenda" && <div className="mt-3 min-h-0 flex-1 overflow-auto"><ReceptionExperience embedded today={today} selectedDate={date} onDateChange={d => session.selectDiaryDate(d)} business={{ name: c.business.name, descriptor: c.location.name, ...c.theme }} people={c.staff} services={c.services}
      appointmentsFor={d => state.appointments.filter(a => a.date === d)} onCancel={id => session.cancel(id)} onBooking={() => { const target = document.querySelector<HTMLElement>("[data-reception-new-booking]"); if (target) openComposer(target); }} bookingActionLabel="New booking" /></div>}
    {visiblePreview && visiblePreview.length > 0 && <aside id="reception-preview" role="region" aria-label="Read-only appointment preview" tabIndex={0}
      className="reception-preview fixed z-40 max-h-56 w-80 overflow-auto rounded-xl border border-slate-300 bg-white p-3 text-slate-900 shadow-xl" style={{ left: previewPoint.x, top: previewPoint.y }}
      onPointerEnter={() => controller.keep()} onPointerLeave={e => { if (!e.currentTarget.contains(document.activeElement)) controller.leave(); }} onFocus={() => controller.keep()} onBlur={e => { if (!e.currentTarget.contains(e.relatedTarget)) controller.leave(); }}>
      {detailItems(visiblePreview, false)}<div className="mt-2 flex gap-2"><button className={button} onClick={() => { controller.dismiss(); opener.current = previewOpener.current; setDetails(visiblePreview); }}>Pin details</button><button className={button} onClick={() => controller.dismiss()}>Dismiss</button></div>
    </aside>}
    {details && <ReceptionDialog title="Occupied time details" returnFocus={opener.current} onClose={() => setDetails(null)}>{detailItems(details, true)}{!details.some(id => blocks.some(b => b.id === id)) && <p>No occupied items remain.</p>}</ReceptionDialog>}
    {composer && <ReceptionComposer session={session} seed={composer} returnFocus={opener.current} onClose={() => { setComposer(null); setMessage("Booking composer closed."); }} />}
  </section>;
}
