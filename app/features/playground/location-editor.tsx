import { useState } from "react";
import { offlineLocalities } from "./localities";
import { selectLocality } from "./location-state";
import { TimezoneChoice } from "./timezone";
import type { Configuration } from "./session";

export function LocationEditor({ config: c, update, locked }: { config: Configuration; update: (c: Configuration) => void; locked: boolean }) {
  const [searching, setSearching] = useState(false);
  const selected = offlineLocalities.resolve(c.location.localityId);
  const matches = offlineLocalities.search(c.location.address);
  const manual = !!c.business.timezone && c.business.timezoneSource !== "locality";
  return <fieldset className="space-y-3 rounded-2xl border border-slate-200 bg-white p-4"><legend className="px-2 font-semibold">Business location</legend>
    <label className="block font-medium">Business address, city or locality<input type="search" className="mt-2 block w-full rounded-xl border border-slate-300 p-3" placeholder="Try Pretoria" maxLength={250} autoComplete="off" value={c.location.address}
      onFocus={() => setSearching(true)} onChange={e => { setSearching(true); update({ ...c, location: { ...c.location, address: e.target.value, localityId: "" } }); }} /></label>
    {searching && c.location.address.trim() && <div aria-label="Offline locality matches" className="space-y-1">
      {matches.map(p => <button key={p.id} type="button" className="block w-full rounded-xl border border-slate-200 bg-slate-50 p-3 text-left hover:bg-slate-100 focus-visible:outline-2" onClick={() => { update(selectLocality(c, p.id, locked)); setSearching(false); }}>
        <strong>{p.city}, {p.country}</strong><span className="block text-xs text-slate-600">Use this locality · {p.timezone}</span>
      </button>)}
      {!matches.length && <p className="text-sm text-slate-600">No offline match. Your address stays local; use Change manually below to choose its timezone.</p>}
    </div>}
    {selected && <p className="text-sm">{selected.city}, {selected.country} · <a className="underline" href={selected.source} target="_blank" rel="noreferrer">GeoNames source</a></p>}
    <p className="text-sm font-medium">{manual ? "Manual timezone" : "Suggested timezone"}: {c.business.timezone || "Select a locality above"}</p>
    {selected && manual && <p className="text-xs text-slate-600">Locality suggests {selected.timezone}; your manual choice is preserved.</p>}
    <details><summary className="cursor-pointer text-sm underline">Change manually</summary><div className="mt-3">
      <TimezoneChoice value={c.business.timezone} locked={locked} onChange={timezone => update({ ...c, business: { ...c.business, timezone, timezoneSource: "manual" } })} />
      {selected && !locked && <button type="button" className="mt-2 text-sm underline" onClick={() => update({ ...c, business: { ...c.business, timezone: selected.timezone, timezoneSource: "locality" } })}>Use locality suggestion again</button>}
    </div></details>
    {locked && <p className="text-xs">Timezone is locked while appointments or simulated busy time remain.</p>}
    <p className="text-xs text-slate-500">Offline matches: Pretoria, Johannesburg, Cape Town and Durban, South Africa. Select a match to apply its suggestion. Address text stays in this tab; no online address verification or external submission. GeoNames: CC BY 4.0.</p>
  </fieldset>;
}
