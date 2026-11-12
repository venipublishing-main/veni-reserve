import { availablePeople } from "./capacity";
import { canOverrideBuffer } from "./personnel";
import { useRef, useState, useSyncExternalStore } from "react";
import type { PlaygroundSession } from "./session";
import { ReceptionDraft } from "./reception-state";
import { ReceptionDialog } from "./reception-dialog";
import { minutesLabel } from "../demo/booking";

export type ComposerSeed = { date: string; staffId: string; minute?: number; serviceId?: string; actorId?: string; override?: boolean; aggregateAvailability?: boolean };
export function ReceptionComposer({ session, seed, onClose, returnFocus }: {
  session: PlaygroundSession; seed: ComposerSeed; onClose: () => void; returnFocus: HTMLElement | null;
}) {
  const state = useSyncExternalStore(session.subscribe, session.getSnapshot, session.getSnapshot), c = state.config;
  const personField = useRef<HTMLSelectElement>(null), dateField = useRef<HTMLInputElement>(null);
  const [anchored, setAnchored] = useState(!!seed.aggregateAvailability);
  const [draft] = useState(() => new ReceptionDraft(session));
  const [date, setDate] = useState(seed.date), [staffId, setStaff] = useState(seed.staffId);
  const [serviceId, setService] = useState(seed.serviceId ?? c.services.find(s => s.eligibleStaffIds.includes(seed.staffId))?.id ?? "");
  const [minute, setMinute] = useState(seed.minute ?? -1), [error, setError] = useState("");
  const [override, setOverride] = useState(!seed.aggregateAvailability && (seed.override ?? false));
  const [confirmation, setConfirmation] = useState("");
  const [complete, setComplete] = useState(false);
  const allowed = !anchored && canOverrideBuffer(c, seed.actorId, staffId);
  const people = anchored ? availablePeople(session, state, date, serviceId, minute) : c.staff;
  const services = c.services;
  const service = c.services.find(s => s.id === serviceId), slots = override && allowed ? session.receptionSlots(date, serviceId, staffId, seed.actorId!) : session.slots(date, serviceId, staffId);
  const touched = override ? session.bufferTouches(date, serviceId, minute, staffId) : [];
  const confirmationKey = JSON.stringify([state.epoch, state.configRevision, date, staffId, serviceId, minute, touched]);
  const needsConfirmation = override && touched.length > 0;
  const valid = slots.some(s => s.startMinute === minute && s.staffId === staffId);
  const field = "mt-1 block w-full rounded-xl border border-slate-300 bg-white p-2.5";
  return <ReceptionDialog title="New synthetic booking" movable onClose={onClose} returnFocus={returnFocus}>
    {!complete && <nav className="composer-recovery sticky top-0 z-10 flex flex-wrap gap-2 bg-white py-2" aria-label="Change booking selection">
      <button type="button" className="rounded border p-2" onClick={() => { setError(""); setConfirmation(""); personField.current?.focus(); }}>Back / Change practitioner</button>
      <button type="button" className="rounded border p-2" onClick={() => { setAnchored(false); setMinute(-1); setError(""); setConfirmation(""); dateField.current?.focus(); }}>Change date &amp; time</button>
    </nav>}
    {complete ? <div role="status"><h3 className="font-semibold">Booking created</h3><p>Reception and customer availability now reflect this synthetic appointment.</p><button className="mt-3 rounded-xl bg-[var(--booking-primary)] px-4 py-2 text-[var(--booking-on-primary)]" onClick={onClose}>Done</button></div> : <form className="space-y-3" onSubmit={e => {
      e.preventDefault(); const result = needsConfirmation && confirmation !== confirmationKey ? "Confirm the current buffer warning before booking." : draft.submit({ date, staffId, serviceId, minute }, needsConfirmation ? { actorId: seed.actorId ?? "", confirmedBufferIds: touched } : undefined);
      if (result) setError(result); else { setComplete(true); setError(""); }
    }}>
      <p className="text-sm text-slate-600">{c.business.timezone} · Synthetic visitor assigned automatically. Empty board space is a candidate, not a reserved slot.</p>
      {anchored && <p className="text-sm">Shared availability at this time. Use Change date & time to release this exact start. Only practitioners available for the selected service and start are offered; all rules are rechecked on submission.</p>}
      <label className="block">Person<select ref={personField} autoFocus className={field} value={staffId} onChange={e => { const next = e.target.value; setStaff(next); const compatible = c.services.find(s => s.id === serviceId && s.eligibleStaffIds.includes(next)); if (!compatible) setService(""); if (!anchored && !session.slots(date, serviceId, next).some(s => s.startMinute === minute)) setMinute(-1); setConfirmation(""); setError(""); }}><option value="">Choose person</option>{staffId && !people.some(p => p.id === staffId) && <option disabled value={staffId}>Previous practitioner no longer available</option>}{people.map(p => <option key={p.id} value={p.id}>{p.name}</option>)}</select></label>
      <label className="block">Service<select className={field} value={serviceId} onChange={e => { setService(e.target.value); const next = anchored ? availablePeople(session, state, date, e.target.value, minute) : c.staff.filter(p => c.services.find(s => s.id === e.target.value)?.eligibleStaffIds.includes(p.id)); if (!next.some(p => p.id === staffId)) setStaff(next[0]?.id ?? ""); if (!anchored && !session.slots(date, e.target.value, staffId).some(s => s.startMinute === minute)) setMinute(-1); setConfirmation(""); setError(""); }}><option value="">Choose eligible service</option>{serviceId && !services.some(s => s.id === serviceId) && <option disabled value={serviceId}>Previous service no longer available</option>}{services.map(s => <option key={s.id} value={s.id}>{s.name}</option>)}</select></label>
      <div className="grid grid-cols-2 gap-3"><label>Date<input className={field} ref={dateField} disabled={anchored} type="date" value={date} onChange={e => { setDate(e.target.value); if (!session.slots(e.target.value, serviceId, staffId).some(s => s.startMinute === minute)) setMinute(-1); setError(""); setConfirmation(""); }} /></label>
        <label>Available start<select disabled={anchored} className={field} value={minute} onChange={e => { setMinute(Number(e.target.value)); setError(""); }}><option value={-1}>Choose valid start</option>
          {!valid && minute >= 0 && <option value={minute}>{minutesLabel(minute)} — candidate unavailable</option>}
          {slots.map(s => <option key={s.startMinute} value={s.startMinute}>{minutesLabel(s.startMinute)}</option>)}
        </select></label></div>
      {allowed && <label className="flex items-center gap-2 text-sm"><input type="checkbox" checked={override} onChange={e => { setOverride(e.target.checked); setConfirmation(""); }} />Consider soft-buffer override (local role simulation)</label>}
      {override && !allowed && <p role="alert">This operator cannot override this person's buffers.</p>}
      {needsConfirmation && <div className="rounded-xl border-2 border-amber-600 bg-amber-50 p-3 text-sm" role="alert"><strong>Warning: this booking uses protected recovery time.</strong><p>{touched.length} existing buffer(s) would overlap. Service appointments, external busy time, closed periods and all other rules remain protected. Public booking cannot do this.</p><label className="mt-2 flex gap-2"><input type="checkbox" checked={confirmation === confirmationKey} onChange={e => setConfirmation(e.target.checked ? confirmationKey : "")} />I confirm this specific simulated buffer override.</label></div>}
      {service && <p className="rounded-xl bg-slate-50 p-3 text-sm">{service.durationMinutes} minute service + {service.bufferAfterMinutes} minute post-service buffer. All booking rules apply.</p>}
      {!slots.length && <p role="status" className="text-sm">No valid starts for this selection. Choose another service, person or date.</p>}
      {error && <p role="alert" className="rounded-lg bg-amber-50 p-3 text-amber-950">{error}</p>}
      <button className="w-full rounded-xl bg-[var(--booking-primary)] px-4 py-3 font-semibold text-[var(--booking-on-primary)] disabled:opacity-40" disabled={!valid || (needsConfirmation && confirmation !== confirmationKey) || (override && !allowed)} type="submit">Create synthetic booking</button>
    </form>}
  </ReceptionDialog>;
}
