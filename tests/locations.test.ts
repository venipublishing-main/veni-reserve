import { describe,expect,it } from "vitest";
import { blankLocation, locationAttributes, locationList, locationSaveResult } from "../app/lib/locations";

const id = "11111111-1111-4111-8111-111111111111";
const first = { ...blankLocation,name:"Main Branch",description:"Second floor",timezone_override:null };
const saved = { ...first,location_id:id,revision:1 };

describe("M2 Location contract", () => {
  it("accepts only the seven canonical typed attributes", () => {
    expect(locationAttributes(first)).toEqual(first);
    expect(locationAttributes({ ...first,tenant_id:id })).toBeNull();
    expect(locationAttributes({ ...first,html:"<script>" })).toBeNull();
    expect(locationAttributes({ ...first,name:" <b>Main</b>" })).toBeNull();
    expect(locationAttributes({ ...first,name:" Main" })).toBeNull();
    expect(locationAttributes({ ...first,name:"x".repeat(121) })).toBeNull();
    expect(locationAttributes({ ...first,name:"L\u202eocation" })).toBeNull();
    expect(locationAttributes({ ...first,kind:"OFFICE" })).toBeNull();
    expect(locationAttributes({ ...first,public_visible:"true" })).toBeNull();
    expect(locationAttributes({ ...first,description:123 })).toBeNull();
    expect(locationAttributes({ ...first,description:"x".repeat(501) })).toBeNull();
    expect(locationAttributes({ ...first,timezone_override:"../../etc/passwd" })).toBeNull();
    expect(locationAttributes({ ...first,sort_order:1.5 })).toBeNull();
    expect(locationAttributes({ ...first,sort_order:10000 })).toBeNull();
    expect(locationAttributes({ ...first,status:"DELETED" })).toBeNull();
  });
  it("validates saved versioned identities and exact output contracts", () => {
    expect(locationList({locations:[]})).toBe(true);
    expect(locationList({locations:[saved]})).toBe(true);
    expect(locationList({locations:[{...saved,tenant_id:id}]})).toBe(false);
    expect(locationList({locations:[{...saved,revision:0}]})).toBe(false);
    expect(locationSaveResult({location_id:id,revision:1,locations:[saved]})).toBe(true);
    expect(locationSaveResult({location_id:id,revision:2,locations:[saved]})).toBe(false);
    expect(locationSaveResult({location_id:id,revision:1,locations:[]})).toBe(false);
  });
});
