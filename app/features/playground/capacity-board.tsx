import { useEffect, useRef, useState } from "react";
import { minutesLabel } from "../demo/booking";
import { ReceptionDialog } from "./reception-dialog";
import type { PlaygroundSession, SessionState } from "./session";
import type { ComposerSeed } from "./reception-composer";
import { canOverrideBuffer } from "./personnel";
import { capacityPage, capacityRows, capacitySummary, rowAvailability } from "./capacity";
import { BookingSpanSurface } from "./booking-span-surface";
import { diaryBlocks } from "./diary-projection";

export function CapacityBoard({ session, state, serviceId, actorId, openDetails, openComposer, mode, suspended = false }: {
  session: PlaygroundSession; state: SessionState; serviceId: string; actorId: string; mode: "click" | "hover"; suspended?: boolean;
  openDetails: (ids: string[], target: HTMLElement, candidate?: ComposerSeed & { minute: number }) => void;
  openComposer: (target: HTMLElement, staffId: string, minute: number, seed?: Partial<ComposerSeed>) => void;
}) {
  const ref = useRef<HTMLDivElement>(null), trigger = useRef<HTMLElement | null>(null);
  const [page, setPage] = useState(0), [size, setSize] = useState(3), [limit, setLimit] = useState(32), [segment, setSegment] = useState(0);
  const [expanded, setExpanded] = useState(false), [now, setNow] = useState<number>();
  useEffect(() => { setNow(Date.now()); const timer = setInterval(() => setNow(Date.now()), 60_000); return () => clearInterval(timer); }, []);
  useEffect(() => {
    const root = ref.current; if (!root) return;
    const measure = () => {
      const box = root.getBoundingClientRect();
      setSize(Math.max(1, Math.min(3, Math.floor((Math.min(box.width, 700) - 90) / 140))));
      // A readable 28px start rail; never silently compress text or omit exact times.
      setLimit(Math.max(4, Math.floor((window.innerHeight - box.top - 160) / 28)));
    };
    measure(); const observer = typeof ResizeObserver === "undefined" ? null : new ResizeObserver(measure); observer?.observe(root);
    window.addEventListener("resize", measure); return () => { observer?.disconnect(); window.removeEventListener("resize", measure); };
  }, []);
  const rows = capacityRows(session, state, state.diaryDate, serviceId, now), pageInfo = capacityPage(state.config.staff, page, size), summary = capacitySummary(rows);
  const groups = Array.from({ length: Math.ceil(rows.length / limit) }, (_, i) => rows.slice(i * limit, (i + 1) * limit));
  const index = Math.min(segment, Math.max(0, groups.length - 1)), selected = groups[index];
  if (!selected?.length) return <p>No working starts. Check retained exceptions.</p>;
  const range = { start: selected[0].start, end: selected.at(-1)!.end };
  const blocks = diaryBlocks(state, state.diaryDate);
  const pin = (ids: string[], target: HTMLElement) => {
    const b = blocks.find(b => ids.includes(b.id) && b.kind === "buffer"), allow = !!b && canOverrideBuffer(state.config, actorId, b.staffId);
    const candidate = b && allow ? { date: state.diaryDate, staffId: b.staffId, minute: b.start, serviceId: serviceId || undefined, actorId, override: true } : undefined;
    openDetails(ids, expanded ? trigger.current ?? target : target, candidate); setExpanded(false);
  };
  const surface = (overlay: boolean) => <BookingSpanSurface key={`${index}:${pageInfo.index}:${limit}:${size}:${overlay ? "range" : "day"}`}
    state={state} rows={rows} people={pageInfo.items.map(p => p.id)} range={range} pitch={overlay ? 44 : 28} mode={!overlay && (expanded || suspended) ? "click" : mode} scope={overlay ? "range" : "day"} now={now} pin={pin}
    book={(row, target) => { const first = rowAvailability(row).choices[0]; if (!first) return; openComposer(overlay ? trigger.current ?? target : target, first.staffId, row.start, { serviceId: first.serviceId, actorId, aggregateAvailability: true }); setExpanded(false); }} />;
  return <div ref={ref} className="reception-board capacity-board mt-3 flex min-h-0 flex-1 flex-col rounded-xl border bg-slate-50 p-3" aria-label="Central day capacity slab">
    <p className="text-xs">{summary.bookings} {summary.bookings === 1 ? "booking" : "bookings"}. White = at least one valid start across all people; neutral = no valid start. Colour = booking; lighter dashed = buffer; stripes + CONFLICT = actual overlap.{summary.conflict ? " CONFLICT present today." : ""}</p>
    <div className="my-2 flex flex-wrap gap-2 text-sm">
      {groups.length > 1 && <label>Time-range group <select aria-label="Time-range group" value={index} onChange={e => { setSegment(Number(e.target.value)); setExpanded(false); }}>{groups.map((g, i) => { const total = capacitySummary(g); return <option key={g[0].start} value={i}>{minutesLabel(g[0].start)}-{minutesLabel(g.at(-1)!.end)} / {total.bookings} bookings{total.buffers ? " / Buffer" : ""}{total.busy ? " / Busy" : ""}{total.conflict ? " / CONFLICT" : ""}</option>; })}</select></label>}
      <button className="capacity-range" onClick={e => { trigger.current = e.currentTarget; setExpanded(true); }}>Expand {minutesLabel(range.start)}-{minutesLabel(range.end)}</button>
      {pageInfo.pages > 1 && <label>People page <select aria-label="People page" value={pageInfo.index} onChange={e => { setPage(Number(e.target.value)); setExpanded(false); }}>{Array.from({ length: pageInfo.pages }, (_, i) => <option key={i} value={i}>{state.config.staff.slice(i * size, (i + 1) * size).map(p => p.name).join(", ")}</option>)}</select> ({pageInfo.index + 1}/{pageInfo.pages})</label>}
    </div>
    {groups.length > 1 && <p className="mb-2 text-xs">Readable range view: {rows.length} exact starts across {groups.length} ranges. Select each range to inspect the whole day; arrows mark continuing spans. Availability always includes every person.</p>}
    {surface(false)}
    <p className="mt-2 text-xs">Exact endpoints include row spacing. Short segments retain exact size; click/focus for full times and details, or expand for more room. Agenda remains available.</p>
    {expanded && <ReceptionDialog title={`Capacity ${minutesLabel(range.start)}-${minutesLabel(range.end)}`} movable onClose={() => setExpanded(false)} returnFocus={trigger.current}>
      <p className="mb-2 text-sm">Exact starts and continuous spans. Same details preference as Day. Click to pin; Escape dismisses a preview first.</p>{surface(true)}
    </ReceptionDialog>}
  </div>;
}
