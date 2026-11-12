import { useEffect, useLayoutEffect, useMemo, useRef, useState } from "react";
import { addDays, formatDemoDate, minutesLabel } from "../demo/booking";
import { weekDates, weekOverview } from "./week-overview";
import { dayPeriods } from "./scheduling";
import { clockScale } from "./booking-spans";
import { BookingSpanSurface } from "./booking-span-surface";
import { capacityRows, rowAvailability } from "./capacity";
import { exceptionBlocks } from "./diary-projection";
import { useTimetableNavigation } from "./use-timetable-navigation";
import { lanesWidth, TIME_RAIL, LANE_WIDTH } from "./timetable-camera";
import { staffTheme } from "./personnel";
import type { PlaygroundSession, SessionState } from "./session";
import type { ComposerSeed } from "./reception-composer";

export function weekRange(state: SessionState, dates: string[]) {
  const periods = dates.flatMap(d => dayPeriods(state.config.hours, d));
  return periods.length ? { start: Math.min(...periods.map(p => p.opens)), end: Math.max(...periods.map(p => p.closes)) } : { start: 540, end: 1020 };
}
export function WeekTimetable({ state, session, today, serviceId, actorId, mode, suspended, openDay, openDetails, openComposer }: {
  state: SessionState; session: PlaygroundSession; today: string; serviceId: string; actorId: string; mode: "click" | "hover"; suspended: boolean;
  openDay: (date: string) => void; openDetails: (date: string, ids: string[], target: HTMLElement) => void;
  openComposer: (target: HTMLElement, staffId: string, minute?: number, seed?: Partial<ComposerSeed>) => void;
}) {
  const dates = weekDates(state.diaryDate), range = weekRange(state, dates), people = state.config.staff.map(p => p.id);
  const groupWidth = TIME_RAIL + Math.max(LANE_WIDTH, lanesWidth(people.length)) + 16;
  const [moving, setMoving] = useState(false), scrollbar = useRef<HTMLDivElement>(null);
  const headings = useRef<HTMLDivElement>(null), [headingHeight, setHeadingHeight] = useState(112);
  const world = { width: dates.length * groupWidth, height: clockScale(state, dates[0], range, 32).height };
  const nav = useTimetableNavigation(world, !suspended, setMoving, 0);
  const [now, setNow] = useState<number>();
  useEffect(() => { setNow(Date.now()); const timer = setInterval(() => setNow(Date.now()), 60_000); return () => clearInterval(timer); }, []);
  const first = dates[0];
  const rows = useMemo(() => weekDates(first).map(date => capacityRows(session, state, date, serviceId, now)), [first, session, state, serviceId, now]);
  const overview = weekOverview(state, state.diaryDate);
  useLayoutEffect(() => {
    const root = headings.current; if (!root) return;
    const measure = () => setHeadingHeight(Math.max(112, ...Array.from(root.children).map(e => e.getBoundingClientRect().height)));
    measure(); const observer = new ResizeObserver(measure); Array.from(root.children).forEach(e => observer.observe(e)); return () => observer.disconnect();
  }, []);
  useEffect(() => { nav.horizontal(dates.indexOf(state.diaryDate) * groupWidth); }, []);
  useEffect(() => { if (scrollbar.current && Math.abs(scrollbar.current.scrollLeft - nav.camera.x) > 1) scrollbar.current.scrollLeft = nav.camera.x; }, [nav.camera.x]);
  const count = overview.reduce((n, d) => n + d.appointments.length, 0);
  return <div className="reception-board week-timetable mt-3 flex min-h-0 flex-1 flex-col gap-1" aria-label="Shared week timetable">
    <nav className="timetable-tools" aria-label="Week navigation">
      <button onClick={() => session.selectDiaryDate(addDays(first, -7))}>Previous week</button><button onClick={() => session.selectDiaryDate(today)}>This week</button><button onClick={() => session.selectDiaryDate(addDays(first, 7))}>Next week</button>
      <span>{first} – {dates[6]} / {count} bookings / {minutesLabel(range.start)}–{minutesLabel(range.end)}</span>
    </nav>
    <div className="timetable-tools" aria-label="Timetable navigation">
      <button onClick={() => nav.zoom(1.25)}>+</button><button onClick={() => nav.zoom(.8)}>−</button><button onClick={nav.fit}>Fit day</button><button onClick={nav.readable}>Readable / reset</button>
      <button aria-pressed={nav.hand} onClick={nav.toggleHand}>Hand</button><button onClick={() => nav.shift(0, -120)}>Earlier</button><button onClick={() => nav.shift(0, 120)}>Later</button>
      <button onClick={() => nav.shift(-groupWidth, 0)}>Previous day columns</button><button onClick={() => nav.shift(groupWidth, 0)}>Next day columns</button>
    </div>
    <p className="text-xs">All seven dates remain on one clock scale. Scroll horizontally or pan for other days. {count} occupied bookings{overview.some(d => d.appointments.some(a => a.conflict) || d.busy.some(b => b.conflict)) ? " / CONFLICT present" : ""}; check dated headings and exceptions, including offscreen days.</p>
    <div ref={headings} className="week-headings relative shrink-0 overflow-hidden" style={{ height: headingHeight }}>
      {dates.map((date, i) => {
        const exceptions = exceptionBlocks(state, date);
        return <div key={date} className="absolute top-0 px-2 text-sm" style={{ left: i * groupWidth - nav.camera.x, width: groupWidth }}>
          <button className="rounded border bg-white px-2 py-1 font-semibold" onClick={() => openDay(date)}>{formatDemoDate(date)} · {date}</button>
          <p>{overview[i].appointments.length} bookings{overview[i].closed ? " / Closed" : ""}{overview[i].appointments.some(a => a.conflict) ? " / CONFLICT" : ""}</p>
          {!!exceptions.length && <button className="rounded border px-1 text-xs" onClick={e => openDetails(date, exceptions.map(b => b.id), e.currentTarget)}>Retained exceptions: {exceptions.length} occupied items</button>}
          <div className="mt-1 flex items-start gap-1 text-xs"><span style={{ width: TIME_RAIL - 4, flexShrink: 0 }}>Start</span>{people.map(id => <span key={id} className="capacity-person items-start break-words" style={{ ...staffTheme(state.config, id), width: LANE_WIDTH, flexShrink: 0, overflowWrap: "anywhere" }}><i />{state.config.staff.find(s => s.id === id)?.name}</span>)}</div>
        </div>;
      })}
    </div>
    <div ref={nav.viewport} className="span-viewport" tabIndex={0} role="group" aria-label="Week timetable: wheel zoom, middle-drag pan" data-hand={nav.hand || undefined} data-dragging={nav.dragging || undefined} {...nav.viewportEvents}>
      {dates.map((date, i) => i * groupWidth + groupWidth < nav.camera.x - groupWidth || i * groupWidth > nav.camera.x + nav.view.width + groupWidth ? null : <div key={date} data-date={date} className="absolute inset-y-0 flex border-r border-slate-300 pr-4" style={{ left: i * groupWidth - nav.camera.x, width: groupWidth }}>
        <BookingSpanSurface state={state} rows={rows[i]} people={people} range={range} pitch={32} mode={mode} scope="day" now={now} active={!suspended}
          shared={{ date, camera: nav.camera, height: nav.view.height, moving, offset: i * groupWidth }}
          pin={(ids, target) => openDetails(date, ids, target)} book={(row, target) => { const choice = rowAvailability(row).choices[0]; if (choice) openComposer(target, choice.staffId, row.start, { date, serviceId: choice.serviceId, actorId, aggregateAvailability: true }); }} />
      </div>)}
    </div>
    <div ref={scrollbar} className="h-5 shrink-0 overflow-x-auto overflow-y-hidden" aria-label="Scroll week horizontally" onScroll={e => { if (Math.abs(e.currentTarget.scrollLeft - nav.camera.x) > 1) nav.horizontal(e.currentTarget.scrollLeft); }}><div style={{ width: world.width, height: 1 }} /></div>
  </div>;
}
