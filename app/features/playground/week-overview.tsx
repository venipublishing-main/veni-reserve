import { addDays, formatDemoDate, minutesLabel } from "../demo/booking";
import type { SessionState } from "./session";
import { diaryBlocks, exceptionBlocks } from "./diary-projection";
import { dayPeriods } from "./scheduling";
import { staffTheme } from "./personnel";

/** Dates are business-local civil dates, never converted to the browser timezone. */
export function weekDates(date: string) {
  const weekday = new Date(`${date}T12:00:00Z`).getUTCDay();
  const monday = addDays(date, -((weekday + 6) % 7));
  return Array.from({ length: 7 }, (_, i) => addDays(monday, i));
}
export function weekOverview(state: SessionState, date: string) {
  return weekDates(date).map(day => {
    const blocks = diaryBlocks(state, day), exceptions = exceptionBlocks(state, day, blocks);
    const appointments = state.appointments.filter(a => a.date === day).sort((a, b) => a.startMinute - b.startMinute || a.id.localeCompare(b.id));
    return { date: day, closed: dayPeriods(state.config.hours, day).length === 0,
      appointments: appointments.map(a => ({ appointment: a,
        conflict: blocks.some(b => b.appointmentId === a.id && b.conflict),
        retained: exceptions.some(b => b.appointmentId === a.id),
        detailIds: blocks.filter(b => b.appointmentId === a.id).map(b => b.id),
      })), busy: blocks.filter(b => b.kind === "busy") };
  });
}
const button = "rounded-lg border border-slate-300 bg-white px-3 py-2 text-sm";
export function WeekOverview({ state, today, selectWeek, openDay, openAppointment, newBooking }: {
  state: SessionState; today: string; selectWeek: (date: string) => void; openDay: (date: string) => void;
  openAppointment: (date: string, ids: string[], target: HTMLElement) => void;
  newBooking: (date: string, target: HTMLElement) => void;
}) {
  const days = weekOverview(state, state.diaryDate), count = days.reduce((n, d) => n + d.appointments.length, 0);
  return <div className="reception-board reception-week mt-3 min-h-0 flex-1 overflow-auto" aria-label="Week appointment overview">
    <nav className="mb-3 flex flex-wrap items-center gap-2" aria-label="Week navigation">
      <button className={button} onClick={() => selectWeek(addDays(days[0].date, -7))}>Previous week</button>
      <button className={button} onClick={() => selectWeek(today)}>This week</button>
      <button className={button} onClick={() => selectWeek(addDays(days[0].date, 7))}>Next week</button>
      <p className="text-sm">{days[0].date} – {days[6].date} · {count} {count === 1 ? "booking" : "bookings"}</p>
    </nav>
    <div className="grid gap-3 lg:grid-cols-2">
      {days.map(day => <section key={day.date} className="min-w-0 rounded-xl border border-slate-200 bg-slate-50 p-3" aria-label={day.date}>
        <header className="mb-2 flex flex-wrap items-center justify-between gap-2">
          <h3><button className={`${button} font-semibold`} onClick={() => openDay(day.date)}>{formatDemoDate(day.date)} · {day.date}</button></h3>
          <span className="text-sm">{day.appointments.length} {day.appointments.length === 1 ? "booking" : "bookings"}</span>
          <button className={button} disabled={!state.config.staff.length} onClick={e => newBooking(day.date, e.currentTarget)}>New booking</button>
        </header>
        {day.closed && <p className="text-sm">Closed day{day.appointments.length ? " — retained bookings below" : ""}.</p>}
        {!day.appointments.length && <p className="text-sm text-slate-600">No appointments.</p>}
        <ul className="space-y-2">{day.appointments.map(({ appointment: a, conflict, retained, detailIds }) => <li key={a.id}>
          <button className="week-appointment w-full rounded-lg border border-slate-300 bg-white p-3 text-left text-sm" style={staffTheme(state.config, a.staffId)}
            onClick={e => openAppointment(day.date, detailIds, e.currentTarget)}>
            <strong>{minutesLabel(a.startMinute)}–{minutesLabel(a.startMinute + a.durationMinutes)} · Scheduled</strong>
            <span className="block"><i aria-hidden="true" style={{ background: a.staffColour ?? "var(--staff-colour)" }} className="mr-2 inline-block h-3 w-3 rounded-full border" />{a.staffName ?? a.staffId}</span>
            <span className="block">{a.serviceName ?? a.serviceId} / {a.customerLabel}</span>
            {a.bufferAfterMinutes > 0 && <span className="block">Protected buffer: {minutesLabel(a.startMinute + a.durationMinutes)}–{minutesLabel(a.startMinute + a.durationMinutes + a.bufferAfterMinutes)}</span>}
            {a.bufferOverride && <span className="block">Confirmed operational buffer override</span>}
            {retained && <span className="block">Retained exception: off-grid, out of hours or removed practitioner</span>}
            {conflict && <strong className="block text-red-800">CONFLICT with occupied or closed time</strong>}
          </button>
        </li>)}</ul>
        {day.busy.map(b => <button key={b.id} className={`${button} mt-2 block`} onClick={e => openAppointment(day.date, [b.id], e.currentTarget)}>{minutesLabel(b.start)}–{minutesLabel(b.end)} · Simulated external busy · {state.config.staff.find(p => p.id === b.staffId)?.name ?? b.staffId}{b.conflict ? " / CONFLICT" : ""} (not a booking)</button>)}
      </section>)}
    </div>
  </div>;
}
