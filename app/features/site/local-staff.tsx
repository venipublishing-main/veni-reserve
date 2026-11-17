import { useEffect,useState } from "react";
import { blankStaff,editableStaff,staffAttributes,blankEligibility,editableEligibility,
  eligibilityAttributes,structuralCandidates } from "../../lib/staff";
import type { StaffAttributes,SavedStaff,StaffList,StaffSaveResult,EligibilityAttributes,
  EligibilityKind,SavedEligibility,EligibilityList,EligibilitySaveResult } from "../../lib/staff";
import type { SavedService,ServiceList } from "../../lib/services";
import { formatPriceMinor,parsePriceMinor,currencyDigits } from "../../lib/services";
import type { SavedLocation,LocationList } from "../../lib/locations";

const control="block w-full rounded border border-slate-400 bg-white px-3 py-2";
const button="rounded border border-slate-500 bg-white px-4 py-2 disabled:opacity-50";
const errors:Record<string,string>={
  unauthorized:"Your session has expired.",
  tenant_unavailable:"Your Staff/Services permissions changed or this business is inaccessible.",
  staff_unavailable:"This Staff record is unavailable or archived.",
  relation_unavailable:"An eligibility endpoint is unavailable in this business.",
  relation_exists:"This relationship already exists. Select it to enable or update it.",
  revision_conflict:"Another operator saved a newer revision. Reload and review before saving.",
  invalid_input:"Check Staff details or the selected relationship and override values.",
  dependency_unavailable:"Database unavailable; your unsaved inputs are retained.",
};
type Props={tenantId:string;defaultCurrency:string;apiBase:string};
export function LocalStaff({tenantId,defaultCurrency,apiBase}:Props){
  const [staff,setStaff]=useState<SavedStaff[]>([]),[services,setServices]=useState<SavedService[]>([]);
  const [locations,setLocations]=useState<SavedLocation[]>([]),[links,setLinks]=useState<SavedEligibility[]>([]);
  const [chosenStaff,setChosenStaff]=useState<string|null>(null),[staffRevision,setStaffRevision]=useState(0);
  const [draft,setDraft]=useState<StaffAttributes>({...blankStaff});
  const [chosenLink,setChosenLink]=useState<string|null>(null),[linkRevision,setLinkRevision]=useState(0);
  const [linkDraft,setLinkDraft]=useState<EligibilityAttributes>(blankEligibility("STAFF_SERVICE"));
  const [priceText,setPriceText]=useState("");
  const [ready,setReady]=useState(false),[busy,setBusy]=useState(false),[message,setMessage]=useState("");
  async function api<T>(path:string,method="GET",body?:unknown):Promise<T>{
    const response=await fetch(`${apiBase}/tenants/${tenantId}/${path}`,{
      method,headers:{"Content-Type":"application/json"},
      body:body===undefined?undefined:JSON.stringify(body),
    });
    let payload:unknown;
    try{payload=await response.json();}catch{throw new Error("Staff provider unavailable.");}
    if(!response.ok){
      const code=payload&&typeof payload==="object"&&"error" in payload?String(payload.error):"";
      throw new Error(errors[code]??"Staff request rejected. Unsaved input is retained.");
    }
    return payload as T;
  }
  async function reload(){
    const [members,offerings,branches,relations]=await Promise.all([
      api<StaffList>("staff"),api<ServiceList>("services"),
      api<LocationList>("locations"),api<EligibilityList>("eligibility"),
    ]);
    setStaff(members.staff);setServices(offerings.services);setLocations(branches.locations);
    setLinks(relations.eligibility);setReady(true);
    return {members,relations};
  }
  useEffect(()=>{
    let cancelled=false;
    void Promise.all([
      api<StaffList>("staff"),api<ServiceList>("services"),
      api<LocationList>("locations"),api<EligibilityList>("eligibility"),
    ]).then(([a,b,c,d])=>{if(cancelled)return;
      setStaff(a.staff);setServices(b.services);setLocations(c.locations);
      setLinks(d.eligibility);setReady(true);
    }).catch(()=>{if(!cancelled){setReady(true);
      setMessage("Cannot load Staff and eligibility. Check the provider and permissions.");}});
    return ()=>{cancelled=true;};
    // Parent remounts for each selected Tenant.
  },[tenantId]);
  function selectStaff(s:SavedStaff){
    setChosenStaff(s.staff_id);setStaffRevision(s.revision);setDraft(editableStaff(s));setMessage("");
  }
  function newStaff(){
    setChosenStaff(null);setStaffRevision(0);setDraft({...blankStaff,sort_order:staff.length});
    setMessage("");
  }
  async function saveStaff(attributes:StaffAttributes){
    if(busy)return;
    const safe=staffAttributes({...attributes,name:attributes.name.trim().normalize("NFC"),
      public_display_name:attributes.public_display_name?.trim().normalize("NFC")||null,
      biography:attributes.biography?.trim().normalize("NFC")||null});
    if(!safe){setMessage("Check Staff names, state and display order.");return;}
    setBusy(true);setMessage("");
    try{
      const result=await api<StaffSaveResult>(
        chosenStaff?`staff/${chosenStaff}`:"staff",chosenStaff?"PUT":"POST",
        {expected_revision:staffRevision,attributes:safe});
      const saved=result.staff.find(s=>s.staff_id===result.staff_id);
      if(!saved)throw new Error("Staff save could not be read back.");
      setStaff(result.staff);selectStaff(saved);
      setMessage(saved.status==="ARCHIVED"?"Archived without deleting the Staff identity.":
        `Staff saved, revision ${saved.revision}. No accounts or invitations created.`);
    }catch(error){setMessage(error instanceof Error?error.message:"Staff save failed.");}
    finally{setBusy(false);}
  }
  function priceCurrency(e:EligibilityAttributes){
    const service=services.find(s=>s.service_id===e.service_id);
    return service?.currency_override??defaultCurrency;
  }
  function selectLink(link:SavedEligibility){
    setChosenLink(link.eligibility_id);setLinkRevision(link.revision);
    setLinkDraft(editableEligibility(link));
    setPriceText(formatPriceMinor(link.price_override_minor_units,priceCurrency(link)));
    setMessage("");
  }
  function newLink(kind:EligibilityKind){
    setChosenLink(null);setLinkRevision(0);setLinkDraft(blankEligibility(kind));
    setPriceText("");setMessage("");
  }
  async function saveLink(attrs:EligibilityAttributes,price:string){
    if(busy)return;
    const amount=price.trim()===""?null:parsePriceMinor(price.trim(),priceCurrency(attrs));
    const safe=eligibilityAttributes({...attrs,price_override_minor_units:amount});
    if(!safe||(price.trim()!==""&&amount===null)){
      setMessage("Choose two valid endpoints and check every override (currency values are minor units).");
      return;
    }
    setBusy(true);setMessage("");
    try{
      const result=await api<EligibilitySaveResult>(
        chosenLink?`eligibility/${chosenLink}`:"eligibility",
        chosenLink?"PUT":"POST",{expected_revision:linkRevision,attributes:safe});
      const saved=result.eligibility.find(x=>x.eligibility_id===result.eligibility_id);
      if(!saved)throw new Error("Eligibility save could not be read back.");
      setLinks(result.eligibility);selectLink(saved);
      setMessage(`Eligibility ${saved.enabled?"enabled":"disabled"} (revision ${saved.revision}). No booking has been created.`);
    }catch(error){setMessage(error instanceof Error?error.message:"Eligibility save failed.");}
    finally{setBusy(false);}
  }
  const named=structuralCandidates(staff,services,locations,links,"NAMED").length;
  const automatic=structuralCandidates(staff,services,locations,links,"NO_PREFERENCE").length;
  const staffLocked=busy||draft.status==="ARCHIVED";
  const kind=linkDraft.kind,linkLocked=busy;
  const showStaff=kind!=="SERVICE_LOCATION",showService=kind!=="STAFF_LOCATION",
    showLocation=kind!=="STAFF_SERVICE";
  const nullableNumber=(key:"duration_override_minutes"|"buffer_before_override_minutes"|
    "buffer_after_override_minutes",label:string,min:number,max:number)=>
    <label className="block" key={key}>{label}
      <input className={control} type="number" step={1} min={min} max={max}
        value={linkDraft[key]??""} disabled={linkLocked}
        onChange={e=>setLinkDraft({...linkDraft,[key]:e.target.value===""?null:e.target.valueAsNumber})}/>
    </label>;
  const selectEndpoint=(key:"staff_id"|"service_id"|"location_id",label:string,
    items:Array<{id:string;name:string;status:string}>)=><label className="block" key={key}>{label}
    <select className={control} required disabled={linkLocked||!!chosenLink}
      value={linkDraft[key]??""} onChange={e=>setLinkDraft({...linkDraft,[key]:e.target.value||null})}>
      <option value="">Choose {label.toLowerCase()}</option>
      {items.map(item=><option key={item.id} value={item.id}>{item.name} · {item.status.toLowerCase()}</option>)}
    </select>
  </label>;
  return <section className="my-8 space-y-5 rounded-2xl border border-emerald-300 bg-emerald-50/30 p-5">
    <h2 className="text-xl font-semibold">Staff and explicit scheduling eligibility</h2>
    <p>A Staff Member is a person who may deliver Services. These records are independent of sign-in accounts, invitations and customer identities. Nothing here publishes a roster or offers a live time slot.</p>
    <div className="flex flex-wrap gap-2">
      <button type="button" className={button} disabled={busy||!ready} onClick={newStaff}>Add Staff Member</button>
      <button type="button" className={button} disabled={busy||!ready}
        onClick={()=>void reload().then(()=>setMessage("Staff, Services and eligibility reloaded.")).catch(()=>setMessage("Reload failed."))}>
        Reload everything</button>
    </div>
    <div className="flex flex-wrap gap-2" aria-label="Saved Staff">
      {staff.map(s=><button key={s.staff_id} type="button" className={button}
        aria-pressed={chosenStaff===s.staff_id} disabled={busy} onClick={()=>selectStaff(s)}>
        {s.name} · {s.status.toLowerCase()}
      </button>)}
      {ready&&!staff.length&&<p>No Staff Members yet.</p>}
    </div>
    {ready&&<form className="max-w-2xl space-y-3" onSubmit={e=>{e.preventDefault();void saveStaff(draft);}}>
      <h3 className="font-semibold">{chosenStaff?`Edit Staff · revision ${staffRevision}`:"New Staff Member"}</h3>
      <label className="block">Internal Staff name
        <input className={control} required maxLength={120} disabled={staffLocked} value={draft.name}
          onChange={e=>setDraft({...draft,name:e.target.value})} placeholder="Dr Example"/>
      </label>
      <label className="block">Optional public display name
        <input className={control} maxLength={120} disabled={staffLocked} value={draft.public_display_name??""}
          onChange={e=>setDraft({...draft,public_display_name:e.target.value||null})}/>
      </label>
      <label className="block">Optional customer-facing biography
        <textarea className={control} maxLength={1000} disabled={staffLocked} value={draft.biography??""}
          onChange={e=>setDraft({...draft,biography:e.target.value||null})}/>
      </label>
      <div className="grid gap-3 sm:grid-cols-2">
        <label className="block">Operational state
          <select className={control} disabled={staffLocked} value={draft.status}
            onChange={e=>setDraft({...draft,status:e.target.value as StaffAttributes["status"]})}>
            <option value="ACTIVE">Active</option><option value="INACTIVE">Inactive</option>
            {draft.status==="ARCHIVED"&&<option value="ARCHIVED">Archived (read-only)</option>}
          </select>
        </label>
        <label className="block">Display order
          <input className={control} type="number" min={0} max={9999} step={1}
            disabled={staffLocked} value={draft.sort_order}
            onChange={e=>setDraft({...draft,sort_order:e.target.valueAsNumber})}/>
        </label>
      </div>
      <label className="flex items-center gap-2">
        <input type="checkbox" checked={draft.public_visible} disabled={staffLocked}
          onChange={e=>setDraft({...draft,public_visible:e.target.checked})}/>
        May be shown as a named public Staff choice (not published yet)
      </label>
      <label className="flex items-center gap-2">
        <input type="checkbox" checked={draft.online_bookable} disabled={staffLocked}
          onChange={e=>setDraft({...draft,online_bookable:e.target.checked})}/>
        May participate in online bookings once the booking engine exists
      </label>
      <label className="flex items-center gap-2">
        <input type="checkbox" checked={draft.no_preference_eligible} disabled={staffLocked}
          onChange={e=>setDraft({...draft,no_preference_eligible:e.target.checked})}/>
        May receive automatic “No Preference” assignments, even if hidden
      </label>
      <div className="flex flex-wrap gap-2">
        <button className={button} disabled={staffLocked}>Save Staff</button>
        {chosenStaff&&draft.status!=="ARCHIVED"&&<button type="button" className={button} disabled={busy}
          onClick={()=>{const current=staff.find(s=>s.staff_id===chosenStaff);
            if(current&&window.confirm("Archive this Staff Member? Their identity and relationship history stay intact."))
              void saveStaff({...editableStaff(current),status:"ARCHIVED"});}}>Archive Staff</button>}
        {chosenStaff&&<button type="button" className={button} disabled={busy}
          onClick={()=>{const current=staff.find(s=>s.staff_id===chosenStaff);if(current)selectStaff(current);}}>Discard changes</button>}
      </div>
    </form>}
    <div className="border-t border-emerald-300 pt-5 space-y-3">
      <h3 className="text-lg font-semibold">Scheduling eligibility links</h3>
      <p>Assign a practitioner to a Service, a practitioner to a Location, and a Service to a Location. All three links must be enabled before a booking combination can become eligible.</p>
      <div className="flex flex-wrap gap-2">
        {(["STAFF_SERVICE","STAFF_LOCATION","SERVICE_LOCATION"] as const).map(k=>
          <button key={k} type="button" className={button} disabled={busy||!ready}
            onClick={()=>newLink(k)}>Add {k.replaceAll("_"," · ")}</button>)}
      </div>
      <div className="flex flex-wrap gap-2" aria-label="Saved eligibility relationships">
        {links.map(link=><button key={link.eligibility_id} type="button" className={button}
          aria-pressed={chosenLink===link.eligibility_id} disabled={busy} onClick={()=>selectLink(link)}>
          {link.kind.replaceAll("_","/")} · {link.enabled?"enabled":"disabled"} · r{link.revision}
        </button>)}
        {ready&&!links.length&&<p>No persisted eligibility yet: zero valid combinations.</p>}
      </div>
      {ready&&<form className="max-w-2xl space-y-3" onSubmit={e=>{e.preventDefault();void saveLink(linkDraft,priceText);}}>
        <h4 className="font-semibold">{chosenLink?`Edit relationship · revision ${linkRevision}`:
          `New ${kind.replaceAll("_","/")} relationship`}</h4>
        {showStaff&&selectEndpoint("staff_id","Staff Member",staff.map(s=>({
          id:s.staff_id,name:s.name,status:s.status})))}
        {showService&&selectEndpoint("service_id","Service",services.map(s=>({
          id:s.service_id,name:s.name,status:s.status})))}
        {showLocation&&selectEndpoint("location_id","Location",locations.map(l=>({
          id:l.location_id,name:l.name,status:l.status})))}
        <label className="flex items-center gap-2">
          <input type="checkbox" checked={linkDraft.enabled} disabled={linkLocked}
            onChange={e=>setLinkDraft({...linkDraft,enabled:e.target.checked})}/>
          Eligible (unticking disables future matches without deleting history)
        </label>
        {kind==="STAFF_SERVICE"&&<div className="space-y-3 rounded border border-emerald-200 p-3">
          <p>Optional Staff-specific overrides. Leave empty to inherit the Service defaults.</p>
          <div className="grid gap-3 sm:grid-cols-2">
            {nullableNumber("duration_override_minutes","Duration override (minutes)",1,10080)}
            {nullableNumber("buffer_before_override_minutes","Buffer before override (minutes)",0,1440)}
            {nullableNumber("buffer_after_override_minutes","Buffer after override (minutes)",0,1440)}
            <label className="block">Price override ({priceCurrency(linkDraft)}, {currencyDigits(priceCurrency(linkDraft))??"?"} decimal places)
              <input className={control} type="text" inputMode="decimal" disabled={linkLocked}
                value={priceText} onChange={e=>setPriceText(e.target.value)} placeholder="Inherit Service price"/>
            </label>
          </div>
          <label className="block">Online-bookable override
            <select className={control} disabled={linkLocked}
              value={linkDraft.online_bookable_override===null?"INHERIT":linkDraft.online_bookable_override?"YES":"NO"}
              onChange={e=>setLinkDraft({...linkDraft,online_bookable_override:
                e.target.value==="INHERIT"?null:e.target.value==="YES"})}>
              <option value="INHERIT">Inherit from Service</option><option value="YES">Permit, subject to all gates</option>
              <option value="NO">Block online booking for this Staff–Service pair</option>
            </select>
          </label>
        </div>}
        <div className="flex flex-wrap gap-2">
          <button className={button} disabled={linkLocked}>Save relationship</button>
          {chosenLink&&<button className={button} type="button" disabled={busy}
            onClick={()=>{const current=links.find(x=>x.eligibility_id===chosenLink);
              if(current)selectLink(current);}}>Discard changes</button>}
        </div>
      </form>}
    </div>
    <div className="rounded border border-emerald-300 bg-white p-3">
      <p className="font-semibold">Structural eligibility preview (not live availability)</p>
      <p>Named Staff combinations: {named}. “No Preference” combinations: {automatic}.</p>
      <p className="text-sm">This preview checks active records, online flags and all three explicit links. Working hours, calendar conflicts, publication and appointment locking are still future milestones.</p>
    </div>
    <p role="status" aria-live="polite">{message}</p>
  </section>;
}
