export type Hours = [string, string] | null;
export type BusinessDetails = {
  email: string;
  phone: string;
  hours: Hours[];
  min_notice_minutes: number;
  max_advance_days: number;
};
export const checkLabels = {
  identity: "Saved business name and regional settings",
  contact: "Business email or phone number",
  hours: "At least one open day",
  location: "Active location",
  service: "Active service with an appointment duration",
  staff: "Active staff member",
  eligibility: "Bookable practitioner linked to a service and location, with the service offered there",
};
export type OnboardingReview = {
  details: BusinessDetails | null;
  revision: number;
  summary: { business: string | null; timezone: string | null; locations: string[]; services: {name: string; minutes: number}[]; staff: string[] };
  checks: Record<keyof typeof checkLabels, boolean>;
  status: "draft" | "pending_entitlement" | "activated" | "verification_required";
  entitled: boolean | null;
  review_key: string;
};
const object = (value: unknown): value is Record<string, unknown> =>
  value !== null && typeof value === "object" && !Array.isArray(value);
const integer = (value: unknown, min: number, max: number): value is number =>
  typeof value === "number" && Number.isInteger(value) && value >= min && value <= max;
const time = (value: unknown): value is string => typeof value === "string" && /^([01]\d|2[0-3]):[0-5]\d$/.test(value);
export function validDetails(value: unknown): value is BusinessDetails {
  return object(value) && Object.keys(value).length === 5 &&
    typeof value.email === "string" && value.email.length <= 254 && (!value.email || /^[^\s@<>]+@[^\s@<>]+\.[^\s@<>]+$/.test(value.email)) &&
    typeof value.phone === "string" && /^[0-9+(). -]{0,40}$/.test(value.phone) && (!value.phone || /\d/.test(value.phone)) &&
    integer(value.min_notice_minutes, 0, 43200) && integer(value.max_advance_days, 1, 730) &&
    value.min_notice_minutes < value.max_advance_days * 1440 &&
    Array.isArray(value.hours) && value.hours.length === 7 && value.hours.every(slot =>
      slot === null || (Array.isArray(slot) && slot.length === 2 && time(slot[0]) && time(slot[1]) && slot[0] < slot[1]));
}
export function validReview(value: unknown): value is OnboardingReview {
  if (!object(value) || !object(value.checks) || !object(value.summary)) return false;
  const checks = value.checks;
  const summary = value.summary;
  const names = (v: unknown) => Array.isArray(v) && v.every(name => typeof name === "string");
  return (summary.business === null || typeof summary.business === "string") &&
    (summary.timezone === null || typeof summary.timezone === "string") && names(summary.locations) && names(summary.staff) &&
    Array.isArray(summary.services) && summary.services.every(s => object(s) && typeof s.name === "string" && integer(s.minutes, 1, 10080)) &&
    integer(value.revision, 0, 2147483647) && (value.revision === 0 ? value.details === null : validDetails(value.details)) &&
    typeof value.review_key === "string" && /^[0-9a-f]{32}$/.test(value.review_key) && (value.entitled === null || typeof value.entitled === "boolean") &&
    ["draft","pending_entitlement","activated","verification_required"].includes(String(value.status)) &&
    Object.keys(checkLabels).every(key => typeof checks[key] === "boolean") &&
    (value.status !== "verification_required" || value.entitled === null) &&
    (value.status !== "activated" || (value.entitled === true && Object.values(checks).every(v => v === true)));
}
