import { CapacityBoard } from "./capacity-board";
import { useEffect, useRef, useState, useSyncExternalStore } from "react";
import { ReceptionExperience } from "../booking/reception-experience";
import { bookingTheme } from "../booking/theme";
import { addDays, minutesLabel } from "../demo/booking";
import { zoneDatePreview } from "./timezone";
import type { PlaygroundSession } from "./session";
import { diaryBlocks, workingSpan, exceptionBlocks } from "./diary-projection";
import type { DiaryBlock } from "./diary-projection";
import { ReceptionComposer } from "./reception-composer";
import type { ComposerSeed } from "./reception-composer";
import { TimeTileBoard } from "./time-tile-board";
import { locationSummary } from "./location-label";
import { ReceptionDialog } from "./reception-dialog";
import { DetailPreviewController } from "./reception-state";
import type { DetailsMode } from "./reception-state";
export { diaryBlocks, diaryColumns } from "./diary-projection";

const button = "rounded-xl border border-slate-300 bg-white px-3 py-2 text-sm font-semibold focus-visible:outline-2 focus-visible:outline-offset-2 focus-visible:outline-slate-900";
export function PlaygroundDiary({ session, today }: { session: PlaygroundSession; today: string }) {
  const state = useSyncExternalStore(session.subscribe, session.getSnapshot, session.getSnapshot);
  const [actorId, setActorId] = useState("");
  const [serviceId, setServiceId] = useState("");
  const [view, setView] = useState<"day" | "agenda" | "person">("day");
  const [person, setPerson] = useState(state.config.staff[0]?.id ?? "");
  const [mode, setMode] = useState<DetailsMode>("click");
  const [preview, setPreview] = useState<string[] | null>(null);
  const [detailCandidate, setDetailCandidate] = useState<ComposerSeed | null>(null);
  const [details, setDetails] = useState<string[] | null>(null);
  const [composer, setComposer] = useState<ComposerSeed | null>(null);
  const [message, setMessage] = useState("");
  const [previewPoint, setPreviewPoint] = useState({ x: 12, y: 12 });
  const opener = useRef<HTMLElement | null>(null);
  const pendingPreviewOpener = useRef<HTMLElement | null>(null), previewOpener = useRef<HTMLElement | null>(null);
  const suppressRestoredFocus = useRef(false);
  const dismissedHoverTrigger = useRef<HTMLElement | null>(null);
  const [controller] = useState(() => new DetailPreviewController(ids => {
    if (ids) previewOpener.current = pendingPreviewOpener.current;
    setPreview(ids);
  }));
  const c = state.config, date = state.diaryDate, blocks = diaryBlocks(state, date), span = workingSpan(state, date);
  const selectedService = c.services.some(s => s.id === serviceId) ? serviceId : "";
  const exceptions = exceptionBlocks(state, date, blocks), selectedPerson = c.staff.some(p => p.id === person) ? person : c.staff[0]?.id ?? "";
  useEffect(() => () => controller.dispose(), [controller]);
  useEffect(() => { controller.dismiss(); setDetails(null); }, [date, controller]);
  useEffect(() => {
    if (!preview) return;
    const dismiss = (e: KeyboardEvent) => {
      if (e.key !== "Escape") return;
      dismissedHoverTrigger.current = previewOpener.current;
      const restore = document.getElementById("reception-preview")?.contains(document.activeElement) && previewOpener.current?.isConnected;
      controller.dismiss(restore ? () => { suppressRestoredFocus.current = true; previewOpener.current?.focus({ preventScroll: true }); } : undefined);
      e.stopPropagation();
    };
    document.addEventListener("keydown", dismiss); return () => document.removeEventListener("keydown", dismiss);
  }, [preview, controller]);
  const openDetails = (ids: string[], target: HTMLElement, candidate?: Partial<ComposerSeed> & { staffId: string; minute: number }) => { controller.dismiss(); opener.current = target; setDetailCandidate(candidate ? { date, ...candidate } : null); setDetails(ids); };
  const openComposer = (target: HTMLElement, staffId = selectedPerson, minute?: number, seed?: Partial<ComposerSeed>) => {
    controller.dismiss(); opener.current = target; setComposer({ date, staffId, minute, serviceId: selectedService || undefined, actorId, ...seed });
  };
  const previewEvents = (ids: string[]) => ({
    onPointerEnter: (e: React.PointerEvent<HTMLElement>) => {
      if (e.pointerType === "touch" || details || composer || dismissedHoverTrigger.current === e.currentTarget) return;
      const box = e.currentTarget.getBoundingClientRect(); pendingPreviewOpener.current = e.currentTarget;
      setPreviewPoint({ x: Math.max(12, Math.min(box.right + 8, window.innerWidth - 332)), y: Math.max(12, Math.min(box.top, window.innerHeight - 250)) }); controller.enter(ids);
    },
    onPointerLeave: (e: React.PointerEvent<HTMLElement>) => {
      if (dismissedHoverTrigger.current === e.currentTarget) dismissedHoverTrigger.current = null;
      if (!e.currentTarget.contains(document.activeElement)) controller.leave();
    },
    onFocus: (e: React.FocusEvent<HTMLElement>) => {
      if (suppressRestoredFocus.current) { suppressRestoredFocus.current = false; return; }
      if (details || composer) return;
      dismissedHoverTrigger.current = null;
      const box = e.currentTarget.getBoundingClientRect(); pendingPreviewOpener.current = e.currentTarget;
      setPreviewPoint({ x: Math.max(12, Math.min(box.right + 8, window.innerWidth - 332)), y: Math.max(12, Math.min(box.top, window.innerHeight - 250)) }); controller.enter(ids);
    },
    onBlur: (e: React.FocusEvent<HTMLElement>) => { if (!document.getElementById("reception-preview")?.contains(e.relatedTarget)) controller.leave(); },
  });
  const detailItems = (ids: string[], pinned: boolean) => <ul className="space-y-3">{ids.map(id => blocks.find(b => b.id === id)).filter((b): b is DiaryBlock => !!b).map(b => <li key={b.id} className="rounded-xl border border-slate-300 bg-slate-50 p-3 text-sm text-slate-950">
    <strong>{minutesLabel(b.start)}-{minutesLabel(b.end)} / {b.kind}</strong><p>{b.label}</p>{b.kind === "appointment" && <p>Status: Scheduled</p>}
    {b.appointmentId && state.appointments.find(a => a.id === b.appointmentId)?.bufferOverride && <p className="font-semibold text-amber-900">Confirmed operational buffer override (local simulation). Original buffer snapshots remain.</p>}
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
        {(["day", "agenda", "person"] as const).map(v => <button key={v} aria-pressed={view === v} className={button} style={view === v ? { background: "var(--booking-accent)", color: "var(--booking-on-accent)" } : undefined} onClick={() => { controller.dismiss(); setView(v); }}>{v === "day" ? "Day" : v === "agenda" ? "Agenda" : "By practitioner"}</button>)}
        <button data-reception-new-booking className={button} onClick={e => openComposer(e.currentTarget)} disabled={!c.staff.length}>+ New booking</button>
      </div>
    </div>
    <div className="mt-2 flex flex-wrap items-center justify-between gap-2 text-xs text-slate-600">
      <span>{c.business.name} / {c.business.timezone}</span>
      <label>Details: <select aria-label="Details preference" className="rounded border bg-white p-1" value={mode} onChange={e => { const mode = e.target.value as DetailsMode; setMode(mode); controller.preference(mode); }}><option value="click">Click</option><option value="hover">Hover</option></select></label>
      {exceptions.length > 0 && <button className="rounded-lg border border-amber-700 bg-amber-50 px-2 py-1 font-semibold text-amber-950" onClick={e => openDetails(exceptions.map(b => b.id), e.currentTarget)}>Exceptions: {exceptions.length} occupied items (retained / off-grid / out of hours)</button>}
      <label>Simulated operator <select className="rounded border bg-white p-1" value={actorId} onChange={e => { setActorId(e.target.value); setComposer(null); setDetails(null); controller.dismiss(); }}><option value="">Public rules / no override</option>{c.people.map(p => <option key={p.id} value={p.id}>{p.name} ({p.roles.join(", ")})</option>)}</select></label>
      <label>Service <select aria-label="Service availability filter" className="rounded border bg-white p-1" value={selectedService} onChange={e => { controller.dismiss(); setServiceId(e.target.value); }}><option value="">Choose service / check availability</option>{c.services.map(s => <option key={s.id} value={s.id}>{s.name}</option>)}</select></label>
      <details className="relative"><summary className="cursor-pointer">Tile guide & timezone</summary><div className="absolute right-0 z-10 mt-1 w-72 max-w-[calc(100vw-24px)] rounded-xl border bg-white p-3 shadow-lg">{zoneDatePreview(c.business.timezone, date)}. Day is shared time-row capacity. White cells require a scheduler-valid start for the selected service, or at least one eligible service. Continuous coloured spans retain exact booking and buffer endpoints. Neutral time buttons keep the rail fixed when no start is valid. Operator roles here are a local simulation, not production authorization. Lane colours identify people; lighter dashed = buffer; violet = busy; red stripes = actual conflict. Range groups expose all exact times.</div></details>
    </div>
    {message && <p role="status" className="mt-1 text-xs">{message}</p>}
    {(view === "day" || view === "person") && <>
      {view === "person" && <label className="mt-2 text-sm md:hidden">Person <select className="rounded-lg border bg-white p-2" value={selectedPerson} onChange={e => setPerson(e.target.value)}>{c.staff.map(p => <option key={p.id} value={p.id}>{p.name}</option>)}</select></label>}
      {!span ? <div className="flex flex-1 items-center justify-center rounded-xl bg-slate-50 p-5 text-center"><p>Closed on this day. Check exceptions for retained appointments, or choose another date.</p></div> : view === "day" ? <CapacityBoard key={`${state.epoch}:${date}:${state.configRevision}:${selectedService}:${actorId}`} session={session} state={state} serviceId={selectedService} actorId={actorId} openDetails={openDetails} openComposer={openComposer} mode={mode} suspended={!!details || !!composer} /> : <TimeTileBoard key={`${state.epoch}:${date}:${state.configRevision}:${selectedService}`} session={session} state={state} person={selectedPerson} serviceId={selectedService} openDetails={openDetails} openComposer={openComposer} previewEvents={previewEvents} dismissPreview={() => controller.dismiss()} />}

    </>}
    {view === "agenda" && <div className="mt-3 min-h-0 flex-1 overflow-auto"><ReceptionExperience embedded today={today} selectedDate={date} onDateChange={d => session.selectDiaryDate(d)} business={{ name: c.business.name, descriptor: locationSummary(c), ...c.theme }} people={c.staff} services={c.services}
      appointmentsFor={d => state.appointments.filter(a => a.date === d)} onCancel={id => session.cancel(id)} onBooking={() => { const target = document.querySelector<HTMLElement>("[data-reception-new-booking]"); if (target) openComposer(target); }} bookingActionLabel="New booking" /></div>}
    {visiblePreview && visiblePreview.length > 0 && <aside id="reception-preview" role="region" aria-label="Read-only appointment preview" tabIndex={0}
      className="reception-preview fixed z-40 max-h-56 w-80 overflow-auto rounded-xl border border-slate-300 bg-white p-3 text-slate-900 shadow-xl" style={{ left: previewPoint.x, top: previewPoint.y }}
      onPointerEnter={() => controller.keep()} onPointerLeave={e => { if (!e.currentTarget.contains(document.activeElement)) controller.leave(); }} onFocus={() => controller.keep()} onBlur={e => { if (!e.currentTarget.contains(e.relatedTarget)) controller.leave(); }}>
      {detailItems(visiblePreview, false)}<div className="mt-2 flex gap-2"><button className={button} onClick={() => { controller.dismiss(); opener.current = previewOpener.current; setDetailCandidate(null); setDetails(visiblePreview); }}>Pin details</button><button className={button} onClick={() => controller.dismiss(() => {
        dismissedHoverTrigger.current = previewOpener.current;
        if (previewOpener.current?.isConnected) { suppressRestoredFocus.current = true; previewOpener.current.focus({ preventScroll: true }); }
      })}>Dismiss</button></div>
    </aside>}
    {details && <ReceptionDialog movable title="Occupied time details" returnFocus={opener.current} onClose={() => setDetails(null)}>{detailItems(details, true)}{detailCandidate && <button className={button} onClick={() => { setDetails(null); openComposer(opener.current!, detailCandidate.staffId, detailCandidate.minute, detailCandidate); }}>{detailCandidate.override ? "Review buffer override at " : "Check start at "}{minutesLabel(detailCandidate.minute ?? 0)}</button>}{!details.some(id => blocks.some(b => b.id === id)) && <p>No occupied items remain.</p>}</ReceptionDialog>}
    {composer && <ReceptionComposer session={session} seed={composer} returnFocus={opener.current} onClose={() => { setComposer(null); setMessage("Booking composer closed."); }} />}
  </section>;
}
