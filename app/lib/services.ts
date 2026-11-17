/** M2 tenant-owned Service catalogue. No booking, customer or public projection. */
export type ServiceState = "ACTIVE" | "INACTIVE" | "ARCHIVED";
export type PriceDisplay = "AMOUNT" | "FROM" | "ON_REQUEST" | "HIDDEN";
export type ServiceAttributes = {
  name: string;
  description: string | null;
  category: string | null;
  duration_minutes: number;
  price_minor_units: number | null;
  currency_override: string | null;
  price_display: PriceDisplay;
  buffer_before_minutes: number;
  buffer_after_minutes: number;
  min_notice_minutes: number | null;
  max_advance_days: number | null;
  public_visible: boolean;
  online_bookable: boolean;
  sort_order: number;
  status: ServiceState;
};
export type SavedService = ServiceAttributes & { service_id: string; revision: number };
export type ServiceList = { services: SavedService[] };
export type ServiceSaveResult = { service_id: string; revision: number; services: SavedService[] };

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
const integer = (value: unknown, min: number, max: number): value is number =>
  typeof value === "number" && Number.isInteger(value) && value >= min && value <= max;
const nullableInteger = (value: unknown, min: number, max: number): value is number | null =>
  value === null || integer(value,min,max);
const keys = ["name","description","category","duration_minutes","price_minor_units",
  "currency_override","price_display","buffer_before_minutes","buffer_after_minutes",
  "min_notice_minutes","max_advance_days","public_visible","online_bookable","sort_order","status"] as const;

export function serviceAttributes(value: unknown): ServiceAttributes | null {
  if (!object(value) || Object.keys(value).length !== keys.length || keys.some(k => !Object.hasOwn(value,k))
    || !safeString(value.name,120)
    || !(value.description === null || safeString(value.description,1000))
    || !(value.category === null || safeString(value.category,80))
    || !integer(value.duration_minutes,1,10080)
    || !nullableInteger(value.price_minor_units,0,2147483647)
    || !(value.currency_override === null || (typeof value.currency_override === "string" && /^[A-Z]{3}$/.test(value.currency_override)))
    || !["AMOUNT","FROM","ON_REQUEST","HIDDEN"].includes(String(value.price_display))
    || (["AMOUNT","FROM"].includes(String(value.price_display)) && value.price_minor_units === null)
    || !integer(value.buffer_before_minutes,0,1440) || !integer(value.buffer_after_minutes,0,1440)
    || !nullableInteger(value.min_notice_minutes,0,525600)
    || !nullableInteger(value.max_advance_days,1,3650)
    || typeof value.public_visible !== "boolean" || typeof value.online_bookable !== "boolean"
    || !integer(value.sort_order,0,9999)
    || !["ACTIVE","INACTIVE","ARCHIVED"].includes(String(value.status))) return null;
  return Object.fromEntries(keys.map(k => [k,value[k]])) as ServiceAttributes;
}

export function savedService(value: unknown): value is SavedService {
  return object(value) && Object.keys(value).length === keys.length + 2 && uuid(value.service_id)
    && revision(value.revision)
    && serviceAttributes(Object.fromEntries(keys.map(k => [k,value[k]]))) !== null;
}
export function serviceList(value: unknown): value is ServiceList {
  return object(value) && Object.keys(value).length === 1 && Array.isArray(value.services)
    && value.services.every(savedService);
}
export function serviceSaveResult(value: unknown): value is ServiceSaveResult {
  return object(value) && Object.keys(value).length === 3 && uuid(value.service_id)
    && revision(value.revision) && Array.isArray(value.services)
    && value.services.every(savedService)
    && value.services.some((entry: SavedService) =>
      entry.service_id === value.service_id && entry.revision === value.revision);
}
export function editableService(saved: SavedService): ServiceAttributes {
  return Object.fromEntries(keys.map(k=>[k,saved[k]])) as ServiceAttributes;
}
export const blankService: ServiceAttributes = {
  name:"",description:null,category:null,duration_minutes:30,price_minor_units:null,
  currency_override:null,price_display:"ON_REQUEST",buffer_before_minutes:0,buffer_after_minutes:0,
  min_notice_minutes:null,max_advance_days:null,public_visible:false,online_bookable:false,
  sort_order:0,status:"ACTIVE",
};

/** Use a currency's actual decimal exponent (JPY=0, BHD=3, ZAR=2). */
export function currencyDigits(code: string): number | null {
  try {
    if (!/^[A-Z]{3}$/.test(code)) return null;
    return new Intl.NumberFormat("en", { style:"currency",currency:code }).resolvedOptions().maximumFractionDigits ?? null;
  } catch { return null; }
}
/** Never use floating-point arithmetic when accepting a currency price. */
export function parsePriceMinor(raw: string, currency: string): number | null {
  const digits = currencyDigits(currency);
  if (digits === null || digits > 4) return null;
  if (!new RegExp(`^(0|[1-9][0-9]{0,9})(?:\\.([0-9]{1,${Math.max(1,digits)}}))?$`).test(raw)
    || (digits === 0 && raw.includes("."))) return null;
  const [major, fraction=""] = raw.split(".");
  const value = Number(BigInt(major)*10n**BigInt(digits)+BigInt(fraction.padEnd(digits,"0") || "0"));
  return Number.isSafeInteger(value) && value <= 2147483647 ? value : null;
}
export function formatPriceMinor(value: number | null, currency: string): string {
  const digits = currencyDigits(currency);
  if (value === null || digits === null) return "";
  const unit = 10 ** digits;
  return digits === 0 ? String(value) : `${Math.trunc(value/unit)}.${String(value%unit).padStart(digits,"0")}`;
}
