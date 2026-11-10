import { HoursEditor } from "./hours-editor";
import { LocationEditor } from "./location-editor";
import { useState } from "react";
import type { Configuration } from "./session";
import { TimezoneChoice } from "./timezone";
import { configurationErrors, editPerson, WORKSPACE_ROLES } from "./session";

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
  return <div className="space-y-5">
    {step === 0 && <>
      <p className="text-sm text-slate-600">Start with your idea. Use fictional or proposed business details, never private customer data.</p>
      <label className="block font-medium">Business name<input className={inputClass} autoComplete="off" maxLength={100} value={c.business.name} onChange={e => update({ ...c, business: { ...c.business, name: e.target.value } })} /></label>
      <label className="block font-medium">Location name<input className={inputClass} autoComplete="off" maxLength={100} value={c.location.name} onChange={e => update({ ...c, location: { ...c.location, name: e.target.value } })} /></label>
      <LocationEditor config={c} update={update} locked={timezoneLocked} />
      <TimezoneChoice value={c.business.timezone} locked={timezoneLocked} onChange={timezone => update({ ...c, business: { ...c.business, timezone } })} />
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
      <p className="text-sm text-slate-600">Add one to three people. Roles are simulated responsibilities, not accounts or permissions. Accepting bookings is a separate choice.</p>
      {c.people.map((p, i) => {
        const bookable = c.staff.some(staff => staff.id === p.id);
        return <fieldset key={p.id} className="space-y-3 rounded-2xl border p-4"><legend>Person {i + 1}</legend>
          <label className="block font-medium">Display name<input className={inputClass} maxLength={100} value={p.name} onChange={e => update(editPerson(c, { ...p, name: e.target.value }, bookable))} /></label>
          <fieldset><legend className="font-medium">Simulated workspace roles (choose one or more)</legend>{WORKSPACE_ROLES.map(role => <label className="mr-4 inline-flex items-center gap-2 py-2" key={role}><input type="checkbox" checked={p.roles.includes(role)} onChange={e => update(editPerson(c, { ...p, roles: e.target.checked ? [...p.roles, role] : p.roles.filter(r => r !== role) }, bookable))} />{role}</label>)}</fieldset>
          <label className="flex items-center gap-2"><input type="checkbox" checked={bookable} onChange={e => update(editPerson(c, p, e.target.checked))} />Accepts customer bookings / delivers services</label>
          {c.people.length > 1 && <button type="button" className={buttonClass} onClick={() => { const next = editPerson(c, p, false); update({ ...next, people: next.people.filter(person => person.id !== p.id) }); }}>Remove person {i + 1}</button>}
        </fieldset>;
      })}
      {c.people.length < 3 && <button type="button" className={buttonClass} onClick={() => update({ ...c, people: [...c.people, { id: crypto.randomUUID(), name: "", roles: [] }] })}>+ Add a person (optional)</button>}
      <p className="text-sm">Existing appointments and their protected time remain after team edits. Removing a person does not cancel their bookings. Review retained bookings in Reception.</p>
      {c.services.map((s, i) => <fieldset className="rounded-xl bg-slate-50 p-4" key={s.id}><legend className="font-semibold">Eligible for {s.name || `service ${i + 1}`}</legend>
        {c.staff.map((p, j) => <label className="mr-5 inline-flex items-center gap-2 py-2" key={p.id}><input type="checkbox" checked={s.eligibleStaffIds.includes(p.id)} onChange={e => service(i, { eligibleStaffIds: e.target.checked ? [...s.eligibleStaffIds, p.id] : s.eligibleStaffIds.filter(id => id !== p.id) })} />{p.name || `Bookable person ${j + 1} (name required)`}</label>)}
      </fieldset>)}
    </>}
    {step === 3 && <HoursEditor config={c} update={update} />}
    {step === 4 && <>
      <p className="text-sm text-slate-600">Give your idea a look. Your logo stays in this tab; nothing is uploaded.</p>
      <label className="block font-medium">Primary colour<input className="mt-2 block h-12 w-24 cursor-pointer" type="color" value={c.theme.primary} onChange={e => update({ ...c, theme: { ...c.theme, primary: e.target.value } })} /></label>
      <label className="block font-medium">Accent colour<input className="mt-2 block h-12 w-24 cursor-pointer" type="color" value={c.theme.accent} onChange={e => update({ ...c, theme: { ...c.theme, accent: e.target.value } })} /></label>
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
