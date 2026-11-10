import { useState } from "react";
import { offlineLocalities, timezoneRecommendation } from "./localities";
import type { Configuration } from "./session";

export function LocationEditor({ config: c, update, locked }: { config: Configuration; update: (c: Configuration) => void; locked: boolean }) {
  const [query, setQuery] = useState("");
  const matches = offlineLocalities.search(query), selected = offlineLocalities.resolve(c.location.localityId);
  const recommendation = timezoneRecommendation(offlineLocalities, c.location.localityId);
  return <fieldset className="space-y-3 rounded-xl bg-slate-50 p-4"><legend className="font-semibold">City / country (optional offline suggestion)</legend>
    <label className="block">Find a locality<input type="search" className="mt-1 block w-full rounded border p-2" placeholder="For example, Pretoria or South Africa" value={query} onChange={e => setQuery(e.target.value)} /></label>
    <label className="block">Explicitly select a locality<select className="mt-1 block w-full rounded border bg-white p-2" value={c.location.localityId} onChange={e => update({ ...c, location: { ...c.location, localityId: e.target.value } })}>
      <option value="">Manual timezone / no selected locality</option>
      {[...new Map([...(selected ? [selected] : []), ...matches].map(p => [p.id, p])).values()].map(p => <option key={p.id} value={p.id}>{p.city}, {p.country}</option>)}
    </select></label>
    {!matches.length && <p className="text-sm">No catalogue match. Use the direct timezone selector below; no location has been inferred.</p>}
    {selected && recommendation && <p className="text-sm">{selected.city} recommends {recommendation}. Your existing timezone stays unchanged until you confirm. <button type="button" className="font-semibold underline" disabled={locked} onClick={() => update({ ...c, business: { ...c.business, timezone: recommendation } })}>Use this timezone</button> · <a href={selected.source} target="_blank" rel="noreferrer" className="underline">GeoNames source</a></p>}
    {locked && <p className="text-sm">Timezone is locked while appointments or simulated busy time remain.</p>}
    <label className="block">Street address (optional, local text only)<input className="mt-1 block w-full rounded border p-2" maxLength={250} autoComplete="off" value={c.location.address} onChange={e => update({ ...c, location: { ...c.location, address: e.target.value } })} /></label>
    <p className="text-xs text-slate-600">Limited offline coverage: Pretoria, Johannesburg, Cape Town and Durban, South Africa. Select a result explicitly; ambiguous or unknown places need manual choice. No online address verification, geocoding or external address submission. GeoNames data: CC BY 4.0.</p>
  </fieldset>;
}
