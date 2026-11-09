import { useMemo, useState } from "react";
import type { FormEvent } from "react";
import { Link } from "react-router";
import type { Route } from "./+types/demo-booking";
import {
  addDays,
  DEMO_BUSINESS,
  DEMO_PRACTITIONERS,
  DEMO_SERVICES,
  demoAvailableSlots,
  formatDemoDate,
  minutesLabel,
  todayInTimeZone,
} from "../features/demo/booking";

type Step = 0 | 1 | 2 | 3;
const steps = ["Service", "Practitioner", "Date & time", "Your details"] as const;

export function meta() {
  return [
    { title: "Booking preview | van Vollenhoven Bruwer | Veni Reserve" },
    { name: "description", content: "Interactive, synthetic VVB booking journey built on Veni Reserve." },
  ];
}

export function loader() {
  const now = new Date();
  return { today: todayInTimeZone(now, DEMO_BUSINESS.timezone), now: now.toISOString() };
}

export default function DemoBooking({ loaderData }: Route.ComponentProps) {
  const [step, setStep] = useState<Step>(0);
  const [serviceId, setServiceId] = useState(DEMO_SERVICES[0].id);
  const [staffId, setStaffId] = useState("any");
  const [date, setDate] = useState(addDays(loaderData.today, 1));
  const [startMinute, setStartMinute] = useState<number | null>(null);
  const [name, setName] = useState("Demo Visitor");
  const [email, setEmail] = useState("demo@example.invalid");
  const [telephone, setTelephone] = useState("");
  const [completed, setCompleted] = useState(false);

  const service = DEMO_SERVICES.find((entry) => entry.id === serviceId) ?? DEMO_SERVICES[0];
  const selectedStaff = DEMO_PRACTITIONERS.find((entry) => entry.id === staffId);
  const dates = useMemo(() => Array.from({ length: 14 }, (_, index) => addDays(loaderData.today, index + 1)), [loaderData.today]);
  const slots = useMemo(
    () => demoAvailableSlots({ date, service, staffId, now: new Date(loaderData.now) }),
    [date, service, staffId, loaderData.now],
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
    // No action, fetch, storage or API call is made. The browser only renders this preview.
    setCompleted(true);
  }

  return (
    <main className="min-h-screen bg-[#f5f6f3] text-[#23332d]">
      <div className="border-b border-amber-200 bg-[#fff4d9] px-5 py-2.5 text-center text-xs font-semibold tracking-wide text-[#765121]">
        INTERACTIVE DEMO · Synthetic services, staff, times and visitors · No real appointment can be created
      </div>
      <header className="mx-auto flex max-w-6xl flex-wrap items-center justify-between gap-4 px-5 py-7 sm:px-8">
        <Link to="/" className="inline-flex items-center gap-3" aria-label="Veni Reserve home">
          <span className="flex h-11 w-11 items-center justify-center rounded-2xl bg-[#244b42] text-xl font-bold text-white">V</span>
          <span className="flex flex-col">
            <span className="text-lg font-semibold tracking-tight">van Vollenhoven Bruwer</span>
            <span className="text-[11px] font-semibold uppercase tracking-[0.23em] text-[#7d8c81]">Optometrists · Pretoria</span>
          </span>
        </Link>
        <Link to="/demo/vvb/workspace" className="rounded-full border border-[#cfd8cf] bg-white px-4 py-2.5 text-sm font-semibold text-[#244b42] hover:border-[#244b42] focus-visible:outline-2 focus-visible:outline-offset-2 focus-visible:outline-[#244b42]">
          View reception preview →
        </Link>
      </header>

      <div className="mx-auto grid max-w-6xl gap-10 px-5 pb-20 pt-3 sm:px-8 lg:grid-cols-[minmax(0,1fr)_300px] lg:gap-12">
        <div className="min-w-0">
          <p className="mb-3 text-xs font-bold uppercase tracking-[0.24em] text-[#8a9a7b]">Welcome to your appointment journey</p>
          <h1 className="max-w-2xl text-4xl font-semibold tracking-tight sm:text-5xl">
            Your vision, <span className="text-[#63816d]">our priority.</span>
          </h1>
          <p className="mt-4 max-w-xl text-sm leading-7 text-[#687a70] sm:text-base">
            Explore a simple online booking journey. Choose a service and a convenient time—no account required.
          </p>

          <nav className="mt-9 grid grid-cols-4 gap-2" aria-label="Booking progress">
            {steps.map((label, index) => (
              <div key={label} className="min-w-0">
                <div className={`h-1 rounded-full ${index <= step ? "bg-[#244b42]" : "bg-[#dce4dc]"}`} />
                <span className={`mt-2 block text-[10px] font-semibold sm:text-xs ${index === step ? "text-[#244b42]" : "text-[#95a098]"}`}>{label}</span>
              </div>
            ))}
          </nav>

          <section className="mt-7 rounded-[28px] border border-[#e2e9e0] bg-white p-5 shadow-[0_20px_60px_rgba(27,51,39,0.045)] sm:p-8" aria-live="polite">
            {completed ? (
              <div className="py-8 text-center">
                <span className="mx-auto flex h-16 w-16 items-center justify-center rounded-full bg-[#e1eee4] text-3xl text-[#244b42]">✓</span>
                <h2 className="mt-6 text-3xl font-semibold">Demo journey complete</h2>
                <p className="mx-auto mt-4 max-w-md text-sm leading-7 text-[#65786b]">
                  You selected {service.name.toLowerCase()} for {formatDemoDate(date)} at {startMinute === null ? "—" : minutesLabel(startMinute)}.
                </p>
                <p className="mx-auto mt-5 max-w-lg rounded-xl bg-[#fff4d9] p-4 text-sm font-medium text-[#765121]">
                  This is a visual demonstration only. No appointment was saved, confirmed or sent to the practice.
                </p>
                <button className="mt-7 rounded-full bg-[#244b42] px-7 py-3 text-sm font-semibold text-white hover:bg-[#173b33]" type="button" onClick={() => { setCompleted(false); setStep(0); setStartMinute(null); }}>
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
                      {DEMO_SERVICES.map((entry, index) => (
                        <button key={entry.id} type="button" onClick={() => chooseService(entry.id)}
                          className="flex w-full items-center gap-4 rounded-2xl border border-[#e2e9e2] p-4 text-left transition hover:border-[#8eaa95] hover:bg-[#f8faf7] focus-visible:outline-2 focus-visible:outline-offset-2 focus-visible:outline-[#244b42] sm:p-5">
                          <span className="flex h-12 w-12 shrink-0 items-center justify-center rounded-2xl bg-[#e7efe8] text-xl font-semibold text-[#446b55]">
                            {["◉", "◎", "◇"][index]}
                          </span>
                          <span className="flex-1">
                            <span className="block text-base font-semibold">{entry.name}</span>
                            <span className="mt-1 block text-sm leading-5 text-[#78887c]">{entry.description}</span>
                            <span className="mt-2 block text-xs font-semibold text-[#6d8974]">{entry.durationMinutes} minutes · Pricing confirmed by practice</span>
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
                        className="flex w-full items-center gap-4 rounded-2xl border border-[#d5e4d6] bg-[#f1f8f0] p-5 text-left hover:border-[#6c9077] focus-visible:outline-2 focus-visible:outline-offset-2 focus-visible:outline-[#244b42]">
                        <span className="flex h-12 w-12 items-center justify-center rounded-full bg-[#d8e9d9] text-xl">✦</span>
                        <span className="flex-1"><span className="block font-semibold">No preference</span><span className="mt-1 block text-sm text-[#768778]">Show me the available appointments</span></span>
                        <span aria-hidden="true" className="text-xl text-[#5b7c67]">→</span>
                      </button>
                      {DEMO_PRACTITIONERS.filter((person) => service.eligibleStaffIds.includes(person.id)).map((person) => (
                        <button key={person.id} type="button" onClick={() => chooseStaff(person.id)}
                          className="flex w-full items-center gap-4 rounded-2xl border border-[#e2e9e2] p-5 text-left hover:border-[#8eaa95] hover:bg-[#f8faf7] focus-visible:outline-2 focus-visible:outline-offset-2 focus-visible:outline-[#244b42]">
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
                    <p className="mt-2 text-sm text-[#78887c]">Illustrative dates and availability · Pretoria local time (SAST).</p>
                    <div className="mt-7 grid grid-cols-3 gap-2 sm:grid-cols-7">
                      {dates.map((value) => {
                        const chosen = date === value;
                        const label = formatDemoDate(value).split(" ");
                        return (
                          <button key={value} type="button" aria-pressed={chosen} onClick={() => chooseDate(value)}
                            className={`rounded-xl border px-2 py-3 text-center transition focus-visible:outline-2 focus-visible:outline-offset-2 focus-visible:outline-[#244b42] ${chosen ? "border-[#244b42] bg-[#244b42] text-white" : "border-[#e1e7e0] bg-white text-[#455a4e] hover:border-[#8faa96]"}`}>
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
                            className={`rounded-xl border py-3 text-sm font-semibold focus-visible:outline-2 focus-visible:outline-offset-2 focus-visible:outline-[#244b42] ${startMinute === slot.startMinute ? "border-[#244b42] bg-[#244b42] text-white" : "border-[#dce7dc] bg-white text-[#38594a] hover:border-[#8daa94]"}`}>
                            {minutesLabel(slot.startMinute)}
                          </button>
                        ))}
                      </div>
                    )}
                    <button type="button" disabled={!selectedSlot} onClick={() => setStep(3)}
                      className="mt-8 w-full rounded-full bg-[#244b42] px-6 py-3.5 text-sm font-semibold text-white hover:bg-[#173b33] disabled:cursor-not-allowed disabled:opacity-35">
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
                      <div className="rounded-xl bg-[#fff4d9] p-4 text-sm leading-6 text-[#765121]">
                        <strong>Demonstration only.</strong> Pressing the button below does not reserve a slot, contact the practice or write to a database.
                      </div>
                      <button type="submit" disabled={!selectedSlot} className="w-full rounded-full bg-[#244b42] px-6 py-3.5 text-sm font-semibold text-white hover:bg-[#173b33] disabled:opacity-35">
                        Show demo confirmation →
                      </button>
                    </form>
                  </>
                )}
              </>
            )}
          </section>
          <p className="mt-5 text-center text-xs text-[#92a095]">{DEMO_BUSINESS.note}</p>
        </div>

        <aside className="self-start lg:sticky lg:top-7">
          <div className="overflow-hidden rounded-[26px] border border-[#dfe6dd] bg-white shadow-[0_16px_45px_rgba(31,59,41,0.055)]">
            <div className="bg-[#244b42] px-6 py-7 text-white">
              <p className="text-xs font-bold uppercase tracking-[0.24em] text-[#bdd4c5]">Your appointment</p>
              <h2 className="mt-3 text-2xl font-semibold">Booking summary</h2>
              <p className="mt-2 text-xs text-[#cfdfd2]">An illustrative appointment preview</p>
            </div>
            <dl className="space-y-5 px-6 py-6 text-sm">
              <div><dt className="text-xs font-semibold uppercase tracking-wider text-[#8e9d92]">Service</dt><dd className="mt-1.5 font-semibold">{service.name}</dd><dd className="mt-1 text-[#75867a]">{service.durationMinutes} minutes</dd></div>
              <div className="border-t border-[#edf0eb] pt-5"><dt className="text-xs font-semibold uppercase tracking-wider text-[#8e9d92]">Practitioner</dt><dd className="mt-1.5 font-semibold">{selectedStaff?.name ?? "Any available practitioner"}</dd></div>
              <div className="border-t border-[#edf0eb] pt-5"><dt className="text-xs font-semibold uppercase tracking-wider text-[#8e9d92]">Date & time</dt><dd className="mt-1.5 font-semibold">{startMinute === null ? "Not chosen yet" : `${formatDemoDate(date)} · ${minutesLabel(startMinute)}`}</dd><dd className="mt-1 text-[#75867a]">South Africa Standard Time</dd></div>
              <div className="border-t border-[#edf0eb] pt-5"><dt className="text-xs font-semibold uppercase tracking-wider text-[#8e9d92]">Location</dt><dd className="mt-1.5 font-semibold">Pretoria · Demo location</dd></div>
            </dl>
            <div className="border-t border-[#edf0eb] bg-[#f8faf6] px-6 py-5 text-xs leading-6 text-[#708174]">
              Built with <strong className="text-[#244b42]">Veni Reserve</strong><br />
              Your booking system. Your brand. Your rules.
            </div>
          </div>
        </aside>
      </div>
    </main>
  );
}
