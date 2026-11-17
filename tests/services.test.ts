import { describe,expect,it } from "vitest";
import { blankService,currencyDigits,editableService,formatPriceMinor,parsePriceMinor,
  serviceAttributes,serviceList,serviceSaveResult } from "../app/lib/services";

const id="11111111-1111-4111-8111-111111111111";
const first={...blankService,name:"Initial consultation",description:"A fictional appointment",
  category:"Consultations",duration_minutes:45,price_minor_units:45000,
  currency_override:"ZAR",price_display:"AMOUNT" as const};
const saved={...first,service_id:id,revision:1};

describe("M2 Service contract",()=>{
  it("validates all fifteen typed fields and rejects unknown/unsafe inputs",()=>{
    expect(serviceAttributes(first)).toEqual(first);
    expect(serviceAttributes({...first,tenant_id:id})).toBeNull();
    expect(serviceAttributes({...first,name:"<script>"})).toBeNull();
    expect(serviceAttributes({...first,description:"Word\u202e"})).toBeNull();
    expect(serviceAttributes({...first,category:"  Incorrect"})).toBeNull();
    expect(serviceAttributes({...first,duration_minutes:0})).toBeNull();
    expect(serviceAttributes({...first,duration_minutes:10081})).toBeNull();
    expect(serviceAttributes({...first,price_minor_units:0.1})).toBeNull();
    expect(serviceAttributes({...first,currency_override:"zar"})).toBeNull();
    expect(serviceAttributes({...first,price_display:"FREE"})).toBeNull();
    expect(serviceAttributes({...first,price_minor_units:null})).toBeNull();
    expect(serviceAttributes({...first,price_minor_units:null,price_display:"ON_REQUEST"})).not.toBeNull();
    expect(serviceAttributes({...first,buffer_before_minutes:-1})).toBeNull();
    expect(serviceAttributes({...first,max_advance_days:0})).toBeNull();
    expect(serviceAttributes({...first,min_notice_minutes:-1})).toBeNull();
    expect(serviceAttributes({...first,sort_order:10000})).toBeNull();
    expect(serviceAttributes({...first,public_visible:"yes"})).toBeNull();
    expect(serviceAttributes({...first,online_bookable:"true"})).toBeNull();
    expect(serviceAttributes({...first,status:"DELETED"})).toBeNull();
  });
  it("preserves exact revision identities without accepting tenant overrides",()=>{
    expect(serviceList({services:[saved]})).toBe(true);
    expect(serviceList({services:[{...saved,tenant_id:id}]})).toBe(false);
    expect(serviceList({services:[{...saved,revision:0}]})).toBe(false);
    expect(serviceSaveResult({service_id:id,revision:1,services:[saved]})).toBe(true);
    expect(serviceSaveResult({service_id:id,revision:2,services:[saved]})).toBe(false);
    expect(serviceSaveResult({service_id:id,revision:1,services:[]})).toBe(false);
    expect(editableService(saved)).toEqual(first);
  });
  it("handles currency exponents and exact integer-minor-unit price conversion",()=>{
    expect(currencyDigits("ZAR")).toBe(2);
    expect(currencyDigits("JPY")).toBe(0);
    expect(currencyDigits("BHD")).toBe(3);
    expect(parsePriceMinor("450.99","ZAR")).toBe(45099);
    expect(parsePriceMinor("450.999","ZAR")).toBeNull();
    expect(parsePriceMinor("22","JPY")).toBe(22);
    expect(parsePriceMinor("2.111","BHD")).toBe(2111);
    expect(parsePriceMinor("-1.00","ZAR")).toBeNull();
    expect(parsePriceMinor("01.00","ZAR")).toBeNull();
    expect(parsePriceMinor("25000000.00","ZAR")).toBeNull();
    expect(formatPriceMinor(45099,"ZAR")).toBe("450.99");
    expect(formatPriceMinor(2111,"BHD")).toBe("2.111");
  });
});
