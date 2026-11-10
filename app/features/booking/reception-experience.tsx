import { useMemo, useState } from "react";
import { Link } from "react-router";
import { bookingTheme } from "./theme";
import type { DemoAppointment, DemoService, DemoPractitioner } from "../demo/booking";
import {
  addDays,
  DEMO_BUSINESS,
  DEMO_PRACTITIONERS,
  DEMO_SERVICES,
  formatDemoDate,
  minutesLabel,
  syntheticAppointments,
} from "../demo/booking";

export type ReceptionAppointment = DemoAppointment & { serviceName?: string; staffName?: string };
export function ReceptionExperience({ today, business = DEMO_BUSINESS,
  people = DEMO_PRACTITIONERS, services = DEMO_SERVICES, appointmentsFor = syntheticAppointments,
  onCancel, onBooking, initialDate, selectedDate, onDateChange,
}: {
  today: string;
  initialDate?: string; selectedDate?: string; onDateChange?: (date: string) => void;
  business?: { name: string; descriptor: string; primary?: string; accent?: string };
  people?: readonly DemoPractitioner[]; services?: readonly DemoService[];
  appointmentsFor?: (date: string) => ReceptionAppointment[];
  onCancel?: (id: string) => void; onBooking?: () => void;
}) {
  const [localDate, setLocalDate] = useState(initialDate ?? today);
  const date = selectedDate ?? localDate;
  const setDate = onDateChange ?? setLocalDate;
  const [filter, setFilter] = useState("all");
  const dateOptions = useMemo(
    () => Array.from({ length: onCancel ? 15 : 12 }, (_, index) => addDays(today, index)),
    [today, onCancel],
  );
  const options = dateOptions.includes(date) ? dateOptions : [...dateOptions, date];
  const all = appointmentsFor(date);
  const appointments = all.filter((entry) => filter === "all" || entry.staffId === filter);
  const timeBooked = all.reduce((sum, entry) => sum + entry.durationMinutes, 0);
  const staffNames = Object.fromEntries(people.map((person) => [person.id, person.name]));
  const serviceNames = Object.fromEntries(services.map((service) => [service.id, service.name]));

  return (
    <main style={bookingTheme(business.primary, business.accent)} className="min-h-screen bg-[#f5f7f4] text-[#23372c]">
      <div className="bg-[#fff4d9] px-5 py-2.5 text-center text-xs font-semibold text-[#765121]">
        {onCancel ? "PLAYGROUND RECEPTION · Synthetic appointments in this tab only" : "SYNTHETIC RECEPTION PREVIEW · No authentication, real customers, database reads or appointment changes"}
      </div>
      <div className="mx-auto flex max-w-7xl flex-col lg:min-h-[calc(100vh-36px)] lg:flex-row">
        <aside className="border-b border-[#e1e9df] bg-white px-6 py-6 lg:w-64 lg:shrink-0 lg:border-b-0 lg:border-r">
          <Link to="/" className="flex items-center gap-3">
            <span className="flex h-11 w-11 items-center justify-center rounded-xl bg-[var(--booking-primary)] text-xl font-bold text-[var(--booking-on-primary)]">V</span>
            <span><span className="block text-lg font-bold tracking-tight">Veni Reserve</span><span className="text-xs text-[#8e9e91]">Business workspace</span></span>
          </Link>
          <div className="mt-8 rounded-2xl bg-[#eef4ef] p-4">
            <span className="text-xs font-bold uppercase tracking-wider text-[#8ba18e]">{onCancel ? "Your temporary business" : "Demo tenant 001"}</span>
            <p className="mt-2 font-semibold">{business.name}</p>
            <p className="mt-1 text-xs text-[#738675]">{business.descriptor}{!onCancel && " · Pretoria"}</p>
          </div>
          <nav className="mt-7 flex flex-wrap gap-2 lg:flex-col" aria-label="Workspace preview">
            <span className="rounded-xl bg-[var(--booking-primary)] px-4 py-3 text-sm font-semibold text-[var(--booking-on-primary)]">▦ &nbsp; Today's overview</span>
            <span className="rounded-xl px-4 py-3 text-sm text-[#8c9c8d]">▤ &nbsp; Calendar · Coming later</span>
            <span className="rounded-xl px-4 py-3 text-sm text-[#8c9c8d]">◷ &nbsp; Availability · Coming later</span>
            <span className="rounded-xl px-4 py-3 text-sm text-[#8c9c8d]">✧ &nbsp; Customisation · Coming later</span>
          </nav>
          <div className="mt-8 lg:mt-16">
            {onBooking ? <button type="button" onClick={onBooking} className="rounded-full border px-4 py-2.5 text-sm font-semibold">Booking preview</button> : <Link to="/demo/vvb" className="inline-block rounded-full border border-[#ccdacc] px-4 py-2.5 text-sm font-semibold text-[#315543] hover:bg-[#f0f6ef]">
              ← Public booking preview
            </Link>}
          </div>
        </aside>
        <div className="min-w-0 flex-1 px-5 py-9 sm:px-9 lg:py-12">
          <div className="flex flex-wrap items-end justify-between gap-5">
            <div>
              <p className="text-xs font-bold uppercase tracking-[0.22em] text-[#829a84]">Reception workspace · Demo</p>
              <h1 className="mt-3 text-3xl font-semibold tracking-tight sm:text-4xl">A clearer view of your day.</h1>
              <p className="mt-3 max-w-xl text-sm leading-6 text-[#738577]">A first look at the daily overview your team could use to manage appointments.</p>
            </div>
            <label className="text-xs font-bold uppercase tracking-wider text-[#789079]">Preview date
              <select value={date} onChange={(event) => setDate(event.target.value)}
                className="mt-2 block min-w-48 rounded-xl border border-[#d7e1d5] bg-white px-4 py-3 text-sm font-semibold normal-case tracking-normal text-[#304638]">
                {options.map((value) => <option key={value} value={value}>{formatDemoDate(value)}</option>)}
              </select>
            </label>
          </div>

          <div className="mt-9 grid gap-4 sm:grid-cols-3">
            {[
              { label: "Demo appointments", value: String(all.length), note: "Scheduled sample entries" },
              { label: "Time booked", value: `${Math.floor(timeBooked / 60)}h ${String(timeBooked % 60).padStart(2, "0")}m`, note: "Illustrative service duration" },
              { label: "Team members", value: String(people.length), note: "Fictional practitioners" },
            ].map((metric) => (
              <div key={metric.label} className="rounded-[22px] border border-[#e0e7de] bg-white p-6">
                <p className="text-xs font-semibold uppercase tracking-wider text-[#8a9c8d]">{metric.label}</p>
                <p className="mt-4 text-3xl font-semibold tracking-tight text-[#264b3a]">{metric.value}</p>
                <p className="mt-2 text-xs text-[#849486]">{metric.note}</p>
              </div>
            ))}
          </div>

          <section className="mt-7 overflow-hidden rounded-[24px] border border-[#e0e7de] bg-white">
            <div className="flex flex-wrap items-end justify-between gap-4 border-b border-[#edf1eb] px-6 py-6">
              <div>
                <h2 className="text-xl font-semibold">Appointment schedule</h2>
                <p className="mt-1 text-sm text-[#829083]">{formatDemoDate(date)} · Synthetic sample bookings</p>
              </div>
              <label className="text-xs font-semibold text-[#788a7a]">Practitioner
                <select value={filter} onChange={(event) => setFilter(event.target.value)}
                  className="mt-1.5 block rounded-lg border border-[#dce6d9] bg-white px-3 py-2 text-sm text-[#3e5947]">
                  <option value="all">All practitioners</option>
                  {people.map((person) => <option key={person.id} value={person.id}>{person.name}</option>)}
                </select>
              </label>
            </div>
            <div className="overflow-x-auto">
              <table className="w-full min-w-[620px] text-left text-sm">
                <thead><tr className="bg-[#f7f9f5] text-xs font-semibold uppercase tracking-wider text-[#91a092]">
                  <th scope="col" className="px-6 py-4">Time</th>
                  <th scope="col" className="px-6 py-4">Sample visitor</th>
                  <th scope="col" className="px-6 py-4">Service</th>
                  <th scope="col" className="px-6 py-4">Practitioner</th>
                  <th scope="col" className="px-6 py-4">Status</th>
                  {onCancel && <th scope="col" className="px-6 py-4">Action</th>}
                </tr></thead>
                <tbody>
                  {appointments.map((appointment) => (
                    <tr key={appointment.id} className="border-t border-[#edf1eb]">
                      <td className="whitespace-nowrap px-6 py-5 font-semibold text-[#355e47]">{minutesLabel(appointment.startMinute)}</td>
                      <td className="px-6 py-5">{appointment.customerLabel}</td>
                      <td className="px-6 py-5 text-[#607362]">{appointment.serviceName ?? serviceNames[appointment.serviceId]}</td>
                      <td className="px-6 py-5 text-[#607362]">{appointment.staffName ?? staffNames[appointment.staffId]}</td>
                      <td className="px-6 py-5"><span className={`whitespace-nowrap rounded-full px-3 py-1 text-xs font-semibold ${appointment.status === "checked_in" ? "bg-[#e8f1db] text-[#5b7945]" : "bg-[#e8f0ec] text-[#497462]"}`}>{appointment.status === "checked_in" ? "Checked in" : "Scheduled"}</span></td>
                      {onCancel && <td className="px-6 py-5"><button type="button" className="rounded-full border px-4 py-2" onClick={() => onCancel(appointment.id)}>Cancel <span className="sr-only">{appointment.customerLabel}</span></button></td>}
                    </tr>
                  ))}
                </tbody>
              </table>
              {appointments.length === 0 && (
                <p className="px-6 py-12 text-center text-sm text-[#7a8b7d]">No synthetic appointments for this selection.</p>
              )}
            </div>
          </section>

          <div className="mt-7 rounded-2xl border border-[#e2e8de] bg-[#edf3eb] p-5 text-sm leading-6 text-[#5d7761]">
            <strong className="text-[#315840]">Design boundary:</strong> The real business workspace will require authenticated tenant membership, row-level isolation, audit history and server-authoritative booking operations. This preview has no administration privileges or persistence.
          </div>
        </div>
      </div>
    </main>
  );
}
