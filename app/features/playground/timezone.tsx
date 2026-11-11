import { useEffect, useState } from "react";
import { dayClock } from "../booking/availability";

export function canonicalZone(zone: string): string | null {
  try { return zone ? new Intl.DateTimeFormat("en", { timeZone: zone }).resolvedOptions().timeZone : null; }
  catch { return null; }
}
export function zoneChoices(): string[] {
  const fallback = ["UTC", "Africa/Johannesburg", "Africa/Nairobi", "Europe/London", "Europe/Paris", "America/New_York", "Asia/Kolkata", "Australia/Sydney"];
  try {
    const zones = typeof Intl.supportedValuesOf === "function" ? Intl.supportedValuesOf("timeZone") : fallback;
    return [...new Set([...zones, "UTC"].map(canonicalZone).filter((z): z is string => !!z))].sort();
  } catch { return fallback.map(canonicalZone).filter((z): z is string => !!z); }
}
export function zoneLabel(zone: string) {
  const parts = zone.replaceAll("_", " ").split("/");
  return `${parts.at(-1)}${parts.length > 1 ? ` (${parts.slice(0, -1).join(" / ")})` : ""} — ${zone}`;
}
export function zonePreview(zone: string, instant: Date): string {
  try {
    return new Intl.DateTimeFormat("en-GB", { timeZone: zone, dateStyle: "medium", timeStyle: "long" }).format(instant) +
      " · " + (new Intl.DateTimeFormat("en", { timeZone: zone, timeZoneName: "longOffset" }).formatToParts(instant).find(p => p.type === "timeZoneName")?.value.replace("GMT", "UTC") ?? "UTC offset unavailable");
  } catch { return "Time preview unavailable; choose a supported timezone."; }
}
export function zoneDatePreview(zone: string, date: string): string {
  try {
    const noon = dayClock(date, zone)(720);
    return noon === null ? "Local noon is unavailable on this date." : zonePreview(zone, new Date(noon));
  } catch { return "Selected-date time preview unavailable."; }
}
export function TimezoneChoice({ value, locked, onChange }: { value: string; locked: boolean; onChange: (zone: string) => void }) {
  const [query, setQuery] = useState("");
  // Server and initial client render are identical. Device settings are suggestions only.
  const [client, setClient] = useState<{ zones: string[]; suggestion: string; now: Date } | null>(null);
  useEffect(() => {
    let suggestion = "";
    try { suggestion = canonicalZone(Intl.DateTimeFormat().resolvedOptions().timeZone) ?? ""; } catch { /* unavailable */ }
    const update = () => setClient({ zones: zoneChoices(), suggestion, now: new Date() });
    update(); const timer = window.setInterval(update, 60_000); return () => window.clearInterval(timer);
  }, []);
  const zones = [...new Set([...(value ? [value] : []), ...(client?.zones ?? [])])]
    .filter(z => z === value || zoneLabel(z).toLowerCase().includes(query.toLowerCase()));
  return <fieldset className="space-y-3"><legend className="font-medium">Business timezone</legend>
    <label className="block">Filter by city or timezone<input type="search" className="mt-1 block w-full rounded-xl border p-3" value={query} disabled={locked || !client} onChange={e => setQuery(e.target.value)} /></label>
    <label className="block">Choose timezone<select className="mt-1 block w-full rounded-xl border bg-white p-3" value={value} disabled={locked || !client?.zones.length}
      onChange={e => { const zone = canonicalZone(e.target.value); if (zone) onChange(zone); }}>
      <option value="">Select a business timezone</option>{zones.map(z => <option key={z} value={z}>{zoneLabel(z)}</option>)}
    </select></label>
    {client && !client.zones.length && <p role="alert">This browser cannot validate timezones. Setup cannot continue safely.</p>}
    {client?.suggestion && <p className="text-sm">Browser setting: {zoneLabel(client.suggestion)}. This is not your business location. <button type="button" className="underline" disabled={locked} onClick={() => onChange(client.suggestion)}>Use browser timezone</button></p>}
    {value && client && <p className="text-sm" role="status">Local time now: {zonePreview(value, client.now)}. Offsets can change with daylight saving.</p>}
    {locked && <p className="text-sm">Cancel appointments and disconnect simulated busy time before changing timezone. Existing instants are never reinterpreted.</p>}
  </fieldset>;
}
