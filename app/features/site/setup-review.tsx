import { useEffect, useRef, useState } from "react";
import { bookingTheme } from "../booking/theme";
import { timeButtonClass } from "../booking/time-button";
import { advanceReview, emptyReviewDraft, typography, validBusiness, validTheme } from "./setup-draft";
import { setupSteps } from "./navigation";
const inputClass = "mt-1 block w-full rounded border border-slate-400 bg-white p-3";
const buttonClass = "rounded-xl border border-slate-400 bg-white px-4 py-3 font-semibold disabled:opacity-50";
export function SetupReview({ onlinePreview = false }: { onlinePreview?: boolean }) {
  const [draft, setDraft] = useState(emptyReviewDraft), [error, setError] = useState("");
  const heading = useRef<HTMLHeadingElement>(null), moved = useRef(false);
  useEffect(() => { if (moved.current) heading.current?.focus(); }, [draft.step]);
  function next() {
    const value = advanceReview(draft);
    if (value === draft) { setError(draft.step === "business" ? "Enter a valid business name, IANA timezone, locale and currency." : "Use six-digit hex colours and a supported typeface."); return; }
    setError(""); moved.current = true; setDraft(value);
  }
  const theme = validTheme(draft.theme) ? draft.theme : emptyReviewDraft().theme;
  return <section className="space-y-6">
    <p className="rounded-xl border border-amber-300 bg-amber-50 p-4">{onlinePreview ? "UNSAVED DEMONSTRATION — preview environment only." : "Local design review only."} Use fictional information. These unsaved edits exist in this component's memory, are lost on refresh/leaving and are not an authenticated business or a saved Theme Revision.</p>
    <nav aria-label="Setup review steps" className="flex flex-wrap gap-3">{(["business", "brand", "review"] as const).map(step => <button type="button" className={buttonClass} key={step} aria-current={draft.step === step ? "step" : undefined}
      disabled={step !== "business" && (!validBusiness(draft.business) || (step === "review" && !validTheme(draft.theme)))}
      onClick={() => { moved.current = true; setDraft({ ...draft, step }); setError(""); }}>{step === "brand" ? "Brand / Theme Studio" : step === "business" ? "Business" : "Review gates"}</button>)}</nav>
    <h2 ref={heading} tabIndex={-1} className="text-2xl font-semibold">{draft.step === "business" ? "Business settings" : draft.step === "brand" ? "Theme Studio — unsaved preview" : "Review before real setup"}</h2>
    {draft.step === "business" && <form onSubmit={e => { e.preventDefault(); next(); }} className="max-w-xl space-y-4">
      {([["display_name", "Fictional business name", 120], ["timezone", "Business timezone (IANA, e.g. Africa/Johannesburg)", 80], ["default_locale", "Language/region (e.g. en-ZA)", 6], ["default_currency", "Currency (e.g. ZAR)", 3]] as const).map(([key, label, maxLength]) => <label key={key} className="block">{label}<input required autoComplete="off" className={inputClass} maxLength={maxLength} value={draft.business[key]} onChange={e => { setDraft({ ...draft, business: { ...draft.business, [key]: e.target.value } }); setError(""); }} /></label>)}
      <button className={buttonClass}>Continue to Brand</button>
    </form>}
    {draft.step === "brand" && <div className="grid items-start gap-6 md:grid-cols-2"><form className="space-y-4" onSubmit={e => { e.preventDefault(); next(); }}>
      {(["primary", "accent"] as const).map(key => <label className="block capitalize" key={key}>{key} colour (#RRGGBB)<input required pattern="#[0-9a-fA-F]{6}" maxLength={7} className={inputClass} value={draft.theme[key]} onChange={e => setDraft({ ...draft, theme: { ...draft.theme, [key]: e.target.value } })} /></label>)}
      <label className="block">Typography<select className={inputClass} value={draft.theme.typography} onChange={e => setDraft({ ...draft, theme: { ...draft.theme, typography: e.target.value as "system" | "serif" } })}><option value="system">System sans serif</option><option value="serif">System serif</option></select></label>
      {!validTheme(draft.theme) && <p role="status">Invalid token: preview uses safe defaults until corrected.</p>}
      <button className={buttonClass}>Review readiness</button>
      <p>Preview changes immediately. Saving private revisions and publishing are not connected.</p>
    </form><section aria-label="Unsaved booking appearance preview" style={{ ...bookingTheme(theme.primary, theme.accent), fontFamily: typography[theme.typography] }} className="space-y-4 rounded-2xl border border-slate-300 bg-white p-6">
      <h3 className="break-words text-xl font-semibold">{draft.business.display_name}</h3><p>Illustrative service · 30 minutes</p><div className="flex flex-wrap gap-3"><button type="button" disabled className={timeButtonClass(false)}>09:00</button><button type="button" disabled className={timeButtonClass(true)}>10:00</button></div>
      <p className="rounded p-3" style={{ background: "var(--booking-accent)", color: "var(--booking-on-accent)" }}>Appearance sample only. No appointment times are being offered.</p>
    </section></div>}
    {draft.step === "review" && <><p><strong>{draft.business.display_name}</strong> · {draft.business.timezone} · {draft.business.default_locale} · {draft.business.default_currency}</p>
      <ul className="list-inside list-disc space-y-2">{setupSteps.map(step => <li key={step}><strong>{step}:</strong> {step === "Business" || step === "Brand" ? "local unsaved preview only" : "pending canonical implementation and readiness"}</li>)}</ul>
      <p>SETUP is not ACTIVE. No subscription or public booking status is assigned. A returning member will need a verified session and active Membership to resume server-saved setup; this fixture cannot test that.</p>
    </>}
    {error && <p role="alert" className="text-red-800">{error}</p>}
    <div className="flex flex-wrap gap-3"><button className={buttonClass} type="button" onClick={() => { moved.current = true; setDraft(emptyReviewDraft()); setError(""); }}>Discard local edits</button><button className={buttonClass} type="button" disabled>Save private draft — unavailable</button><button className={buttonClass} type="button" disabled>Publish — unavailable</button></div>
  </section>;
}
