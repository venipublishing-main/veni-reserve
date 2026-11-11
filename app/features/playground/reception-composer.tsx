import { useState, useSyncExternalStore } from "react";
import type { PlaygroundSession } from "./session";
import { ReceptionDraft } from "./reception-state";
import { ReceptionDialog } from "./reception-dialog";
import { minutesLabel } from "../demo/booking";

export type ComposerSeed = { date: string; staffId: string; minute?: number; serviceId?: string };
export function ReceptionComposer({ session, seed, onClose, returnFocus }: {
  session: PlaygroundSession; seed: ComposerSeed; onClose: () => void; returnFocus: HTMLElement | null;
}) {
  const state = useSyncExternalStore(session.subscribe, session.getSnapshot, session.getSnapshot), c = state.config;
  const [draft] = useState(() => new ReceptionDraft(session));
  const [date, setDate] = useState(seed.date), [staffId, setStaff] = useState(seed.staffId);
  const [serviceId, setService] = useState(seed.serviceId ?? c.services.find(s => s.eligibleStaffIds.includes(seed.staffId))?.id ?? "");
  const [minute, setMinute] = useState(seed.minute ?? -1), [error, setError] = useState("");
  const [complete, setComplete] = useState(false);
  const service = c.services.find(s => s.id === serviceId), slots = session.slots(date, serviceId, staffId);
  const valid = slots.some(s => s.startMinute === minute && s.staffId === staffId);
  const field = "mt-1 block w-full rounded-xl border border-slate-300 bg-white p-2.5";
  return <ReceptionDialog title="New synthetic booking" movable onClose={onClose} returnFocus={returnFocus}>
    {complete ? <div role="status"><h3 className="font-semibold">Booking created</h3><p>Reception and customer availability now reflect this synthetic appointment.</p><button className="mt-3 rounded-xl bg-[var(--booking-primary)] px-4 py-2 text-[var(--booking-on-primary)]" onClick={onClose}>Done</button></div> : <form className="space-y-3" onSubmit={e => {
      e.preventDefault(); const result = draft.submit({ date, staffId, serviceId, minute });
      if (result) setError(result); else { setComplete(true); setError(""); }
    }}>
      <p className="text-sm text-slate-600">{c.business.timezone} · Synthetic visitor assigned automatically. Empty board space is a candidate, not a reserved slot.</p>
      <label className="block">Person<select autoFocus className={field} value={staffId} onChange={e => { setStaff(e.target.value); setService(""); setMinute(-1); setError(""); }}><option value="">Choose person</option>{c.staff.map(p => <option key={p.id} value={p.id}>{p.name}</option>)}</select></label>
      <label className="block">Service<select className={field} value={serviceId} onChange={e => { setService(e.target.value); setMinute(-1); setError(""); }}><option value="">Choose eligible service</option>{c.services.filter(s => s.eligibleStaffIds.includes(staffId)).map(s => <option key={s.id} value={s.id}>{s.name}</option>)}</select></label>
      <div className="grid grid-cols-2 gap-3"><label>Date<input className={field} type="date" value={date} onChange={e => { setDate(e.target.value); setMinute(-1); }} /></label>
        <label>Available start<select className={field} value={minute} onChange={e => { setMinute(Number(e.target.value)); setError(""); }}><option value={-1}>Choose valid start</option>
          {!valid && minute >= 0 && <option value={minute}>{minutesLabel(minute)} — candidate unavailable</option>}
          {slots.map(s => <option key={s.startMinute} value={s.startMinute}>{minutesLabel(s.startMinute)}</option>)}
        </select></label></div>
      {service && <p className="rounded-xl bg-slate-50 p-3 text-sm">{service.durationMinutes} minute service + {service.bufferAfterMinutes} minute post-service buffer. All booking rules apply.</p>}
      {!slots.length && <p role="status" className="text-sm">No valid starts for this selection. Choose another service, person or date.</p>}
      {error && <p role="alert" className="rounded-lg bg-amber-50 p-3 text-amber-950">{error}</p>}
      <button className="w-full rounded-xl bg-[var(--booking-primary)] px-4 py-3 font-semibold text-[var(--booking-on-primary)] disabled:opacity-40" disabled={!valid} type="submit">Create synthetic booking</button>
    </form>}
  </ReceptionDialog>;
}
