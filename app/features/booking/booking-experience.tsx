import { useMemo, useState } from "react";
import type { FormEvent } from "react";
import { Link } from "react-router";
import { bookingTheme } from "./theme";
import type { DemoService, DemoPractitioner, DemoSlot } from "../demo/booking";
import {
  addDays,
  DEMO_BUSINESS,
  DEMO_PRACTITIONERS,
  DEMO_SERVICES,
  demoAvailableSlots,
  formatDemoDate,
  minutesLabel,
} from "../demo/booking";

type Step = 0 | 1 | 2 | 3;
const steps = ["Service", "Practitioner", "Date & time", "Your details"] as const;

export type BookingExperienceProps = {
  today: string; now: string;
  business?: { name: string; descriptor: string; timezone: string; note: string; location: string; primary?: string; logoUrl?: string };
  services?: readonly DemoService[]; people?: readonly DemoPractitioner[];
  slotsFor?: (date: string, serviceId: string, staffId: string) => DemoSlot[];
  onBook?: (date: string, serviceId: string, slot: DemoSlot) => string | null;
  onWorkspace?: () => void;
};

export function BookingExperience({ today, now, services = DEMO_SERVICES, people = DEMO_PRACTITIONERS,
  business = { ...DEMO_BUSINESS, descriptor: "Optometrists · Pretoria", location: "Pretoria · Demo location" }, slotsFor, onBook, onWorkspace,
}: BookingExperienceProps) {
  const [error, setError] = useState("");
  const [step, setStep] = useState<Step>(0);
  const [serviceId, setServiceId] = useState(services[0].id);
  const [staffId, setStaffId] = useState("any");
  const [date, setDate] = useState(addDays(today, 1));
  const [startMinute, setStartMinute] = useState<number | null>(null);
  const [name, setName] = useState("Demo Visitor");
  const [email, setEmail] = useState("demo@example.invalid");
  const [telephone, setTelephone] = useState("");
  const [completed, setCompleted] = useState(false);

  const service = services.find((entry) => entry.id === serviceId) ?? services[0];
  const selectedStaff = people.find((entry) => entry.id === staffId);
  const dates = useMemo(() => Array.from({ length: 14 }, (_, index) => addDays(today, index + 1)), [today]);
  const slots = useMemo(
    () => slotsFor ? slotsFor(date, service.id, staffId) : demoAvailableSlots({ date, service, staffId, now: new Date(now) }),
    [date, service, staffId, now, slotsFor],
  );
  const selectedSlot = slots.find((slot) => slot.startMinute === startMinute);

  function chooseService(nextId: string) {
    setServiceId(nextId);
    setStaffId("any");
    setStartMinute(null);
    setStep(1);
  }
  function chooseStaff(nextId: string) {
    setStaffId(nextId);
    setStartMinute(null);
    setStep(2);
  }
  function chooseDate(nextDate: string) {
    setDate(nextDate);
    setStartMinute(null);
  }
  function submitPreview(event: FormEvent<HTMLFormElement>) {
    event.preventDefault();
    if (!selectedSlot || !name.trim() || !email.trim()) return;
    if (onBook) {
      const failure = onBook(date, service.id, selectedSlot);
      if (failure) { setError(failure); return; }
    }
    setError("");
    setCompleted(true);
  }

  return (
    <main style={bookingTheme(business.primary)} className="min-h-screen bg-[#f5f6f3] text-[#23332d]">
      <div className="border-b border-amber-200 bg-[#fff4d9] px-5 py-2.5 text-center text-xs font-semibold tracking-wide text-[#765121]">
        {onBook ? "YOUR PLAYGROUND · Simulated appointments in this tab only" : "INTERACTIVE DEMO · Synthetic services, staff, times and visitors · No real appointment can be created"}
      </div>
      <header className="mx-auto flex max-w-6xl flex-wrap items-center justify-between gap-4 px-5 py-7 sm:px-8">
        <Link to="/" className="inline-flex items-center gap-3" aria-label="Veni Reserve home">
          <span className="flex h-11 w-11 items-center justify-center rounded-2xl bg-[var(--booking-primary)] text-xl font-bold text-[var(--booking-on-primary)]">{business.logoUrl ? <img src={business.logoUrl} alt="Business logo" className="h-9 w-9 object-contain" /> : "V"}</span>
          <span className="flex flex-col">
            <span className="text-lg font-semibold tracking-tight">{business.name}</span>
            <span className="text-[11px] font-semibold uppercase tracking-[0.23em] text-[#7d8c81]">{business.descriptor}</span>
          </span>
        </Link>
        {onWorkspace ? <button type="button" onClick={onWorkspace} className="rounded-full border px-4 py-2.5 text-sm font-semibold">View reception</button> : <Link to="/demo/vvb/workspace" className="rounded-full border border-[#cfd8cf] bg-white px-4 py-2.5 text-sm font-semibold text-[var(--booking-ink)] hover:border-[var(--booking-primary)] focus-visible:outline-2 focus-visible:outline-offset-2 focus-visible:outline-[var(--booking-primary)]">
          View reception preview →
        </Link>}
      </header>

      <div className="mx-auto grid max-w-6xl gap-10 px-5 pb-20 pt-3 sm:px-8 lg:grid-cols-[minmax(0,1fr)_300px] lg:gap-12">
        <div className="min-w-0">
          <p className="mb-3 text-xs font-bold uppercase tracking-[0.24em] text-[#8a9a7b]">Welcome to your appointment journey</p>
          <h1 className="max-w-2xl text-4xl font-semibold tracking-tight sm:text-5xl">
            {onBook ? <>Your business, <span className="text-[#63816d]">your booking journey.</span></> : <>Your vision, <span className="text-[#63816d]">our priority.</span></>}
          </h1>
          <p className="mt-4 max-w-xl text-sm leading-7 text-[#687a70] sm:text-base">
            Explore a simple online booking journey. Choose a service and a convenient time—no account required.
          </p>

          <nav className="mt-9 grid grid-cols-4 gap-2" aria-label="Booking progress">
            {steps.map((label, index) => (
              <div key={label} className="min-w-0">
                <div className={`h-1 rounded-full ${index <= step ? "bg-[var(--booking-primary)]" : "bg-[#dce4dc]"}`} />
                <span className={`mt-2 block text-[10px] font-semibold sm:text-xs ${index === step ? "text-[var(--booking-ink)]" : "text-[#95a098]"}`}>{label}</span>
              </div>
            ))}
          </nav>

          <section className="mt-7 rounded-[28px] border border-[#e2e9e0] bg-white p-5 shadow-[0_20px_60px_rgba(27,51,39,0.045)] sm:p-8" aria-live="polite">
            {completed ? (
              <div className="py-8 text-center">
                <span className="mx-auto flex h-16 w-16 items-center justify-center rounded-full bg-[#e1eee4] text-3xl text-[var(--booking-ink)]">✓</span>
                <h2 className="mt-6 text-3xl font-semibold">Demo journey complete</h2>
                <p className="mx-auto mt-4 max-w-md text-sm leading-7 text-[#65786b]">
                  You selected {service.name.toLowerCase()} for {formatDemoDate(date)} at {startMinute === null ? "—" : minutesLabel(startMinute)}.
                </p>
                <p className="mx-auto mt-5 max-w-lg rounded-xl bg-[#fff4d9] p-4 text-sm font-medium text-[#765121]">
                  {onBook ? "A synthetic appointment was added to reception in this tab only. No real booking or message was created." : "This is a visual demonstration only. No appointment was saved, confirmed or sent to the practice."}
                </p>
                <button className="mt-7 rounded-full bg-[var(--booking-primary)] px-7 py-3 text-sm font-semibold text-[var(--booking-on-primary)] hover:bg-[var(--booking-hover)]" type="button" onClick={() => { setCompleted(false); setStep(0); setStartMinute(null); }}>
                  Start another preview
                </button>
              </div>
            ) : (
              <>
                {step > 0 && (
                  <button type="button" className="mb-6 text-sm font-semibold text-[#64806c] hover:underline" onClick={() => setStep((step - 1) as Step)}>
                    ← Back
                  </button>
                )}

                {step === 0 && (
                  <>
                    <p className="text-xs font-bold uppercase tracking-[0.22em] text-[#8a9a7b]">Step 01</p>
                    <h2 className="mt-2 text-2xl font-semibold">What can we help you with?</h2>
                    <p className="mt-2 text-sm text-[#78887c]">Select a service to continue.</p>
                    <div className="mt-7 space-y-3">
                      {services.map((entry, index) => (
                        <button key={entry.id} type="button" onClick={() => chooseService(entry.id)}
                          className="flex w-full items-center gap-4 rounded-2xl border border-[#e2e9e2] p-4 text-left transition hover:border-[#8eaa95] hover:bg-[#f8faf7] focus-visible:outline-2 focus-visible:outline-offset-2 focus-visible:outline-[var(--booking-primary)] sm:p-5">
                          <span className="flex h-12 w-12 shrink-0 items-center justify-center rounded-2xl bg-[#e7efe8] text-xl font-semibold text-[#446b55]">
                            {["◉", "◎", "◇"][index]}
                          </span>
                          <span className="flex-1">
                            <span className="block text-base font-semibold">{entry.name}</span>
                            <span className="mt-1 block text-sm leading-5 text-[#78887c]">{entry.description}</span>
                            <span className="mt-2 block text-xs font-semibold text-[#6d8974]">{entry.durationMinutes} minutes · {onBook ? (entry.price ? `Illustrative price ${entry.price}` : "No price set") : "Pricing confirmed by practice"}</span>
                          </span>
                          <span aria-hidden="true" className="text-xl text-[#5b7c67]">→</span>
                        </button>
                      ))}
                    </div>
                  </>
                )}

                {step === 1 && (
                  <>
                    <p className="text-xs font-bold uppercase tracking-[0.22em] text-[#8a9a7b]">Step 02</p>
                    <h2 className="mt-2 text-2xl font-semibold">Choose your practitioner</h2>
                    <p className="mt-2 text-sm text-[#78887c]">Pick someone, or let us show any suitable availability.</p>
                    <div className="mt-7 space-y-3">
                      <button type="button" onClick={() => chooseStaff("any")}
                        className="flex w-full items-center gap-4 rounded-2xl border border-[#d5e4d6] bg-[#f1f8f0] p-5 text-left hover:border-[#6c9077] focus-visible:outline-2 focus-visible:outline-offset-2 focus-visible:outline-[var(--booking-primary)]">
                        <span className="flex h-12 w-12 items-center justify-center rounded-full bg-[#d8e9d9] text-xl">✦</span>
                        <span className="flex-1"><span className="block font-semibold">No preference</span><span className="mt-1 block text-sm text-[#768778]">Show me the available appointments</span></span>
                        <span aria-hidden="true" className="text-xl text-[#5b7c67]">→</span>
                      </button>
                      {people.filter((person) => service.eligibleStaffIds.includes(person.id)).map((person) => (
                        <button key={person.id} type="button" onClick={() => chooseStaff(person.id)}
                          className="flex w-full items-center gap-4 rounded-2xl border border-[#e2e9e2] p-5 text-left hover:border-[#8eaa95] hover:bg-[#f8faf7] focus-visible:outline-2 focus-visible:outline-offset-2 focus-visible:outline-[var(--booking-primary)]">
                          <span className="flex h-12 w-12 items-center justify-center rounded-full bg-[#eef0e8] font-bold text-[#50735b]">{person.initials}</span>
                          <span className="flex-1"><span className="block font-semibold">{person.name}</span><span className="mt-1 block text-sm text-[#78887c]">{person.role} · Fictional profile</span></span>
                          <span aria-hidden="true" className="text-xl text-[#5b7c67]">→</span>
                        </button>
                      ))}
                    </div>
                  </>
                )}

                {step === 2 && (
                  <>
                    <p className="text-xs font-bold uppercase tracking-[0.22em] text-[#8a9a7b]">Step 03</p>
                    <h2 className="mt-2 text-2xl font-semibold">Find a time that suits you</h2>
                    <p className="mt-2 text-sm text-[#78887c]">{onBook ? `Times in ${business.timezone}. Simulated availability only.` : "Illustrative dates and availability · Pretoria local time (SAST)."}</p>
                    <div className="mt-7 grid grid-cols-3 gap-2 sm:grid-cols-7">
                      {dates.map((value) => {
                        const chosen = date === value;
                        const label = formatDemoDate(value).split(" ");
                        return (
                          <button key={value} type="button" aria-pressed={chosen} onClick={() => chooseDate(value)}
                            className={`rounded-xl border px-2 py-3 text-center transition focus-visible:outline-2 focus-visible:outline-offset-2 focus-visible:outline-[var(--booking-primary)] ${chosen ? "border-[var(--booking-primary)] bg-[var(--booking-primary)] text-[var(--booking-on-primary)]" : "border-[#e1e7e0] bg-white text-[#455a4e] hover:border-[#8faa96]"}`}>
                            <span className="block text-[11px] font-medium">{label[0]}</span>
                            <span className="mt-1 block text-lg font-bold">{label[1]}</span>
                            <span className="block text-[11px]">{label[2]}</span>
                          </button>
                        );
                      })}
                    </div>
                    <h3 className="mt-7 text-sm font-bold text-[#314a3b]">{formatDemoDate(date)} · Available times</h3>
                    {slots.length === 0 ? (
                      <div className="mt-4 rounded-xl bg-[#f4f6f1] p-5 text-sm text-[#6e7e71]">No demo slots available on this date. Try another day.</div>
                    ) : (
                      <div className="mt-4 grid grid-cols-3 gap-3 sm:grid-cols-4">
                        {slots.map((slot) => (
                          <button key={slot.startMinute} type="button" aria-pressed={startMinute === slot.startMinute}
                            onClick={() => setStartMinute(slot.startMinute)}
                            className={`rounded-xl border py-3 text-sm font-semibold focus-visible:outline-2 focus-visible:outline-offset-2 focus-visible:outline-[var(--booking-primary)] ${startMinute === slot.startMinute ? "border-[var(--booking-primary)] bg-[var(--booking-primary)] text-[var(--booking-on-primary)]" : "border-[#dce7dc] bg-white text-[#38594a] hover:border-[#8daa94]"}`}>
                            {minutesLabel(slot.startMinute)}
                          </button>
                        ))}
                      </div>
                    )}
                    <button type="button" disabled={!selectedSlot} onClick={() => setStep(3)}
                      className="mt-8 w-full rounded-full bg-[var(--booking-primary)] px-6 py-3.5 text-sm font-semibold text-[var(--booking-on-primary)] hover:bg-[var(--booking-hover)] disabled:cursor-not-allowed disabled:opacity-35">
                      Continue to your details →
                    </button>
                  </>
                )}

                {step === 3 && (
                  <>
                    <p className="text-xs font-bold uppercase tracking-[0.22em] text-[#8a9a7b]">Step 04</p>
                    <h2 className="mt-2 text-2xl font-semibold">Your details</h2>
                    <p className="mt-2 text-sm text-[#78887c]">Use fictional details only. This demo does not submit or store your information.</p>
                    <form className="mt-7 space-y-5" onSubmit={submitPreview}>
                      {onBook ? <p>A synthetic visitor label is assigned automatically. No contact details are needed.</p> : <>
                      <label className="block text-sm font-semibold">Full name
                        <input required maxLength={80} autoComplete="off" value={name} onChange={(event) => setName(event.target.value)}
                          className="mt-2 block w-full rounded-xl border border-[#dce5da] bg-white px-4 py-3 text-sm outline-none focus:border-[#47735a] focus:ring-2 focus:ring-[#d8e8d9]" />
                      </label>
                      <label className="block text-sm font-semibold">Email address
                        <input required type="email" maxLength={120} autoComplete="off" value={email} onChange={(event) => setEmail(event.target.value)}
                          className="mt-2 block w-full rounded-xl border border-[#dce5da] bg-white px-4 py-3 text-sm outline-none focus:border-[#47735a] focus:ring-2 focus:ring-[#d8e8d9]" />
                      </label>
                      <label className="block text-sm font-semibold">Contact number <span className="font-normal text-[#8f9e91]">(optional, demo only)</span>
                        <input type="tel" maxLength={24} autoComplete="off" value={telephone} onChange={(event) => setTelephone(event.target.value)}
                          placeholder="Use a fictional number" className="mt-2 block w-full rounded-xl border border-[#dce5da] bg-white px-4 py-3 text-sm outline-none focus:border-[#47735a] focus:ring-2 focus:ring-[#d8e8d9]" />
                      </label>
                      </>}
                      {error && <p role="alert">{error}</p>}
                      <div className="rounded-xl bg-[#fff4d9] p-4 text-sm leading-6 text-[#765121]">
                        <strong>Demonstration only.</strong> Pressing the button below does not reserve a slot, contact the practice or write to a database.
                      </div>
                      <button type="submit" disabled={!selectedSlot} className="w-full rounded-full bg-[var(--booking-primary)] px-6 py-3.5 text-sm font-semibold text-[var(--booking-on-primary)] hover:bg-[var(--booking-hover)] disabled:opacity-35">
                        {onBook ? "Create synthetic appointment →" : "Show demo confirmation →"}
                      </button>
                    </form>
                  </>
                )}
              </>
            )}
          </section>
          <p className="mt-5 text-center text-xs text-[#92a095]">{business.note}</p>
        </div>

        <aside className="self-start lg:sticky lg:top-7">
          <div className="overflow-hidden rounded-[26px] border border-[#dfe6dd] bg-white shadow-[0_16px_45px_rgba(31,59,41,0.055)]">
            <div className="bg-[var(--booking-primary)] px-6 py-7 text-[var(--booking-on-primary)]">
              <p className={`text-xs font-bold uppercase tracking-[0.24em] ${onBook ? "" : "text-[#bdd4c5]"}`}>Your appointment</p>
              <h2 className="mt-3 text-2xl font-semibold">Booking summary</h2>
              <p className={`mt-2 text-xs ${onBook ? "" : "text-[#cfdfd2]"}`}>An illustrative appointment preview</p>
            </div>
            <dl className="space-y-5 px-6 py-6 text-sm">
              <div><dt className="text-xs font-semibold uppercase tracking-wider text-[#8e9d92]">Service</dt><dd className="mt-1.5 font-semibold">{service.name}</dd><dd className="mt-1 text-[#75867a]">{service.durationMinutes} minutes</dd></div>
              <div className="border-t border-[#edf0eb] pt-5"><dt className="text-xs font-semibold uppercase tracking-wider text-[#8e9d92]">Practitioner</dt><dd className="mt-1.5 font-semibold">{selectedStaff?.name ?? "Any available practitioner"}</dd></div>
              <div className="border-t border-[#edf0eb] pt-5"><dt className="text-xs font-semibold uppercase tracking-wider text-[#8e9d92]">Date & time</dt><dd className="mt-1.5 font-semibold">{startMinute === null ? "Not chosen yet" : `${formatDemoDate(date)} · ${minutesLabel(startMinute)}`}</dd><dd className="mt-1 text-[#75867a]">{onBook ? business.timezone : "South Africa Standard Time"}</dd></div>
              <div className="border-t border-[#edf0eb] pt-5"><dt className="text-xs font-semibold uppercase tracking-wider text-[#8e9d92]">Location</dt><dd className="mt-1.5 font-semibold">{business.location}</dd></div>
            </dl>
            <div className="border-t border-[#edf0eb] bg-[#f8faf6] px-6 py-5 text-xs leading-6 text-[#708174]">
              Built with <strong className="text-[var(--booking-ink)]">Veni Reserve</strong><br />
              Your booking system. Your brand. Your rules.
            </div>
          </div>
        </aside>
      </div>
    </main>
  );
}
