import { useEffect,useRef, useState } from "react";
import { blankService,currencyDigits,editableService,formatPriceMinor,parsePriceMinor,
  serviceAttributes } from "../../lib/services";
import type { SavedService,ServiceAttributes,ServiceList,ServiceSaveResult } from "../../lib/services";

const control="block w-full rounded border border-slate-400 bg-white px-3 py-2";
const button="rounded border border-slate-500 bg-white px-4 py-2 disabled:opacity-50";
const errors: Record<string,string>={
  unauthorized:"Your sign-in expired. Please sign in again.",
  tenant_unavailable:"Your permissions changed; reopen an authorised business.",
  service_unavailable:"This Service was archived or is no longer editable.",
  revision_conflict:"Another operator changed this Service. Reload it before saving.",
  invalid_input:"Check the Service name, duration, price, currency and booking rules.",
  dependency_unavailable:"The Service database is unavailable; your edits remain here.",
};

export function LocalServices({tenantId,defaultCurrency,apiBase}:{tenantId:string;defaultCurrency:string;apiBase:string}){
  const [items,setItems]=useState<SavedService[]>([]),[chosen,setChosen]=useState<string|null>(null);
  const [draft,setDraft]=useState<ServiceAttributes>({...blankService});
  const [priceText,setPriceText]=useState(""),[revision,setRevision]=useState(0);
  const [busy,setBusy]=useState(false),[ready,setReady]=useState(false),[message,setMessage]=useState("");
  const currency=draft.currency_override??defaultCurrency;
  const digits=currencyDigits(currency);
  const createKey = useRef<string | null>(null);
  async function api<T>(method="GET",serviceId?:string,body?:unknown):Promise<T>{
    const headers = new Headers({ "Content-Type": "application/json" });
    if (apiBase === "/api/workspace" && method === "POST") {
      createKey.current ??= crypto.randomUUID();
      headers.set("Idempotency-Key", createKey.current);
    }
    const response=await fetch(`${apiBase}/tenants/${tenantId}/services`+
      (serviceId?`/${serviceId}`:""),{
      method, headers,
      body:body===undefined?undefined:JSON.stringify(body),
    });
    let payload:unknown;
    try{payload=await response.json();}catch{throw new Error("Service storage unavailable.");}
    if(!response.ok){
      const code=payload&&typeof payload==="object"&&"error" in payload?String(payload.error):"";
      throw new Error(errors[code]??"Service request rejected. Your unsaved input is retained.");
    }
    return payload as T;
  }
  function select(saved:SavedService){
    setChosen(saved.service_id);setRevision(saved.revision);setDraft(editableService(saved));
    setPriceText(formatPriceMinor(saved.price_minor_units,saved.currency_override??defaultCurrency));
    setMessage("");
  }
  function startNew(){
    createKey.current = null;
    setChosen(null);setRevision(0);setDraft({...blankService,sort_order:items.length});
    setPriceText("");setMessage("");
  }
  async function reload(){
    const list=await api<ServiceList>();setItems(list.services);
    const same=list.services.find(entry=>entry.service_id===chosen);
    if(same)select(same);
  }
  useEffect(()=>{
    let ignore=false;
    void api<ServiceList>().then(list=>{if(!ignore){setItems(list.services);setReady(true);}})
      .catch(()=>{if(!ignore){setReady(true);setMessage("Cannot load private Services. Check the provider or your session.");}});
    return ()=>{ignore=true;};
    // Parent remounts the editor for each selected Tenant.
  },[tenantId]);
  async function save(attributes:ServiceAttributes,price:string){
    if(busy)return;
    const priceValue=price.trim()===""?null:parsePriceMinor(price.trim(),attributes.currency_override??defaultCurrency);
    const safe=serviceAttributes({...attributes,
      name:attributes.name.trim().normalize("NFC"),
      description:attributes.description?.trim().normalize("NFC")||null,
      category:attributes.category?.trim().normalize("NFC")||null,
      currency_override:attributes.currency_override?.trim().toUpperCase()||null,
      price_minor_units:priceValue});
    if((price.trim()!==""&&priceValue===null)||!safe){
      setMessage("Please check every field. Enter a nonnegative price with the correct currency decimal places.");return;
    }
    setBusy(true);setMessage("");
    try{
      const result=await api<ServiceSaveResult>(chosen?"PUT":"POST",chosen??undefined,
        {expected_revision:revision,attributes:safe});
      const saved=result.services.find(v=>v.service_id===result.service_id);
      if(!saved)throw new Error("Saved Service could not be read back.");
      setItems(result.services);select(saved);
      setMessage(saved.status==="ARCHIVED"?"Service archived; future bookings cannot use it. Its ID/history remain.":
        `Saved Service to the database (revision ${saved.revision}). Still unpublished.`);
    }catch(error){setMessage(error instanceof Error?error.message:"Service save failed.");}
    finally{setBusy(false);}
  }
  const locked=busy||draft.status==="ARCHIVED";
  const numberField=(key:"duration_minutes"|"buffer_before_minutes"|"buffer_after_minutes"|"sort_order",
    label:string,min:number,max:number)=> <label className="block" key={key}>{label}
    <input className={control} type="number" step={1} min={min} max={max} required disabled={locked}
      value={draft[key]} onChange={e=>setDraft({...draft,[key]:e.target.valueAsNumber})}/>
  </label>;
  const optionalNumber=(key:"min_notice_minutes"|"max_advance_days",label:string,min:number,max:number)=>
    <label className="block" key={key}>{label}
      <input className={control} type="number" step={1} min={min} max={max} disabled={locked}
        placeholder="Use business booking defaults" value={draft[key]??""}
        onChange={e=>setDraft({...draft,[key]:e.target.value===""?null:e.target.valueAsNumber})}/>
    </label>;
  return <section className="my-8 space-y-4 rounded-2xl border border-sky-300 bg-sky-50/30 p-5">
    <h2 className="text-xl font-semibold">Services — persistent catalogue</h2>
    <p>Describe the appointment types your business offers. Active, publicly visible and online-bookable are separate choices. These records remain private; this editor does not publish services or create bookings.</p>
    <div className="flex flex-wrap gap-2">
      <button className={button} type="button" disabled={busy||!ready} onClick={startNew}>Add Service</button>
      <button className={button} type="button" disabled={busy||!ready}
        onClick={()=>void reload().then(()=>setMessage("Services reloaded.")).catch(()=>setMessage("Provider unavailable."))}>Reload saved Services</button>
    </div>
    <div className="flex flex-wrap gap-2" aria-label="Saved Services">
      {items.map(item=><button key={item.service_id} type="button" className={button}
        aria-pressed={chosen===item.service_id} disabled={busy} onClick={()=>select(item)}>
          {item.name} · {item.duration_minutes} min · {item.status.toLowerCase()}
        </button>)}
      {ready&&!items.length&&<p>No Services saved yet. Add your first appointment type.</p>}
    </div>
    {ready&&<form className="max-w-2xl space-y-3" onSubmit={e=>{e.preventDefault();void save(draft,priceText);}}>
      <h3 className="font-semibold">{chosen?`Edit Service · revision ${revision}`:"New Service"}</h3>
      <label className="block">Service name
        <input required maxLength={120} className={control} disabled={locked} value={draft.name}
          onChange={e=>setDraft({...draft,name:e.target.value})} placeholder="Initial consultation"/>
      </label>
      <label className="block">Category (optional)
        <input maxLength={80} className={control} disabled={locked} value={draft.category??""}
          onChange={e=>setDraft({...draft,category:e.target.value||null})} placeholder="Consultations"/>
      </label>
      <label className="block">Customer-facing description (optional)
        <textarea maxLength={1000} className={control} disabled={locked} value={draft.description??""}
          onChange={e=>setDraft({...draft,description:e.target.value||null})}/>
      </label>
      <div className="grid gap-3 sm:grid-cols-3">
        {numberField("duration_minutes","Appointment duration (minutes)",1,10080)}
        {numberField("buffer_before_minutes","Buffer before (minutes)",0,1440)}
        {numberField("buffer_after_minutes","Buffer after (minutes)",0,1440)}
      </div>
      <div className="grid gap-3 sm:grid-cols-2">
        <label className="block">Currency override (optional)
          <input className={control} maxLength={3} placeholder={`Inherit ${defaultCurrency}`}
            value={draft.currency_override??""} disabled={locked}
            onChange={e=>setDraft({...draft,currency_override:e.target.value.toUpperCase()||null})}/>
        </label>
        <label className="block">Price display
          <select className={control} disabled={locked} value={draft.price_display}
            onChange={e=>setDraft({...draft,price_display:e.target.value as ServiceAttributes["price_display"]})}>
            <option value="ON_REQUEST">Price on request</option><option value="AMOUNT">Fixed amount</option>
            <option value="FROM">From this amount</option><option value="HIDDEN">Hide public price</option>
          </select>
        </label>
      </div>
      <label className="block">Price in {currency} (optional, {digits??"?"} decimal places)
        <input className={control} inputMode="decimal" type="text" placeholder="e.g. 450.00"
          disabled={locked} value={priceText} onChange={e=>setPriceText(e.target.value)}/>
        <span className="text-sm text-slate-600">Stored as integer minor units. Changing currency does not convert the amount. No payment collection is enabled.</span>
      </label>
      <div className="grid gap-3 sm:grid-cols-2">
        {optionalNumber("min_notice_minutes","Minimum booking notice (minutes)",0,525600)}
        {optionalNumber("max_advance_days","Maximum booking horizon (days)",1,3650)}
      </div>
      <div className="grid gap-3 sm:grid-cols-2">
        {numberField("sort_order","Display order (0–9999)",0,9999)}
        <label className="block">Operational status
          <select className={control} disabled={locked} value={draft.status}
            onChange={e=>setDraft({...draft,status:e.target.value as ServiceAttributes["status"]})}>
            <option value="ACTIVE">Active</option><option value="INACTIVE">Inactive</option>
            {draft.status==="ARCHIVED"&&<option value="ARCHIVED">Archived (read-only)</option>}
          </select>
        </label>
      </div>
      <label className="flex items-center gap-2"><input type="checkbox" disabled={locked}
        checked={draft.public_visible} onChange={e=>setDraft({...draft,public_visible:e.target.checked})}/>
        Eligible for future public listing (not yet published)
      </label>
      <label className="flex items-center gap-2"><input type="checkbox" disabled={locked}
        checked={draft.online_bookable} onChange={e=>setDraft({...draft,online_bookable:e.target.checked})}/>
        Eligible for future online booking (still no public booking)
      </label>
      <div className="flex flex-wrap gap-2">
        <button className={button} disabled={locked}>Save Service</button>
        {chosen&&draft.status!=="ARCHIVED"&&<button type="button" className={button} disabled={busy}
          onClick={()=>{const current=items.find(v=>v.service_id===chosen);
            if(current&&window.confirm("Archive this Service? It will no longer accept new bookings, but its history will remain."))
              void save({...editableService(current),status:"ARCHIVED"},
                formatPriceMinor(current.price_minor_units,current.currency_override??defaultCurrency));}}
        >Archive Service</button>}
        {chosen&&<button type="button" className={button} disabled={busy}
          onClick={()=>{const current=items.find(v=>v.service_id===chosen);if(current)select(current);}}>Discard unsaved changes</button>}
      </div>
    </form>}
    <p role="status" aria-live="polite">{message}</p>
  </section>;
}
