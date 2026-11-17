import { describe,it,expect } from "vitest";
import { blankStaff,blankEligibility,staffAttributes,staffList,staffSaveResult,
  eligibilityAttributes,eligibilityList,eligibilitySaveResult,structuralCandidates }
  from "../app/lib/staff";
import type { SavedStaff,SavedEligibility } from "../app/lib/staff";
import type { SavedService } from "../app/lib/services";
import type { SavedLocation } from "../app/lib/locations";

const a="11111111-1111-4111-8111-111111111111";
const b="22222222-2222-4222-8222-222222222222";
const c="33333333-3333-4333-8333-333333333333";
const d="44444444-4444-4444-8444-444444444444";
const e="55555555-5555-4555-8555-555555555555";
const f="66666666-6666-4666-8666-666666666666";
const member:SavedStaff={...blankStaff,name:"Dr Fictional",staff_id:a,revision:1};
const service:SavedService={service_id:b,revision:1,name:"Synthetic appointment",description:null,
  category:null,duration_minutes:45,price_minor_units:45000,currency_override:"ZAR",
  price_display:"AMOUNT",buffer_before_minutes:5,buffer_after_minutes:10,
  min_notice_minutes:null,max_advance_days:null,public_visible:true,
  online_bookable:true,sort_order:0,status:"ACTIVE"};
const location:SavedLocation={location_id:c,revision:1,name:"Synthetic branch",
  kind:"PHYSICAL",description:null,timezone_override:null,public_visible:true,
  sort_order:0,status:"ACTIVE"};
const ss:SavedEligibility={...blankEligibility("STAFF_SERVICE"),staff_id:a,service_id:b,
  eligibility_id:d,revision:1};
const sl:SavedEligibility={...blankEligibility("STAFF_LOCATION"),staff_id:a,location_id:c,
  eligibility_id:e,revision:1};
const vl:SavedEligibility={...blankEligibility("SERVICE_LOCATION"),service_id:b,location_id:c,
  eligibility_id:f,revision:1};

describe("tenant-private Staff profile",()=>{
  it("keeps operational, public and no-preference states separate",()=>{
    expect(staffAttributes({...blankStaff,name:"Alex",online_bookable:true,public_visible:false,
      no_preference_eligible:true})).not.toBeNull();
    expect(staffAttributes({...blankStaff,name:"Alex",public_visible:true,online_bookable:false})).not.toBeNull();
  });
  it.each([
    {...blankStaff,name:""},
    {...blankStaff,name:"<script>"},
    {...blankStaff,name:" Alex"},
    {...blankStaff,name:"Alex",extra:"unexpected"},
    {...blankStaff,name:"Alex",sort_order:1.1},
    {...blankStaff,name:"Alex",sort_order:-1},
    {...blankStaff,name:"Alex",status:"DELETED"},
    {...blankStaff,name:"Alex",public_visible:"true"},
    {...blankStaff,name:"Alex",public_display_name:"{unsafe}"},
    {...blankStaff,name:"Alex",biography:"Bad\u202e"},
  ])("rejects malformed Staff metadata %#",(bad)=>expect(staffAttributes(bad)).toBeNull());
  it("requires bounded stable IDs, validated revisions and exact payload keys",()=>{
    expect(staffList({staff:[member]})).toBe(true);
    expect(staffList({staff:[{...member,staff_id:"foreign"}]})).toBe(false);
    expect(staffSaveResult({staff_id:a,revision:1,staff:[member]})).toBe(true);
    expect(staffSaveResult({staff_id:a,revision:2,staff:[member]})).toBe(false);
  });
});
describe("explicit Staff/Service/Location relationships",()=>{
  it("accepts exactly three tenant-scoped pair shapes",()=>{
    expect(eligibilityAttributes(ss)).toBeNull(); // persisted keys must not be sent as input
    for(const item of [ss,sl,vl]){
      const attributes=Object.fromEntries(Object.entries(item)
        .filter(([key])=>!["eligibility_id","revision"].includes(key)));
      expect(eligibilityAttributes(attributes)).not.toBeNull();
    }
    expect(eligibilityList({eligibility:[ss,sl,vl]})).toBe(true);
    expect(eligibilitySaveResult({eligibility_id:d,revision:1,eligibility:[ss,sl,vl]})).toBe(true);
  });
  it.each([
    {...blankEligibility("STAFF_SERVICE"),staff_id:a,service_id:null},
    {...blankEligibility("STAFF_LOCATION"),staff_id:a,service_id:b,location_id:c},
    {...blankEligibility("SERVICE_LOCATION"),staff_id:a,service_id:b,location_id:c},
    {...blankEligibility("STAFF_SERVICE"),staff_id:a,service_id:b,location_id:c},
    {...blankEligibility("STAFF_SERVICE"),staff_id:a,service_id:"foreign"},
    {...blankEligibility("STAFF_SERVICE"),staff_id:a,service_id:b,duration_override_minutes:0},
    {...blankEligibility("STAFF_SERVICE"),staff_id:a,service_id:b,price_override_minor_units:2.5},
    {...blankEligibility("STAFF_LOCATION"),staff_id:a,location_id:c,duration_override_minutes:60},
    {...blankEligibility("SERVICE_LOCATION"),service_id:b,location_id:c,online_bookable_override:false},
    {...blankEligibility("STAFF_SERVICE"),staff_id:a,service_id:b,enabled:"yes"},
  ])("fails closed on malformed endpoints, fields and overrides %#",(bad)=>
    expect(eligibilityAttributes(bad)).toBeNull());
  it("requires the entire enabled intersection for either booking channel",()=>{
    const staff=[{...member,online_bookable:true,public_visible:false,no_preference_eligible:true}];
    const links=[ss,sl,vl];
    expect(structuralCandidates(staff,[service],[location],links,"NAMED")).toEqual([]);
    expect(structuralCandidates(staff,[service],[location],links,"NO_PREFERENCE")).toEqual([{
      staff_id:a,service_id:b,location_id:c,duration_minutes:45,price_minor_units:45000,
    }]);
    expect(structuralCandidates(staff,[service],[location],[ss,sl],"NO_PREFERENCE")).toEqual([]);
    expect(structuralCandidates(staff,[service],[location],[ss,{...sl,enabled:false},vl],
      "NO_PREFERENCE")).toEqual([]);
    expect(structuralCandidates(staff,[{...service,status:"ARCHIVED"}],[location],links,
      "NO_PREFERENCE")).toEqual([]);
    expect(structuralCandidates([{...staff[0],status:"INACTIVE"}],[service],[location],links,
      "NO_PREFERENCE")).toEqual([]);
    expect(structuralCandidates(staff,[service],[{...location,status:"INACTIVE"}],links,
      "NO_PREFERENCE")).toEqual([]);
  });
  it("uses Staff–Service overrides per attribute without changing service defaults",()=>{
    const staff=[{...member,online_bookable:true,public_visible:true,no_preference_eligible:true}];
    const links=[{...ss,duration_override_minutes:60,price_override_minor_units:60000},sl,vl];
    expect(structuralCandidates(staff,[service],[location],links,"NAMED")[0]).toMatchObject({
      duration_minutes:60,price_minor_units:60000,
    });
    expect(service.duration_minutes).toBe(45);
    expect(structuralCandidates(staff,[service],[location],
      [{...ss,online_bookable_override:false},sl,vl],"NAMED")).toEqual([]);
    expect(structuralCandidates(staff,[{...service,online_bookable:false}],[location],
      links,"NAMED")).toEqual([]);
    expect(structuralCandidates(staff,[{...service,online_bookable:false}],[location],
      [{...ss,online_bookable_override:true},sl,vl],"NAMED")).toHaveLength(1);
  });
});
