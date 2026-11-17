import type { Configuration } from "./session";
/** Display-only fallback: never writes an inferred value into the canonical Location. */
export function locationLabel(c: Configuration) {
  const safe = (value: string) => value.replace(/[<>\p{Cc}\p{Bidi_Control}]/gu, "").trim().slice(0, 100);
  return safe(c.location.name) || safe(c.business.name) || "Business venue";
}
/** The business heading already supplies the fallback; do not repeat it underneath. */
export function locationSummary(c: Configuration) {
  const label = locationLabel(c);
  return label.toLowerCase() === locationLabel({ ...c, location: { ...c.location, name: "" } }).toLowerCase() ? "" : label;
}
