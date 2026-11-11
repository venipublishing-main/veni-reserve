import { useEffect, useRef, useState } from "react";
import type { HTMLAttributes } from "react";
import { minutesLabel } from "../demo/booking";
import { timeButtonClass } from "../booking/time-button";
import type { PlaygroundSession, SessionState } from "./session";
import { ReceptionDialog } from "./reception-dialog";
import { laneFamily, blockPresentation } from "./day-presentation";
import { bookingCount, groupTimeTiles, tileAction, tileStatus, timeTiles } from "./time-tiles";
import type { TimeTile } from "./time-tiles";

type PreviewEvents = Pick<HTMLAttributes<HTMLElement>, "onPointerEnter" | "onPointerLeave" | "onFocus" | "onBlur">;
export function TimeTileBoard({ session, state, person, serviceId, openDetails, openComposer, previewEvents, dismissPreview }: {
  session: PlaygroundSession; state: SessionState; person: string; serviceId: string;
  openDetails: (ids: string[], target: HTMLElement, candidate?: { staffId: string; minute: number }) => void;
  openComposer: (target: HTMLElement, staffId: string, minute: number) => void;
  previewEvents: (ids: string[]) => PreviewEvents; dismissPreview: () => void;
}) {
  const board = useRef<HTMLDivElement>(null), [limit, setLimit] = useState(32);
  const [range, setRange] = useState<{ staffId: string; start: number; end: number } | null>(null);
  const trigger = useRef<HTMLElement | null>(null);
  const [now, setNow] = useState<number>();
  useEffect(() => { setNow(Date.now()); const timer = setInterval(() => setNow(Date.now()), 60_000); return () => clearInterval(timer); }, []);
  useEffect(() => {
    const root = board.current; if (!root) return;
    const measure = () => {
      const panel = Array.from(root.querySelectorAll<HTMLElement>(".time-person")).find(p => p.getBoundingClientRect().width > 0);
      if (!panel) return;
      const width = panel.getBoundingClientRect().width - 24, height = root.getBoundingClientRect().height;
      const columns = Math.max(1, Math.floor((width + 6) / 76));
      // Reserve room for the person header and compact working-period separators.
      const rows = Math.max(1, Math.floor((height - 108) / 58));
      setLimit(Math.min(48, Math.max(4, columns * rows)));
    };
    measure(); const observer = typeof ResizeObserver === "undefined" ? null : new ResizeObserver(measure); observer?.observe(root);
    window.addEventListener("resize", measure);
    return () => { observer?.disconnect(); window.removeEventListener("resize", measure); };
  }, [person]);
  const all = state.config.staff.map(p => ({ person: p, tiles: timeTiles(state, state.diaryDate, p.id,
    serviceId ? session.slots(state.diaryDate, serviceId, p.id) : undefined, now) }));
  const openFromRange = (action: () => void) => { setRange(null); action(); };
  const renderTile = (tile: TimeTile, staffId: string, overlay = false) => {
    const action = tileAction(tile), status = tileStatus(tile);
    const kind = tile.blocks.some(b => b.kind === "appointment") ? "appointment" : tile.blocks.some(b => b.kind === "busy") ? "busy" : "buffer";
    const hints = tile.blocks.map(b => `${minutesLabel(b.start)}-${minutesLabel(b.end)} ${b.label}`).join("; ");
    const canAlsoCompose = tile.blocks.length > 0 && !tile.startOccupied && tile.bookable !== false;
    const target = (button: HTMLElement) => overlay ? trigger.current ?? button : button;
    return <div key={tile.start} className="min-w-0">
      <button type="button" data-time={tile.start} data-conflict={tile.conflict || undefined}
        className={`${timeButtonClass()} reception-time-tile w-full ${tile.blocks.length ? blockPresentation(kind, tile.conflict) : "reception-free"}`}
        disabled={action.kind === "none"} {...(tile.blocks.length && !overlay ? previewEvents(tile.detailIds) : {})}
        aria-label={`${minutesLabel(tile.start)}-${minutesLabel(tile.end)}: ${status}. ${hints}${tile.blocks.length ? " Open exact details." : ""}`}
        onClick={e => {
          const element = target(e.currentTarget);
          const run = () => { if (action.kind === "details") openDetails(action.ids, element, canAlsoCompose ? { staffId, minute: tile.start } : undefined); else if (action.kind === "compose") openComposer(element, staffId, action.minute); };
          if (overlay) openFromRange(run); else run();
        }}><span className="block text-sm font-semibold">{minutesLabel(tile.start)}</span><span className="line-clamp-2 text-xs font-normal">{status}</span></button>

    </div>;
  };
  const selectedRange = range && all.find(p => p.person.id === range.staffId);
  return <div ref={board} className="reception-board time-tile-board mt-3 grid min-h-0 flex-1 gap-3" style={{ gridTemplateColumns: `repeat(${Math.max(all.length, 1)}, minmax(0, 1fr))` }}>
    {all.map(({ person: p, tiles }, index) => <section key={p.id} data-selected={p.id === person} data-family={laneFamily(index)} className="board-person time-person min-w-0 rounded-xl border border-slate-200 p-3" aria-label={`${p.name} time tiles`}>
      <header className="mb-2 flex items-center justify-between gap-2 text-sm"><strong className="truncate">{p.name}</strong><span className="shrink-0 text-xs">{bookingCount(tiles)} {bookingCount(tiles) === 1 ? "booking" : "bookings"}</span></header>
      <div className="time-tile-grid grid gap-1.5">
        {groupTimeTiles(tiles, limit).map((group, index, groups) => {
          const first = group[0], last = group.at(-1)!, previous = groups[index - 1]?.at(-1);
          const conflict = group.some(t => t.conflict), ids = [...new Set(group.flatMap(t => t.detailIds))];
          const mixedPeriod = first.period !== last.period;
          return <div className="contents" key={first.start}>
            {group.length === 1 && groups.every(g => g.length === 1) && previous && previous.period !== first.period && <p className="col-span-full text-xs text-slate-600">Break {minutesLabel(previous.end)}-{minutesLabel(first.start)}</p>}
            {group.length === 1 ? renderTile(first, p.id) : <button type="button" className={`${timeButtonClass()} reception-time-tile ${conflict ? "reception-block-conflict" : "bg-slate-50"}`} data-conflict={conflict || undefined}
              aria-label={`${minutesLabel(first.start)}-${minutesLabel(last.end)}, time-range group: ${group.length} exact starts, ${bookingCount(group)} bookings${conflict ? ", CONFLICT" : ""}${group.some(t => t.blocks.some(b => b.kind === "buffer")) ? ", Buffer" : ""}${group.some(t => t.blocks.some(b => b.kind === "busy")) ? ", Busy" : ""}${mixedPeriod ? ", includes breaks" : ""}. Open all times and items.`}
              {...(ids.length ? previewEvents(ids) : {})}
              onClick={e => { dismissPreview(); trigger.current = e.currentTarget; setRange({ staffId: p.id, start: first.start, end: last.end }); }}>
              <span className="block text-sm">{minutesLabel(first.start)}-{minutesLabel(last.end)}</span><span className="line-clamp-2 text-xs font-normal">{conflict ? "CONFLICT / " : ""}{group.length} starts / {bookingCount(group)} bookings{group.some(t => t.blocks.some(b => b.kind === "buffer")) ? " / Buffer" : ""}{group.some(t => t.blocks.some(b => b.kind === "busy")) ? " / Busy" : ""}{mixedPeriod ? " / breaks" : ""}</span>
            </button>}
          </div>;
        })}
      </div>
      {groupTimeTiles(tiles, limit).some(g => g.length > 1) && <p className="mt-2 text-xs text-slate-600">Time-range groups: open to see every exact start and occupied item.</p>}
    </section>)}
    {range && selectedRange && <ReceptionDialog movable title={`${selectedRange.person.name}: ${minutesLabel(range.start)}-${minutesLabel(range.end)}`} onClose={() => setRange(null)} returnFocus={trigger.current}>
      <p className="text-sm">All exact configured starts in this range. Occupied tiles open exact appointment and buffer details; ranges never change the booking grid.</p>
      <div className="time-tile-grid grid gap-2" data-family={laneFamily(all.indexOf(selectedRange))}>
        {selectedRange.tiles.filter(t => t.start >= range.start && t.start < range.end).map((tile, index, tiles) => <div className="contents" key={tile.start}>
          {index > 0 && tiles[index - 1].period !== tile.period && <p className="col-span-full text-xs">Break {minutesLabel(tiles[index - 1].end)}-{minutesLabel(tile.start)}</p>}
          {renderTile(tile, range.staffId, true)}
        </div>)}
      </div>
    </ReceptionDialog>}
  </div>;
}
