import { useEffect, useState } from "react";
import { blankLocation, locationAttributes } from "../../lib/locations";
import type { LocationAttributes, LocationList, LocationSaveResult, SavedLocation } from "../../lib/locations";

const control = "block w-full rounded border border-slate-400 bg-white px-3 py-2";
const button = "rounded border border-slate-500 bg-white px-4 py-2 disabled:opacity-50";
const kinds = ["PHYSICAL","VIRTUAL","MOBILE","OTHER"] as const;
const errors: Record<string,string> = {
  tenant_unavailable: "Your business access has changed; sign in again.",
  unauthorized: "Your local sign-in has expired. Sign in again.",
  invalid_input: "Check the Location name, timezone and other fields.",
  duplicate_name: "That Location name is already in use.",
  revision_conflict: "Someone saved this Location since you opened it. Reload it before continuing.",
  location_unavailable: "This Location was archived or is no longer editable.",
};
function editableFields(saved: SavedLocation): LocationAttributes {
  return { name:saved.name,kind:saved.kind,description:saved.description,
    timezone_override:saved.timezone_override,public_visible:saved.public_visible,
    sort_order:saved.sort_order,status:saved.status };
}

export function LocalLocations({ tenantId }: { tenantId: string }) {
  const [items,setItems] = useState<SavedLocation[]>([]);
  const [chosen,setChosen] = useState<string | null>(null);
  const [draft,setDraft] = useState<LocationAttributes>({ ...blankLocation });
  const [revision,setRevision] = useState(0);
  const [busy,setBusy] = useState(false), [ready,setReady] = useState(false);
  const [message,setMessage] = useState("");
  async function api<T>(method = "GET", locationId?: string, body?: unknown): Promise<T> {
    const response = await fetch("/development/local-api/tenants/" + tenantId + "/locations" +
      (locationId ? "/" + locationId : ""), {
      method,headers:{"Content-Type":"application/json"},body:body === undefined ? undefined : JSON.stringify(body),
    });
    let value: unknown;
    try { value = await response.json(); } catch { throw new Error("Local Location storage is unavailable."); }
    if (!response.ok) {
      const code = value && typeof value === "object" && "error" in value ? String(value.error) : "";
      throw new Error(errors[code] ?? "Local Location operation was rejected. Your changes remain here.");
    }
    return value as T;
  }
  async function reload() {
    const result = await api<LocationList>();
    setItems(result.locations);
    if (chosen) {
      const match = result.locations.find(v => v.location_id === chosen);
      if (match) { setDraft(editableFields(match)); setRevision(match.revision); }
    }
  }
  useEffect(() => {
    let ignore = false;
    void api<LocationList>().then(result => { if (!ignore) { setItems(result.locations);setReady(true); } })
      .catch(() => { if (!ignore) { setReady(true);setMessage("Could not load saved Locations. Local provider may be offline."); } });
    return () => { ignore = true; };
    // Tenant switch remounts via key, initial query only.
    // eslint-disable-next-line react-hooks/exhaustive-deps
  },[tenantId]);
  function select(location: SavedLocation) {
    setChosen(location.location_id);setRevision(location.revision);setDraft(editableFields(location));setMessage("");
  }
  function startNew() {
    setChosen(null);setRevision(0);setDraft({ ...blankLocation,sort_order:items.length });setMessage("");
  }
  async function save(attributes: LocationAttributes) {
    if (busy) return;
    const valid = locationAttributes(attributes);
    if (!valid) { setMessage("Please check the fields before saving.");return; }
    setBusy(true);setMessage("");
    try {
      const result = await api<LocationSaveResult>(chosen ? "PUT" : "POST", chosen ?? undefined,
        { expected_revision:revision,attributes:valid });
      const saved = result.locations.find(v => v.location_id === result.location_id);
      if (!saved) throw new Error("Saved but the Location could not be read back.");
      setItems(result.locations);setChosen(saved.location_id);setRevision(saved.revision);setDraft(editableFields(saved));
      setMessage(saved.status === "ARCHIVED"
        ? "Location archived. Its identity is retained for historical bookings."
        : "Location saved to local PostgreSQL (revision " + saved.revision + ").");
    } catch(e) {setMessage(e instanceof Error ? e.message : "Location save failed.");}
    finally {setBusy(false);}
  }
  return <section className="my-8 space-y-4 rounded-2xl border border-slate-200 bg-slate-50 p-5">
    <h2 className="text-xl font-semibold">Locations — persistent business setup</h2>
    <p>Every business has a Location, including a single-site or online business. These are private setup records; public booking is not yet enabled.</p>
    <div className="flex flex-wrap gap-2">
      <button className={button} type="button" disabled={busy || !ready} onClick={startNew}>Add Location</button>
      <button className={button} type="button" disabled={busy || !ready}
        onClick={() => void reload().then(() => setMessage("Locations reloaded.")).catch(() => setMessage("Local provider unavailable."))}>Reload saved Locations</button>
    </div>
    <div className="flex flex-wrap gap-2" aria-label="Saved Locations">
      {items.map(item => <button key={item.location_id} type="button" className={button}
        aria-pressed={chosen === item.location_id} disabled={busy} onClick={() => select(item)}>
        {item.name} · {item.kind.toLowerCase()} · {item.status.toLowerCase()}
      </button>)}
      {ready && items.length === 0 && <p>No Locations saved yet. Add your first Location.</p>}
    </div>
    {ready && <form className="max-w-xl space-y-3" onSubmit={e => {
      e.preventDefault();
      void save({ ...draft,name:draft.name.trim().normalize("NFC"),
        description:draft.description?.trim().normalize("NFC") || null,
        timezone_override:draft.timezone_override?.trim() || null });
    }}>
      <h3 className="font-semibold">{chosen ? "Edit Location · revision " + revision : "New Location"}</h3>
      <label className="block">Location name
        <input required maxLength={120} className={control} value={draft.name}
          disabled={busy || draft.status === "ARCHIVED"}
          onChange={e => setDraft({ ...draft,name:e.target.value })} placeholder="Main branch or Online" />
      </label>
      <label className="block">Delivery context
        <select className={control} value={draft.kind} disabled={busy || draft.status === "ARCHIVED"}
          onChange={e => setDraft({ ...draft,kind:e.target.value as LocationAttributes["kind"] })}>
          {kinds.map(k => <option key={k} value={k}>{k.toLowerCase()}</option>)}
        </select>
      </label>
      <label className="block">Description / delivery instructions (optional)
        <textarea maxLength={500} className={control} value={draft.description ?? ""}
          disabled={busy || draft.status === "ARCHIVED"}
          onChange={e => setDraft({ ...draft,description:e.target.value || null })} />
      </label>
      <label className="block">Timezone override (optional)
        <input className={control} maxLength={100} disabled={busy || draft.status === "ARCHIVED"}
          placeholder="Inherit business timezone" value={draft.timezone_override ?? ""}
          onChange={e => setDraft({ ...draft,timezone_override:e.target.value || null })} />
      </label>
      <label className="block">Display order (0–9999)
        <input className={control} type="number" min={0} max={9999} step={1}
          disabled={busy || draft.status === "ARCHIVED"} value={draft.sort_order}
          onChange={e => setDraft({ ...draft,sort_order:e.target.valueAsNumber })} />
      </label>
      <label className="flex gap-2 items-center"><input type="checkbox" checked={draft.public_visible}
        disabled={busy || draft.status === "ARCHIVED"}
        onChange={e => setDraft({ ...draft,public_visible:e.target.checked })} />
        Eligible for future public display (still unpublished)
      </label>
      <label className="block">Operational status
        <select className={control} value={draft.status} disabled={busy || draft.status === "ARCHIVED"}
          onChange={e => setDraft({ ...draft,status:e.target.value as LocationAttributes["status"] })}>
          <option value="ACTIVE">Active</option><option value="INACTIVE">Inactive (no new availability)</option>
          {draft.status === "ARCHIVED" && <option value="ARCHIVED">Archived (read-only)</option>}
        </select>
      </label>
      <div className="flex flex-wrap gap-2">
        <button className={button} disabled={busy || draft.status === "ARCHIVED"}>Save Location locally</button>
        {chosen && draft.status !== "ARCHIVED" && <button className={button} type="button" disabled={busy}
          onClick={() => {
            const current = items.find(v=>v.location_id===chosen);
            if (current && window.confirm("Archive this Location? It cannot be reused for new bookings, but its history remains."))
              void save({ name:current.name,kind:current.kind,description:current.description,
                timezone_override:current.timezone_override,public_visible:current.public_visible,
                sort_order:current.sort_order,status:"ARCHIVED" });
          }}>Archive Location</button>}
        {chosen && <button type="button" disabled={busy} className={button}
          onClick={() => { const saved = items.find(v => v.location_id === chosen);if (saved) select(saved); }}>Discard unsaved changes</button>}
      </div>
    </form>}
    <p role="status" aria-live="polite">{message}</p>
  </section>;
}
