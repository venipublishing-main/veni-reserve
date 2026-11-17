/** M2 Location business-graph contract. No patient data or Auth identity. */
export type LocationKind = "PHYSICAL" | "VIRTUAL" | "MOBILE" | "OTHER";
export type LocationState = "ACTIVE" | "INACTIVE" | "ARCHIVED";
export type LocationAttributes = {
  name: string;
  kind: LocationKind;
  description: string | null;
  timezone_override: string | null;
  public_visible: boolean;
  sort_order: number;
  status: LocationState;
};
export type SavedLocation = LocationAttributes & {
  location_id: string;
  revision: number;
};
export type LocationList = { locations: SavedLocation[] };
export type LocationSaveResult = { location_id: string; revision: number; locations: SavedLocation[] };

const object = (value: unknown): value is Record<string, unknown> =>
  value !== null && typeof value === "object" && !Array.isArray(value);
const uuid = (value: unknown): value is string =>
  typeof value === "string" && /^[0-9a-f]{8}(-[0-9a-f]{4}){3}-[0-9a-f]{12}$/i.test(value);
const revision = (value: unknown): value is number =>
  typeof value === "number" && Number.isInteger(value) && value >= 1 && value <= 2147483647;
const safeString = (value: unknown, max: number): value is string =>
  typeof value === "string" && value.length > 0 && [...value].length <= max
  && value === value.trim() && value === value.normalize("NFC")
  && !/[\p{Cc}\p{Cs}\p{Bidi_Control}\u2028\u2029<>{}]/u.test(value);
const attributes = ["name","kind","description","timezone_override","public_visible","sort_order","status"];

export function locationAttributes(value: unknown): LocationAttributes | null {
  if (!object(value) || Object.keys(value).length !== attributes.length ||
    attributes.some(key => !Object.hasOwn(value,key)) ||
    !safeString(value.name,120) ||
    !["PHYSICAL","VIRTUAL","MOBILE","OTHER"].includes(String(value.kind)) ||
    !(value.description === null || safeString(value.description,500)) ||
    !(value.timezone_override === null ||
      (typeof value.timezone_override === "string" && value.timezone_override.length <= 100 &&
        /^[A-Za-z0-9_+/-]+$/.test(value.timezone_override))) ||
    typeof value.public_visible !== "boolean" ||
    typeof value.sort_order !== "number" || !Number.isInteger(value.sort_order) ||
    value.sort_order < 0 || value.sort_order > 9999 ||
    !["ACTIVE","INACTIVE","ARCHIVED"].includes(String(value.status))) return null;
  return {
    name: value.name, kind: value.kind as LocationKind,
    description: value.description as string | null,
    timezone_override: value.timezone_override as string | null,
    public_visible: value.public_visible, sort_order: value.sort_order,
    status: value.status as LocationState,
  };
}
export function locationList(value: unknown): value is LocationList {
  return object(value) && Object.keys(value).length === 1 &&
    Array.isArray(value.locations) && value.locations.every(savedLocation);
}
export function savedLocation(value: unknown): value is SavedLocation {
  return object(value) && Object.keys(value).length === 9 && uuid(value.location_id)
    && revision(value.revision) && locationAttributes(Object.fromEntries(attributes.map(key => [key,value[key]]))) !== null;
}
export function locationSaveResult(value: unknown): value is LocationSaveResult {
  return object(value) && Object.keys(value).length === 3 && uuid(value.location_id)
    && revision(value.revision) && Array.isArray(value.locations)
    && value.locations.every(savedLocation)
    && value.locations.some((entry: SavedLocation) =>
      entry.location_id === value.location_id && entry.revision === value.revision);
}

export const blankLocation: LocationAttributes = {
  name: "", kind: "PHYSICAL", description: null, timezone_override: null,
  public_visible: false, sort_order: 0, status: "ACTIVE",
};
