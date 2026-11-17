import { useState } from "react";
import { copyHours, START_INTERVALS, WEEKDAYS } from "./scheduling";
import type { Configuration } from "./session";

const field = "rounded-lg border border-slate-300 bg-white p-2";
const clock = (n: number) => Number.isFinite(n) ? `${String(Math.floor(n / 60)).padStart(2, "0")}:${String(n % 60).padStart(2, "0")}` : "";
const minute = (s: string) => s ? Number(s.slice(0, 2)) * 60 + Number(s.slice(3)) : NaN;
export function HoursEditor({ config: c, update }: { config: Configuration; update: (c: Configuration) => void }) {
  const [source, setSource] = useState(1), [targets, setTargets] = useState<number[]>([]);
  const [custom, setCustom] = useState(!START_INTERVALS.includes(c.startInterval));
  const setPeriods = (day: number, periods: Configuration["hours"][number]) => update({ ...c, hours: c.hours.map((p, i) => i === day ? periods : p) });
  return <div className="space-y-4">
    <label className="block font-medium">Booking-start interval<select className={`${field} ml-2`} value={custom ? "custom" : c.startInterval} onChange={e => {
      setCustom(e.target.value === "custom"); if (e.target.value !== "custom") update({ ...c, startInterval: Number(e.target.value) });
    }}>{START_INTERVALS.map(n => <option key={n} value={n}>{n} minutes</option>)}<option value="custom">Custom whole minutes</option></select></label>
    {custom && <label className="block">Custom start interval (1–1440 minutes)<input className={`${field} ml-2 w-28`} type="number" min={1} max={1440} step={1} value={Number.isFinite(c.startInterval) ? c.startInterval : ""} onChange={e => update({ ...c, startInterval: e.target.valueAsNumber })} /></label>}
    <p className="text-sm text-slate-600">Starts align to each uninterrupted opening plus this interval. Duration, buffers and visual density are separate. Services must fit entirely before a break or closing.</p>
    {WEEKDAYS.map((name, day) => <fieldset key={name} className="rounded-xl border p-3"><legend className="px-2 font-semibold">{name}</legend>
      <label><input type="checkbox" checked={c.hours[day].length === 0} onChange={e => setPeriods(day, e.target.checked ? [] : [{ opens: 540, closes: 1020 }])} /> Closed</label>
      {c.hours[day].map((p, i) => <div key={i} className="mt-2 flex flex-wrap items-center gap-2">
        <label>Opens<input aria-label={`${name} period ${i + 1} opens`} type="time" className={`${field} ml-2`} value={clock(p.opens)} onChange={e => setPeriods(day, c.hours[day].map((v, j) => i === j ? { ...v, opens: minute(e.target.value) } : v))} /></label>
        <label>Closes<input aria-label={`${name} period ${i + 1} closes`} type="time" className={`${field} ml-2`} value={p.closes === 1440 ? "" : clock(p.closes)} onChange={e => setPeriods(day, c.hours[day].map((v, j) => i === j ? { ...v, closes: minute(e.target.value) } : v))} /></label>
        <label className="text-sm"><input type="checkbox" checked={p.closes === 1440} onChange={e => setPeriods(day, c.hours[day].map((v, j) => i === j ? { ...v, closes: e.target.checked ? 1440 : 1020 } : v))} /> End at 24:00</label>
        <button type="button" className={field} onClick={() => setPeriods(day, c.hours[day].filter((_, j) => j !== i))}>Remove period</button>
      </div>)}
      <button type="button" className={`${field} mt-2 text-sm`} onClick={() => setPeriods(day, [...c.hours[day], { opens: NaN, closes: NaN }])}>+ Working period</button>
    </fieldset>)}
    <fieldset className="rounded-xl bg-slate-50 p-3"><legend className="font-semibold">Copy hours to selected days</legend>
      <label>From<select className={`${field} ml-2`} value={source} onChange={e => setSource(Number(e.target.value))}>{WEEKDAYS.map((d, i) => <option key={d} value={i}>{d}</option>)}</select></label>
      <div className="my-2 flex flex-wrap gap-3">{WEEKDAYS.map((d, i) => <label key={d}><input type="checkbox" checked={targets.includes(i)} onChange={e => setTargets(e.target.checked ? [...targets, i] : targets.filter(v => v !== i))} /> {d}</label>)}</div>
      <button type="button" className={field} disabled={!targets.length} onClick={() => update({ ...c, hours: copyHours(c.hours, source, targets) })}>Copy selected hours</button>
    </fieldset>
    <p className="text-sm">All bookable people inherit these weekday hours. Overnight periods and per-person/date-specific overrides are not supported. Two-hour notice and fourteen-day booking horizon still apply. Closed or short days do not invalidate other days.</p>
  </div>;
}
