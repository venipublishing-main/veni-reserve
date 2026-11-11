import { useEffect, useRef, useState } from "react";
import type { HTMLAttributes } from "react";
import { minutesLabel } from "../demo/booking";
import { ReceptionDialog } from "./reception-dialog";
import type { PlaygroundSession, SessionState } from "./session";
import type { ComposerSeed } from "./reception-composer";
import { canOverrideBuffer, staffTheme } from "./personnel";
import { capacityPage, capacityRows, capacitySummary, groupCapacityRows } from "./capacity";
import type { CapacityRow } from "./capacity";

type PreviewEvents = Pick<HTMLAttributes<HTMLElement>, "onPointerEnter" | "onPointerLeave" | "onFocus" | "onBlur">;
export function CapacityBoard({ session, state, serviceId, actorId, openDetails, openComposer, previewEvents, dismissPreview }: {
  session: PlaygroundSession; state: SessionState; serviceId: string; actorId: string;
  openDetails: (ids: string[], target: HTMLElement, candidate?: ComposerSeed & { minute: number }) => void;
  openComposer: (target: HTMLElement, staffId: string, minute: number, seed?: Partial<ComposerSeed>) => void;
  previewEvents: (ids: string[]) => PreviewEvents; dismissPreview: () => void;
}) {
  const ref = useRef<HTMLDivElement>(null), trigger = useRef<HTMLElement | null>(null);
  const [page, setPage] = useState(0), [size, setSize] = useState(6), [limit, setLimit] = useState(32), [columns, setColumns] = useState(2);
  const [range, setRange] = useState<{ start: number; end: number } | null>(null), [now, setNow] = useState<number>();
  useEffect(() => { setNow(Date.now()); const timer = setInterval(() => setNow(Date.now()), 60_000); return () => clearInterval(timer); }, []);
  useEffect(() => {
    const root = ref.current; if (!root) return;
    const measure = () => {
      const box = root.getBoundingClientRect(), cols = box.width >= 820 ? 2 : 1;
      const fit = Math.max(1, Math.min(6, Math.floor((box.width / cols - 60) / 69)));
      setColumns(cols); setSize(state.config.staff.length > fit ? Math.max(1, Math.floor((box.width / cols - 170) / 69)) : fit);
      setLimit(Math.max(4, Math.floor((box.height - 100) / 34) * cols));
    };
    measure(); const observer = typeof ResizeObserver === "undefined" ? null : new ResizeObserver(measure); observer?.observe(root);
    window.addEventListener("resize", measure); return () => { observer?.disconnect(); window.removeEventListener("resize", measure); };
  }, [state.config.staff.length]);
  const rows = capacityRows(session, state, state.diaryDate, serviceId, now), pageInfo = capacityPage(state.config.staff, page, size);
  const shown = new Set(pageInfo.items.map(p => p.id)), summary = capacitySummary(rows), groups = groupCapacityRows(rows, limit);
  const renderRow = (row: CapacityRow, overlay = false) => <div className="capacity-row" key={row.start} data-time={row.start}>
    <time className="text-xs font-semibold">{minutesLabel(row.start)}</time>
    <div className="capacity-cells">
      {row.cells.filter(cell => shown.has(cell.staffId)).map(cell => {
        const person = state.config.staff.find(p => p.id === cell.staffId)!, tile = cell.tile;
        const allowOverride = tile.blocks.some(b => b.kind === "buffer") && canOverrideBuffer(state.config, actorId, cell.staffId);
        const candidate = (allowOverride || cell.serviceId) ? { date: state.diaryDate, staffId: cell.staffId, minute: row.start, serviceId: cell.serviceId ?? (serviceId || undefined), actorId, override: allowOverride } : undefined;
        return <button key={cell.staffId} type="button" style={staffTheme(state.config, cell.staffId)} data-state={cell.status} data-conflict={tile.conflict || undefined} data-staff={cell.staffId}
          className="capacity-cell" disabled={cell.status === "Blocked" && !tile.blocks.length}
          aria-label={`${person.name}, ${minutesLabel(row.start)}-${minutesLabel(row.end)}: ${cell.status}${cell.available && tile.blocks.length ? "; exact short start also bookable: inspect details" : ""}. ${tile.blocks.map(b => `${minutesLabel(b.start)}-${minutesLabel(b.end)} ${b.label}`).join("; ")}`}
          {...(tile.blocks.length && !overlay ? previewEvents(tile.detailIds) : {})}
          onClick={e => {
            const target = overlay ? trigger.current ?? e.currentTarget : e.currentTarget;
            if (overlay) setRange(null);
            if (tile.blocks.length) openDetails(tile.detailIds, target, candidate);
            else if (cell.available) openComposer(target, cell.staffId, row.start, { serviceId: cell.serviceId, actorId });
          }}><span className="truncate">{person.initials || person.name.slice(0, 2)}</span><span className="truncate text-[11px]">{cell.status}{cell.available && tile.blocks.length ? " + start" : ""}</span></button>;
      })}
    </div>
    {pageInfo.pages > 1 && <span className="text-xs">{row.cells.filter(c => c.available).length}/{row.cells.length} free overall</span>}
  </div>;
  return <div ref={ref} className="reception-board capacity-board mt-3 flex min-h-0 flex-1 flex-col rounded-xl border bg-slate-50 p-3" aria-label="Central day capacity slab">
    <div className="mb-2 flex flex-wrap items-center justify-between gap-2 text-xs">
      <span>{summary.bookings} {summary.bookings === 1 ? "booking" : "bookings"} · {serviceId ? "Selected service" : "Any eligible service"}. White = bookable; grey = blocked. Read down, then right.</span>
      <div className="flex flex-wrap gap-2">{pageInfo.items.map(p => <span key={p.id} style={staffTheme(state.config, p.id)} className="capacity-person"><i />{p.name}</span>)}</div>
      {pageInfo.pages > 1 && <div>People page {pageInfo.index + 1}/{pageInfo.pages}, showing {pageInfo.items.length} of {pageInfo.total}. All-person totals remain visible. <button onClick={() => setPage(pageInfo.index - 1)} disabled={pageInfo.index === 0}>Previous people</button> / <button onClick={() => setPage(pageInfo.index + 1)} disabled={pageInfo.index + 1 === pageInfo.pages}>Next people</button></div>}
    </div>
    <div className="capacity-slab" style={{ gridTemplateColumns: `repeat(${columns}, minmax(0, 1fr))`, gridTemplateRows: `repeat(${Math.ceil(groups.length / columns)}, auto)` }}>
      {groups.map(group => {
        if (group.length === 1) return renderRow(group[0]);
        const first = group[0], last = group.at(-1)!, total = capacitySummary(group);
        return <button key={first.start} aria-label={`time-range group ${minutesLabel(first.start)}-${minutesLabel(last.end)}, ${group.length} exact rows, ${total.available} bookable cells, ${total.bookings} bookings${total.conflict ? ", CONFLICT" : ""}`} className={`capacity-range ${total.conflict ? "reception-block-conflict" : ""}`} type="button" onClick={e => { dismissPreview(); trigger.current = e.currentTarget; setRange({ start: first.start, end: last.end }); }}>
          <strong>{minutesLabel(first.start)}-{minutesLabel(last.end)}</strong> · {group.length} exact rows · {total.available} bookable cells · {total.bookings} bookings{total.buffers ? " / Buffer" : ""}{total.busy ? " / Busy" : ""}{total.conflict ? " / CONFLICT" : ""}
        </button>;
      })}
    </div>
    <p className="mt-2 text-xs text-slate-600">{groups.some(g => g.length > 1) ? "Time-range groups retain every exact row; open one to inspect all capacity." : "Each position is one practitioner. Closed periods are omitted; no duration is rounded."}</p>
    {range && <ReceptionDialog title={`Capacity ${minutesLabel(range.start)}-${minutesLabel(range.end)}`} movable onClose={() => setRange(null)} returnFocus={trigger.current}>
      <p className="text-sm">Every exact row in this range. People page {pageInfo.index + 1}/{pageInfo.pages}; close to change the people page.</p>
      <div className="space-y-1">{rows.filter(r => r.start >= range.start && r.start < range.end).map((row, i, all) => <div key={row.start}>{i > 0 && all[i - 1].end !== row.start && <p className="text-xs">Closed {minutesLabel(all[i - 1].end)}-{minutesLabel(row.start)}</p>}{renderRow(row, true)}</div>)}</div>
    </ReceptionDialog>}
  </div>;
}
