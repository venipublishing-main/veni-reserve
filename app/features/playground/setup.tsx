import { useState } from "react";
import type { Configuration } from "./session";
import { configurationErrors } from "./session";

export const setupSteps = ["Business", "Services", "People", "Scheduling", "Branding"];
const inputClass = "mt-2 block w-full rounded-xl border border-slate-300 bg-white px-3 py-2.5 text-slate-900 focus:outline-2 focus:outline-teal-700";
const buttonClass = "rounded-full border border-slate-300 bg-white px-4 py-2 text-sm font-semibold hover:bg-slate-100";
export function ConfigurationEditor({ config: c, step, update, upload, timezoneLocked = false }: {
  config: Configuration; step: number; update: (config: Configuration) => void;
  upload: (file: File) => Promise<void>; timezoneLocked?: boolean;
}) {
  const [imageError, setImageError] = useState("");
  const [loading, setLoading] = useState(false);
  const service = (index: number, patch: Partial<Configuration["services"][number]>) => update({ ...c,
    services: c.services.map((s, i) => i === index ? { ...s, ...patch } : s) });
  const staff = (index: number, name: string) => update({ ...c,
    staff: c.staff.map((p, i) => i === index ? { ...p, name, initials: name.slice(0, 2).toUpperCase() } : p) });
  const time = (n: number) => Number.isFinite(n) ? `${String(Math.floor(n / 60)).padStart(2, "0")}:${String(n % 60).padStart(2, "0")}` : "";
  const minutes = (s: string) => s ? Number(s.slice(0, 2)) * 60 + Number(s.slice(3)) : NaN;
  return <div className="space-y-5">
    {step === 0 && <>
      <p className="text-sm text-slate-600">Start with your idea. Use fictional or proposed business details, never private customer data.</p>
      <label className="block font-medium">Business name<input className={inputClass} autoComplete="off" maxLength={100} value={c.business.name} onChange={e => update({ ...c, business: { ...c.business, name: e.target.value } })} /></label>
      <label className="block font-medium">Location name<input className={inputClass} autoComplete="off" maxLength={100} value={c.location.name} onChange={e => update({ ...c, location: { ...c.location, name: e.target.value } })} /></label>
      <label className="block font-medium">Business timezone<input className={inputClass} list="playground-timezones" placeholder="Choose or enter an IANA timezone" disabled={timezoneLocked} value={c.business.timezone} onChange={e => update({ ...c, business: { ...c.business, timezone: e.target.value } })} /></label>
      <datalist id="playground-timezones">{["Africa/Johannesburg", "Africa/Nairobi", "Europe/London", "Europe/Paris", "America/New_York", "Asia/Kolkata", "Australia/Sydney", "UTC"].map(z => <option key={z} value={z} />)}</datalist>
      {timezoneLocked && <p className="text-sm">Cancel appointments before changing timezone. Existing appointments keep their original time.</p>}
      <label className="block font-medium">Business category <span className="text-slate-500">(optional)</span><input className={inputClass} autoComplete="off" maxLength={60} value={c.business.category} onChange={e => update({ ...c, business: { ...c.business, category: e.target.value } })} /></label>
    </>}
    {step === 1 && <>
      <p className="text-sm text-slate-600">What could someone book? Prices are illustrative amounts only; no payments are taken.</p>
      {c.services.map((s, i) => <fieldset key={s.id} className="space-y-4 rounded-2xl border border-slate-200 p-4">
        <legend className="px-2 font-semibold">Service {i + 1}</legend>
        <label className="block">Service name<input className={inputClass} maxLength={100} value={s.name} onChange={e => service(i, { name: e.target.value })} /></label>
        <div className="grid gap-4 sm:grid-cols-3">
          <label>Duration (minutes)<input className={inputClass} type="number" min={5} max={480} value={Number.isNaN(s.durationMinutes) ? "" : s.durationMinutes} onChange={e => service(i, { durationMinutes: e.target.valueAsNumber })} /></label>
          <label>Buffer after (minutes)<input className={inputClass} type="number" min={0} max={120} value={Number.isNaN(s.bufferAfterMinutes) ? "" : s.bufferAfterMinutes} onChange={e => service(i, { bufferAfterMinutes: e.target.valueAsNumber })} /></label>
          <label>Price (optional)<input className={inputClass} inputMode="decimal" maxLength={9} value={s.price} onChange={e => service(i, { price: e.target.value })} /></label>
        </div>
        {c.services.length > 1 && <button className={buttonClass} type="button" onClick={() => update({ ...c, services: c.services.filter(x => x.id !== s.id) })}>Remove service {i + 1}</button>}
      </fieldset>)}
      <button type="button" className={buttonClass} disabled={c.services.length >= 10} onClick={() => {
        const id = `service-${Math.max(0, ...c.services.map(s => Number(s.id.split("-")[1]))) + 1}`;
        update({ ...c, services: [...c.services, { id, name: "", description: "", durationMinutes: 30, bufferAfterMinutes: 0, price: "", eligibleStaffIds: [], locationIds: [c.location.id] }] });
      }}>+ Add a service</button>
    </>}
    {step === 2 && <>
      <p className="text-sm text-slate-600">Name one or two people, then choose who can deliver each service. This creates no accounts or invitations.</p>
      {c.staff.map((p, i) => <label key={p.id} className="block font-medium">Staff display name {i + 1}<input className={inputClass} maxLength={100} value={p.name} onChange={e => staff(i, e.target.value)} /></label>)}
      {c.staff.length === 1 ? <button type="button" className={buttonClass} onClick={() => update({ ...c, staff: [...c.staff, { id: "staff-2", name: "", role: "", initials: "", locationIds: [c.location.id] }] })}>+ Add a second person</button> : <button type="button" className={buttonClass} onClick={() => update({ ...c, staff: c.staff.slice(0, 1), services: c.services.map(s => ({ ...s, eligibleStaffIds: s.eligibleStaffIds.filter(id => id !== "staff-2") })) })}>Remove second person</button>}
      {c.services.map((s, i) => <fieldset className="rounded-xl bg-slate-50 p-4" key={s.id}><legend className="font-semibold">Eligible for {s.name || `service ${i + 1}`}</legend>
        {c.staff.map((p, j) => <label className="mr-5 inline-flex items-center gap-2 py-2" key={p.id}><input type="checkbox" checked={s.eligibleStaffIds.includes(p.id)} onChange={e => service(i, { eligibleStaffIds: e.target.checked ? [...s.eligibleStaffIds, p.id] : s.eligibleStaffIds.filter(id => id !== p.id) })} />{p.name || `Staff ${j + 1} (name required)`}</label>)}
      </fieldset>)}
    </>}
    {step === 3 && <>
      <fieldset><legend className="font-semibold">Operating days</legend><div className="mt-3 flex flex-wrap gap-3">{["Sunday", "Monday", "Tuesday", "Wednesday", "Thursday", "Friday", "Saturday"].map((day, i) => <label key={day} className="rounded-xl border border-slate-200 px-3 py-3"><input className="mr-2" type="checkbox" checked={c.days.includes(i)} onChange={e => update({ ...c, days: e.target.checked ? [...c.days, i] : c.days.filter(d => d !== i) })} />{day}</label>)}</div></fieldset>
      <div className="grid gap-4 sm:grid-cols-2"><label>Opening time<input className={inputClass} type="time" value={time(c.opens)} onChange={e => update({ ...c, opens: minutes(e.target.value) })} /></label><label>Closing time<input className={inputClass} type="time" value={time(c.closes)} onChange={e => update({ ...c, closes: minutes(e.target.value) })} /></label></div>
      <p className="rounded-xl bg-teal-50 p-4 text-sm leading-6">Defaults: 15-minute slot grid · 2-hour minimum notice · next 14 days · one location · all eligible staff share these hours. Overnight hours are not supported. Ambiguous or skipped clock-change times are unavailable.</p>
    </>}
    {step === 4 && <>
      <p className="text-sm text-slate-600">Give your idea a look. Your logo stays in this tab; nothing is uploaded.</p>
      <label className="block font-medium">Primary colour<input className="mt-2 block h-12 w-24 cursor-pointer" type="color" value={c.theme.primary} onChange={e => update({ ...c, theme: { ...c.theme, primary: e.target.value } })} /></label>
      <label className="block font-medium">Local logo (optional)<input className={inputClass} disabled={loading} type="file" accept="image/png,image/jpeg,image/webp" onChange={async e => {
        const file = e.target.files?.[0]; e.target.value = ""; if (!file) return;
        setLoading(true); setImageError("");
        try { await upload(file); } catch (error) { setImageError(error instanceof Error ? error.message : "Cannot preview this image."); }
        finally { setLoading(false); }
      }} /></label>
      <p className="text-sm text-slate-600">PNG, JPEG or WebP · up to 2 MiB and 4 megapixels. Use an asset you may share.</p>
      {loading && <p role="status">Preparing your local image…</p>}
      {imageError && <p role="alert" className="text-red-800">{imageError}</p>}
      {c.theme.logoUrl && <button className={buttonClass} type="button" onClick={() => update({ ...c, theme: { ...c.theme, logoUrl: undefined } })}>Remove logo</button>}
    </>}
    {configurationErrors(c, step).length > 0 && <ul className="space-y-1 rounded-xl bg-amber-50 p-4 text-sm text-amber-900" aria-live="polite">{configurationErrors(c, step).map(e => <li key={e}>{e}</li>)}</ul>}
  </div>;
}
