/** M2 tenant-owned Staff and explicit scheduling eligibility. No Auth linkage,
 * availability engine, customer records, booking, or public projection. */
import type { SavedService } from "./services";
import type { SavedLocation } from "./locations";

export type StaffState = "ACTIVE" | "INACTIVE" | "ARCHIVED";
export type StaffAttributes = {
  name: string;
  public_display_name: string | null;
  biography: string | null;
  status: StaffState;
  public_visible: boolean;
  online_bookable: boolean;
  no_preference_eligible: boolean;
  sort_order: number;
};
export type SavedStaff = StaffAttributes & { staff_id: string; revision: number };
export type StaffList = { staff: SavedStaff[] };
export type StaffSaveResult = { staff_id: string; revision: number; staff: SavedStaff[] };

export type EligibilityKind = "STAFF_SERVICE" | "STAFF_LOCATION" | "SERVICE_LOCATION";
export type EligibilityAttributes = {
  kind: EligibilityKind;
  staff_id: string | null;
  service_id: string | null;
  location_id: string | null;
  enabled: boolean;
  duration_override_minutes: number | null;
  price_override_minor_units: number | null;
  buffer_before_override_minutes: number | null;
  buffer_after_override_minutes: number | null;
  online_bookable_override: boolean | null;
};
export type SavedEligibility = EligibilityAttributes & { eligibility_id: string; revision: number };
export type EligibilityList = { eligibility: SavedEligibility[] };
export type EligibilitySaveResult = {
  eligibility_id: string; revision: number; eligibility: SavedEligibility[];
};

const object = (v: unknown): v is Record<string,unknown> =>
  v!==null && typeof v==="object" && !Array.isArray(v);
const uuid = (v:unknown):v is string=>typeof v==="string" &&
  /^[0-9a-f]{8}(-[0-9a-f]{4}){3}-[0-9a-f]{12}$/i.test(v);
const revision=(v:unknown):v is number=>typeof v==="number" && Number.isInteger(v) &&
  v>=1 && v<=2147483647;
const text=(v:unknown,max:number):v is string=>typeof v==="string" && v.length>0 &&
  [...v].length<=max && v===v.trim() && v===v.normalize("NFC") &&
  !/[\p{Cc}\p{Cs}\p{Bidi_Control}\u2028\u2029<>{}]/u.test(v);
const integer=(v:unknown,min:number,max:number):v is number=>
  typeof v==="number" && Number.isInteger(v) && v>=min && v<=max;
const optionalInt=(v:unknown,min:number,max:number):v is number|null=>
  v===null || integer(v,min,max);
const staffKeys=["name","public_display_name","biography","status","public_visible",
  "online_bookable","no_preference_eligible","sort_order"] as const;
const eligibilityKeys=["kind","staff_id","service_id","location_id","enabled",
  "duration_override_minutes","price_override_minor_units","buffer_before_override_minutes",
  "buffer_after_override_minutes","online_bookable_override"] as const;

export function staffAttributes(v:unknown):StaffAttributes|null{
  if(!object(v)||Object.keys(v).length!==staffKeys.length||
    staffKeys.some(k=>!Object.hasOwn(v,k))||!text(v.name,120)||
    !(v.public_display_name===null||text(v.public_display_name,120))||
    !(v.biography===null||text(v.biography,1000))||
    !["ACTIVE","INACTIVE","ARCHIVED"].includes(String(v.status))||
    typeof v.public_visible!=="boolean"||typeof v.online_bookable!=="boolean"||
    typeof v.no_preference_eligible!=="boolean"||!integer(v.sort_order,0,9999))return null;
  return Object.fromEntries(staffKeys.map(k=>[k,v[k]])) as StaffAttributes;
}
export function savedStaff(v:unknown):v is SavedStaff{
  return object(v)&&Object.keys(v).length===staffKeys.length+2&&uuid(v.staff_id)&&
    revision(v.revision)&&staffAttributes(Object.fromEntries(staffKeys.map(k=>[k,v[k]])))!==null;
}
export function staffList(v:unknown):v is StaffList{
  return object(v)&&Object.keys(v).length===1&&Array.isArray(v.staff)&&v.staff.every(savedStaff);
}
export function staffSaveResult(v:unknown):v is StaffSaveResult{
  return object(v)&&Object.keys(v).length===3&&uuid(v.staff_id)&&revision(v.revision)&&
    Array.isArray(v.staff)&&v.staff.every(savedStaff)&&
    v.staff.some((s:SavedStaff)=>s.staff_id===v.staff_id&&s.revision===v.revision);
}
export function editableStaff(s:SavedStaff):StaffAttributes{
  return Object.fromEntries(staffKeys.map(k=>[k,s[k]])) as StaffAttributes;
}
export const blankStaff:StaffAttributes={
  name:"",public_display_name:null,biography:null,status:"ACTIVE",public_visible:false,
  online_bookable:false,no_preference_eligible:false,sort_order:0,
};

export function eligibilityAttributes(v:unknown):EligibilityAttributes|null{
  if(!object(v)||Object.keys(v).length!==eligibilityKeys.length||
    eligibilityKeys.some(k=>!Object.hasOwn(v,k))||
    !["STAFF_SERVICE","STAFF_LOCATION","SERVICE_LOCATION"].includes(String(v.kind))||
    !(v.staff_id===null||uuid(v.staff_id))||
    !(v.service_id===null||uuid(v.service_id))||
    !(v.location_id===null||uuid(v.location_id))||
    typeof v.enabled!=="boolean"||
    !optionalInt(v.duration_override_minutes,1,10080)||
    !optionalInt(v.price_override_minor_units,0,2147483647)||
    !optionalInt(v.buffer_before_override_minutes,0,1440)||
    !optionalInt(v.buffer_after_override_minutes,0,1440)||
    !(v.online_bookable_override===null||typeof v.online_bookable_override==="boolean"))
    return null;
  const staff=v.staff_id!==null,service=v.service_id!==null,location=v.location_id!==null;
  const pair=v.kind==="STAFF_SERVICE"?staff&&service&&!location:
    v.kind==="STAFF_LOCATION"?staff&&location&&!service:
      service&&location&&!staff;
  if(!pair||(v.kind!=="STAFF_SERVICE"&&
    [v.duration_override_minutes,v.price_override_minor_units,v.buffer_before_override_minutes,
      v.buffer_after_override_minutes,v.online_bookable_override].some(x=>x!==null)))return null;
  return Object.fromEntries(eligibilityKeys.map(k=>[k,v[k]])) as EligibilityAttributes;
}
export function savedEligibility(v:unknown):v is SavedEligibility{
  return object(v)&&Object.keys(v).length===eligibilityKeys.length+2&&uuid(v.eligibility_id)&&
    revision(v.revision)&&
    eligibilityAttributes(Object.fromEntries(eligibilityKeys.map(k=>[k,v[k]])))!==null;
}
export function eligibilityList(v:unknown):v is EligibilityList{
  return object(v)&&Object.keys(v).length===1&&Array.isArray(v.eligibility)&&
    v.eligibility.every(savedEligibility);
}
export function eligibilitySaveResult(v:unknown):v is EligibilitySaveResult{
  return object(v)&&Object.keys(v).length===3&&uuid(v.eligibility_id)&&
    revision(v.revision)&&Array.isArray(v.eligibility)&&v.eligibility.every(savedEligibility)&&
    v.eligibility.some((e:SavedEligibility)=>
      e.eligibility_id===v.eligibility_id&&e.revision===v.revision);
}
export function editableEligibility(e:SavedEligibility):EligibilityAttributes{
  return Object.fromEntries(eligibilityKeys.map(k=>[k,e[k]])) as EligibilityAttributes;
}
export function blankEligibility(kind:EligibilityKind):EligibilityAttributes{
  return {kind,staff_id:null,service_id:null,location_id:null,enabled:true,
    duration_override_minutes:null,price_override_minor_units:null,
    buffer_before_override_minutes:null,buffer_after_override_minutes:null,
    online_bookable_override:null};
}

/** Local structural preview only. Not time availability or a public API.
 * A No Preference candidate still needs every enabled three-way link. */
export function structuralCandidates(
  staff:SavedStaff[],services:SavedService[],locations:SavedLocation[],
  eligibility:SavedEligibility[],channel:"NAMED"|"NO_PREFERENCE",
):Array<{staff_id:string;service_id:string;location_id:string;duration_minutes:number;price_minor_units:number|null}>{
  const enabled=(kind:EligibilityKind,sid:string|null,vid:string|null,lid:string|null)=>
    eligibility.find(e=>e.kind===kind&&e.staff_id===sid&&e.service_id===vid&&
      e.location_id===lid)?.enabled===true;
  const results:Array<{staff_id:string;service_id:string;location_id:string;
    duration_minutes:number;price_minor_units:number|null}>=[];
  for(const member of staff){
    if(member.status!=="ACTIVE"||!member.online_bookable)continue;
    if(channel==="NAMED"&&!member.public_visible)continue;
    if(channel==="NO_PREFERENCE"&&!member.no_preference_eligible)continue;
    for(const service of services){
      if(service.status!=="ACTIVE"||
        !enabled("STAFF_SERVICE",member.staff_id,service.service_id,null))continue;
      const link=eligibility.find(e=>e.kind==="STAFF_SERVICE"&&e.staff_id===member.staff_id&&
        e.service_id===service.service_id);
      if(!(link?.online_bookable_override??service.online_bookable))continue;
      for(const location of locations){
        if(location.status!=="ACTIVE"||
          !enabled("STAFF_LOCATION",member.staff_id,null,location.location_id)||
          !enabled("SERVICE_LOCATION",null,service.service_id,location.location_id))continue;
        results.push({staff_id:member.staff_id,service_id:service.service_id,
          location_id:location.location_id,
          duration_minutes:link?.duration_override_minutes??service.duration_minutes,
          price_minor_units:link?.price_override_minor_units??service.price_minor_units});
      }
    }
  }
  return results;
}
