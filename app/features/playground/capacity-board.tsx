import { useEffect, useRef, useState } from "react";
import { ReceptionDialog } from "./reception-dialog";
import type { PlaygroundSession, SessionState } from "./session";
import type { ComposerSeed } from "./reception-composer";
import { canOverrideBuffer } from "./personnel";
import { capacityRows, capacitySummary, rowAvailability } from "./capacity";
import { BookingSpanSurface } from "./booking-span-surface";
import { diaryBlocks } from "./diary-projection";

export function CapacityBoard({ session, state, serviceId, actorId, openDetails, openComposer, mode, suspended = false }: {
  session: PlaygroundSession; state: SessionState; serviceId: string; actorId: string; mode: "click" | "hover"; suspended?: boolean;
  openDetails: (ids: string[], target: HTMLElement, candidate?: ComposerSeed & { minute: number }) => void;
  openComposer: (target: HTMLElement, staffId: string, minute: number, seed?: Partial<ComposerSeed>) => void;
}) {
  const trigger = useRef<HTMLElement | null>(null);
  const [expanded, setExpanded] = useState(false), [now, setNow] = useState<number>();
  useEffect(() => { setNow(Date.now()); const timer = setInterval(() => setNow(Date.now()), 60_000); return () => clearInterval(timer); }, []);
  const rows = capacityRows(session, state, state.diaryDate, serviceId, now), summary = capacitySummary(rows);
  if (!rows.length) return <p>No working starts. Check retained exceptions.</p>;
  const range = { start: rows[0].start, end: rows.at(-1)!.end };
  const blocks = diaryBlocks(state, state.diaryDate);
  const pin = (ids: string[], target: HTMLElement) => {
    const b = blocks.find(b => ids.includes(b.id) && b.kind === "buffer"), allow = !!b && canOverrideBuffer(state.config, actorId, b.staffId);
    const candidate = b && allow ? { date: state.diaryDate, staffId: b.staffId, minute: b.start, serviceId: serviceId || undefined, actorId, override: true } : undefined;
    openDetails(ids, expanded ? trigger.current ?? target : target, candidate); setExpanded(false);
  };
  const surface = (overlay: boolean) => <BookingSpanSurface key={overlay ? "expanded" : "day"}
    state={state} rows={rows} people={state.config.staff.map(p => p.id)} range={range} pitch={32} mode={!overlay && (expanded || suspended) ? "click" : mode} active={overlay || (!expanded && !suspended)} scope={overlay ? "range" : "day"} now={now} pin={pin}
    book={(row, target) => { const first = rowAvailability(row).choices[0]; if (!first) return; openComposer(overlay ? trigger.current ?? target : target, first.staffId, row.start, { serviceId: first.serviceId, actorId, aggregateAvailability: true }); setExpanded(false); }} />;
  return <div className="reception-board capacity-board mt-3 flex min-h-0 flex-1 flex-col rounded-xl border bg-slate-50 p-3" aria-label="Central day capacity slab">
    <div className="mb-2 flex items-center justify-between gap-2 text-xs"><span>{summary.bookings} {summary.bookings === 1 ? "booking" : "bookings"} / Whole day{summary.conflict ? " / CONFLICT present" : ""}</span>
      <button className="capacity-range" onClick={e => { trigger.current = e.currentTarget; setExpanded(true); }}>Expand day</button></div>
    {surface(false)}
    {expanded && <ReceptionDialog title="Day capacity" movable onClose={() => setExpanded(false)} returnFocus={trigger.current}>{surface(true)}</ReceptionDialog>}
  </div>;
}
