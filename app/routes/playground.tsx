import { useEffect, useState, useSyncExternalStore } from "react";
import { BookingExperience } from "../features/booking/booking-experience";
import { PlaygroundDiary } from "../features/playground/diary";
import { bookingTheme } from "../features/booking/theme";
import { ConfigurationEditor, setupSteps } from "../features/playground/setup";
import { PlaygroundSession, configurationErrors, validTimezone } from "../features/playground/session";
import { localLogo } from "../features/playground/logo";
import { todayInTimeZone } from "../features/demo/booking";

export function meta() { return [{ title: "Build your booking business | Veni Reserve Playground" }, { name: "robots", content: "noindex,nofollow" }]; }
const button = "rounded-full border border-slate-300 bg-white px-4 py-2.5 text-sm font-semibold hover:bg-slate-100 focus-visible:outline-2 focus-visible:outline-teal-700 disabled:opacity-40";

function CalendarSimulator({ session }: { session: PlaygroundSession }) {
  const state = useSyncExternalStore(session.subscribe, session.getSnapshot, session.getSnapshot);
  const c = state.config;
  const date = state.diaryDate;
  const setDate = (date: string) => session.selectDiaryDate(date);
  const [staffId, setStaff] = useState(c.staff[0]?.id ?? "");
  const [time, setTime] = useState("10:00");
  const [error, setError] = useState("");
  return <details className="rounded-2xl border border-slate-200 bg-white p-4"><summary className="cursor-pointer font-semibold">Simulated calendar · {state.calendar.connected ? "Connected" : "Disconnected"}</summary>
    <p className="my-3 text-sm text-slate-600">Try one 60-minute busy period. No account, OAuth, calendar read or calendar write. Existing appointments remain unchanged.</p>
    <div className="flex flex-wrap items-end gap-3">
      <label>Staff<select className="ml-2 rounded border p-2" value={staffId} onChange={e => setStaff(e.target.value)}>{c.staff.map(p => <option key={p.id} value={p.id}>{p.name}</option>)}</select></label>
      <label>Date<input className="ml-2 rounded border p-2" type="date" value={date} onChange={e => setDate(e.target.value)} /></label>
      <label>Start<input className="ml-2 rounded border p-2" type="time" value={time} onChange={e => setTime(e.target.value)} /></label>
      <button className={button} type="button" disabled={configurationErrors(c).length > 0} onClick={() => setError(session.connectBusy(date, staffId, Number(time.slice(0, 2)) * 60 + Number(time.slice(3)), 60) ?? "")}>Simulate connection + busy time</button>
      <button className={button} type="button" disabled={!state.calendar.connected} onClick={() => session.disconnect()}>Disconnect and clear busy time</button>
    </div>{error && <p role="alert" className="mt-3 text-red-800">{error}</p>}
  </details>;
}

export default function Playground() {
  // Per mounted route instance, never a module singleton or an SSR shared session.
  const [session] = useState(() => new PlaygroundSession());
  const state = useSyncExternalStore(session.subscribe, session.getSnapshot, session.getSnapshot);
  const [remaining, setRemaining] = useState(session.policy.inactivityMs);
  const [confirmation, setConfirmation] = useState<"soft" | "hard" | null>(null);
  const [editorStep, setEditorStep] = useState(0);
  const [error, setError] = useState("");
  useEffect(() => {
    const check = () => {
      if (session.checkExpiry()) { setConfirmation(null); setEditorStep(0); setError(""); }
      setRemaining(Math.max(0, session.policy.inactivityMs - (Date.now() - session.getSnapshot().lastActivity)));
    };
    const activity = () => { if (!session.checkExpiry()) session.touch(); check(); };
    const returning = () => { if (document.visibilityState === "visible") check(); };
    const pageHidden = () => session.hardReset("The previous page session was discarded. Start a new playground.");
    const leaving = (e: BeforeUnloadEvent) => {
      const s = session.getSnapshot();
      if (s.phase === "active" || s.configRevision > 0) { e.preventDefault(); e.returnValue = ""; }
    };
    const timer = window.setInterval(check, 15_000);
    window.addEventListener("focus", check);
    window.addEventListener("pageshow", check);
    window.addEventListener("pagehide", pageHidden);
    document.addEventListener("visibilitychange", returning);
    window.addEventListener("pointerdown", activity);
    window.addEventListener("keydown", activity);
    window.addEventListener("beforeunload", leaving);
    return () => {
      window.clearInterval(timer); window.removeEventListener("focus", check); window.removeEventListener("pageshow", check);
      window.removeEventListener("pagehide", pageHidden);
      document.removeEventListener("visibilitychange", returning); window.removeEventListener("pointerdown", activity);
      window.removeEventListener("keydown", activity); window.removeEventListener("beforeunload", leaving);
    };
  }, [session]);
  useEffect(() => () => session.dispose(), [session]);
  const c = state.config;
  const active = state.phase === "active";
  const reception = active && state.view === "reception";
  const errors = configurationErrors(c);
  const step = active ? editorStep : state.step;
  const colour = /^#[0-9a-f]{6}$/i.test(c.theme.primary) ? c.theme.primary : "#244b42";
  const upload = async (file: File) => {
    if (!session.touch()) return;
    const epoch = session.getSnapshot().epoch;
    const url = await localLogo(file);
    session.setLogo(url, epoch);
  };
  const today = validTimezone(c.business.timezone) ? todayInTimeZone(new Date(), c.business.timezone) : "";
  return <div style={bookingTheme(c.theme.primary, c.theme.accent)} className={`${reception ? "playground-reception" : "min-h-screen"} bg-[#f1f5f2] text-slate-900`}>
    <header className={`border-b border-slate-200 bg-white px-5 sm:px-8 ${reception ? "py-2" : "py-5"}`}>
      <div className="mx-auto flex max-w-7xl flex-wrap items-center justify-between gap-4">
        <div><p className="text-xs font-bold uppercase tracking-[0.22em] text-teal-800">Veni Reserve · Playground</p><h1 className="mt-1 text-2xl font-semibold">{active ? c.business.name : "Build your own booking business"}</h1></div>
        <div className="flex flex-wrap gap-2">{active && <button className={button} onClick={() => { if (session.touch()) setConfirmation("soft"); }}>Restore tutorial baseline</button>}<button className={button} onClick={() => { if (session.touch()) setConfirmation("hard"); }}>Start over / abandon</button></div>
      </div>
      <p className={reception ? "sr-only" : "mx-auto mt-3 max-w-7xl text-sm text-slate-600"}>Temporary, browser-memory only. Refreshing, closing or leaving loses this session. Use fictional details. Expires after {Math.round(session.policy.inactivityMs / 60_000)} minutes of inactivity; this proposed policy is configurable. Clearing is not forensic device deletion.</p>
    </header>
    <div className={reception ? "reception-shell mx-auto flex w-full max-w-7xl min-h-0 flex-1 flex-col px-3 py-2" : "mx-auto max-w-7xl px-5 py-6 sm:px-8"}>
      {state.notice && <p role="status" className={reception ? "sr-only" : "mb-4 rounded-xl bg-teal-50 p-4 text-sm text-teal-950"}>{state.notice}</p>}
      {remaining <= session.policy.warningMs && <div role="alert" className="mb-4 rounded-xl bg-amber-100 p-4">This session expires in about {Math.ceil(remaining / 60_000)} minutes. <button className={button} onClick={() => session.touch()}>Keep exploring</button></div>}
      {confirmation && <section role="alertdialog" aria-labelledby="reset-title" aria-describedby="reset-description" className="mb-6 rounded-2xl border-2 border-amber-400 bg-white p-6">
        <h2 id="reset-title" className="text-xl font-semibold">{confirmation === "soft" ? "Restore your original setup?" : "Destroy this temporary session?"}</h2>
        <p id="reset-description" className="my-3">{confirmation === "soft" ? "Your original tutorial inputs and logo return. All experiments, synthetic appointments and calendar activity are removed." : "All tutorial inputs, branding, appointments and calendar activity will be removed. You will return to an empty tutorial."}</p>
        <div className="flex gap-3"><button autoFocus className={button} onClick={() => setConfirmation(null)}>Keep exploring</button><button className={button} onClick={() => {
          if (session.checkExpiry()) { setConfirmation(null); return; }
          if (confirmation === "soft") session.softReset(); else session.hardReset();
          setConfirmation(null); setEditorStep(0); setError("");
        }}>Confirm {confirmation === "soft" ? "restore" : "start over"}</button></div>
      </section>}
      {active && <nav className={`${reception ? "mb-2" : "mb-5"} flex flex-wrap gap-2`} aria-label="Playground views">{(["booking", "reception", "configure"] as const).map(view => <button key={view} className={`${button} ${state.view === view ? "bg-[var(--booking-accent)] text-[var(--booking-on-accent)] ring-2 ring-slate-700" : ""}`} style={state.view === view ? { backgroundColor: "var(--booking-accent)", color: "var(--booking-on-accent)" } : undefined} aria-pressed={state.view === view} onClick={() => session.view(view)}>{view === "configure" ? "Edit business & branding" : view === "booking" ? "Customer booking" : "Reception"}</button>)}</nav>}
      {(!active || state.view === "configure") && <div className="grid items-start gap-6 lg:grid-cols-[minmax(0,1fr)_300px]">
        <section className="rounded-3xl border border-slate-200 bg-white p-5 shadow-sm sm:p-8">
          <nav className="mb-7 flex flex-wrap gap-2" aria-label="Setup steps">{setupSteps.map((name, i) => <button type="button" key={name} disabled={!active && i > state.step} style={step === i ? { backgroundColor: "var(--booking-accent)", color: "var(--booking-on-accent)" } : undefined} aria-current={step === i ? "step" : undefined} className={`${button} ${step === i ? "bg-[var(--booking-accent)] text-[var(--booking-on-accent)] ring-2 ring-slate-700" : ""}`} onClick={() => active ? setEditorStep(i) : session.step(i)}>{i + 1}. {name}</button>)}</nav>
          <p className="text-xs font-bold uppercase tracking-widest text-teal-800">{active ? "Experiment freely" : `Step ${step + 1} of 5`}</p><h2 className="mb-5 mt-2 text-3xl font-semibold">{setupSteps[step]}</h2>
          <ConfigurationEditor key={`${state.epoch}-${step}`} config={c} step={step} update={value => session.update(value)} upload={upload} timezoneLocked={state.appointments.length > 0 || !!state.calendar.busy} />
          {!active && <div className="mt-7 flex justify-between gap-3"><button className={button} disabled={step === 0} onClick={() => session.step(step - 1)}>Back</button><button className={button} disabled={configurationErrors(c, step).length > 0} onClick={() => {
            if (step < 4) session.step(step + 1); else setError(session.complete().join(" "));
          }}>{step === 4 ? "Enter my playground →" : "Continue →"}</button></div>}
          {error && <p className="mt-4 text-red-800" role="alert">{error}</p>}
          {active && <p className="mt-5 text-sm text-slate-600">Edits apply immediately. Booking pauses while configuration has validation errors. Your original tutorial baseline stays unchanged.</p>}
        </section>
        <aside className="overflow-hidden rounded-3xl border border-slate-200 bg-white shadow-sm" aria-label="Live business preview">
          <div className="h-3" style={{ backgroundColor: colour, borderBottom: "4px solid var(--booking-accent)" }} /><div className="p-6">
            {c.theme.logoUrl && <img src={c.theme.logoUrl} alt="Your local business logo" className="mb-5 h-20 w-20 object-contain" />}
            <p className="text-xs uppercase tracking-widest text-slate-500">Your idea, taking shape</p><h2 className="mt-3 break-words text-2xl font-semibold">{c.business.name || "Your business name"}</h2>
            <p className="mt-2 break-words text-slate-600">{c.location.name || "Your location"}</p><p className="mt-1 text-sm">{c.business.category}</p><p className="mt-2 text-xs text-slate-500">{c.business.timezone || "Timezone not selected"}</p>
            <ul className="mt-6 space-y-3">{c.services.map((s, i) => <li key={s.id} className="rounded-xl border border-slate-200 p-3"><strong className="break-words">{s.name || `Name service ${i + 1}`}</strong><p className="text-sm text-slate-600">{Number.isFinite(s.durationMinutes) ? s.durationMinutes : "—"} min · {Number.isFinite(s.bufferAfterMinutes) ? s.bufferAfterMinutes : "—"} min buffer{s.price && ` · Price ${s.price}`}</p></li>)}</ul>
            <p className="mt-5 text-sm text-slate-600">Team: {c.people.map((p, i) => p.name || `Name person ${i + 1}`).join(", ")}</p>
          </div>
        </aside>
      </div>}
      {active && state.view !== "configure" && errors.length > 0 && <div role="alert" className="rounded-xl bg-amber-100 p-5"><p>Complete your configuration before booking:</p><ul>{errors.map(e => <li key={e}>{e}</li>)}</ul><button className={button} onClick={() => session.view("configure")}>Review configuration</button></div>}
      {active && validTimezone(c.business.timezone) && <div className={reception ? "reception-simulator mb-2" : "my-5"}><CalendarSimulator key={`${state.epoch}-${state.configRevision}`} session={session} /></div>}
      {active && state.view === "reception" && <PlaygroundDiary key={state.epoch} session={session} today={today} />}
      {active && errors.length === 0 && <>
        {state.view === "booking" && <BookingExperience key={`${state.epoch}-${state.configRevision}`} today={today} now={new Date().toISOString()}
          business={{ name: c.business.name, descriptor: c.business.category, timezone: c.business.timezone, location: c.location.name, primary: colour, accent: c.theme.accent, logoUrl: c.theme.logoUrl, note: "Your temporary business. Synthetic bookings stay in this tab only." }}
          services={c.services} people={c.staff} slotsFor={(date, serviceId, staffId) => session.slots(date, serviceId, staffId)}
          onBook={(date, serviceId, slot) => session.book(date, serviceId, slot.startMinute, slot.staffId)} onWorkspace={() => session.view("reception")} />}
      </>}
    </div>
  </div>;
}
