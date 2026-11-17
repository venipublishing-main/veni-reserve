import { availableSlots } from "../booking/availability";

/**
 * Entirely synthetic public booking fixture and deterministic demo availability.
 *
 * This module never connects to Supabase, stores personal data, or creates an
 * appointment. Production availability/commit must be server-authoritative,
 * timezone-aware and concurrency-safe, as specified in the product ledger.
 */
export type DemoService = {
  id: string;
  name: string;
  description: string;
  durationMinutes: number;
  bufferAfterMinutes: number;
  eligibleStaffIds: readonly string[];
  price?: string;
};
export type DemoPractitioner = {
  id: string;
  name: string;
  role: string;
  initials: string;
};
export type DemoAppointment = {
  id: string;
  date: string;
  startMinute: number;
  durationMinutes: number;
  bufferAfterMinutes: number;
  staffId: string;
  serviceId: string;
  customerLabel: string;
  status: "scheduled" | "checked_in";
};
export type DemoSlot = { startMinute: number; staffId: string };
export type OperatingWindow = { weekday: number; opens: number; closes: number };
export type DemoAvailabilityRules = {
  utcOffsetMinutes: number;
  minimumNoticeMinutes: number;
  slotIntervalMinutes: number;
  operatingWindows: readonly OperatingWindow[];
};

export const DEMO_BUSINESS = {
  slug: "vvb",
  name: "van Vollenhoven Bruwer",
  descriptor: "Optometrists",
  city: "Pretoria",
  timezone: "Africa/Johannesburg",
  note: "Illustrative services, staff and opening hours — not live practice information.",
} as const;

export const DEMO_PRACTITIONERS: readonly DemoPractitioner[] = [
  { id: "p1", name: "Demo Practitioner A", role: "Optometry team", initials: "A" },
  { id: "p2", name: "Demo Practitioner B", role: "Optometry team", initials: "B" },
  { id: "p3", name: "Demo Practitioner C", role: "Optometry team", initials: "C" },
];

export const DEMO_SERVICES: readonly DemoService[] = [
  {
    id: "examination",
    name: "Eye examination",
    description: "A general vision and eye-health assessment.",
    durationMinutes: 45,
    bufferAfterMinutes: 15,
    eligibleStaffIds: ["p1", "p2", "p3"],
  },
  {
    id: "contacts",
    name: "Contact lens consultation",
    description: "A fitting or follow-up conversation about contact lenses.",
    durationMinutes: 30,
    bufferAfterMinutes: 15,
    eligibleStaffIds: ["p1", "p2", "p3"],
  },
  {
    id: "children",
    name: "Children's vision assessment",
    description: "A vision consultation designed for younger visitors.",
    durationMinutes: 45,
    bufferAfterMinutes: 15,
    eligibleStaffIds: ["p2", "p3"],
  },
];

export const DEMO_RULES: DemoAvailabilityRules = {
  utcOffsetMinutes: 120, // fixture-specific; NOT a production timezone engine
  minimumNoticeMinutes: 120,
  slotIntervalMinutes: 30,
  operatingWindows: [
    { weekday: 1, opens: 8 * 60 + 30, closes: 17 * 60 },
    { weekday: 2, opens: 8 * 60 + 30, closes: 17 * 60 },
    { weekday: 3, opens: 8 * 60 + 30, closes: 17 * 60 },
    { weekday: 4, opens: 8 * 60 + 30, closes: 17 * 60 },
    { weekday: 5, opens: 8 * 60 + 30, closes: 17 * 60 },
    { weekday: 6, opens: 9 * 60, closes: 13 * 60 },
  ],
};

function dateParts(iso: string): [number, number, number] | null {
  if (!/^\d{4}-\d{2}-\d{2}$/.test(iso)) return null;
  const [year, month, day] = iso.split("-").map(Number);
  const parsed = new Date(Date.UTC(year, month - 1, day, 12));
  return parsed.getUTCFullYear() === year &&
    parsed.getUTCMonth() === month - 1 && parsed.getUTCDate() === day
    ? [year, month, day]
    : null;
}

export function addDays(iso: string, days: number): string {
  const parts = dateParts(iso);
  if (!parts) throw new Error("Invalid ISO calendar date");
  const [y, m, d] = parts;
  return new Date(Date.UTC(y, m - 1, d + days, 12)).toISOString().slice(0, 10);
}

export function todayInTimeZone(now: Date, timezone: string): string {
  const parts = new Intl.DateTimeFormat("en-GB", {
    year: "numeric", month: "2-digit", day: "2-digit", timeZone: timezone,
  }).formatToParts(now);
  const value = (type: string) => parts.find((part) => part.type === type)?.value;
  return `${value("year")}-${value("month")}-${value("day")}`;
}

export function formatDemoDate(iso: string): string {
  return new Intl.DateTimeFormat("en-ZA", {
    weekday: "short", day: "numeric", month: "short", timeZone: "UTC",
  }).format(new Date(`${iso}T12:00:00Z`));
}

export function minutesLabel(minute: number): string {
  return `${String(Math.floor(minute / 60)).padStart(2, "0")}:${String(minute % 60).padStart(2, "0")}`;
}

function localMinutesAsUtc(date: string, minute: number, offset: number): number {
  const parts = dateParts(date);
  if (!parts) return NaN;
  const [year, month, day] = parts;
  return Date.UTC(year, month - 1, day, 0, minute) - offset * 60_000;
}

/** Synthetic busy intervals shared by the public preview and reception preview. */
export function syntheticAppointments(date: string): DemoAppointment[] {
  const parts = dateParts(date);
  if (!parts) return [];
  const weekday = new Date(Date.UTC(parts[0], parts[1] - 1, parts[2], 12)).getUTCDay();
  if (weekday === 0) return [];
  return [
    { id: `${date}-a`, date, startMinute: 9 * 60, durationMinutes: 45, bufferAfterMinutes: 15,
      staffId: "p1", serviceId: "examination", customerLabel: "Sample client 01", status: "scheduled" },
    { id: `${date}-b`, date, startMinute: 10 * 60 + 30, durationMinutes: 30, bufferAfterMinutes: 15,
      staffId: "p2", serviceId: "contacts", customerLabel: "Sample client 02", status: "checked_in" },
    { id: `${date}-c`, date, startMinute: 11 * 60 + 30, durationMinutes: 45, bufferAfterMinutes: 15,
      staffId: "p3", serviceId: "children", customerLabel: "Sample client 03", status: "scheduled" },
    ...(weekday === 6 ? [] : [
      { id: `${date}-d`, date, startMinute: 14 * 60, durationMinutes: 45, bufferAfterMinutes: 15,
        staffId: "p1", serviceId: "examination", customerLabel: "Sample client 04",
        status: "scheduled" as const },
    ]),
  ];
}

/** Preview only: never use as authoritative availability in a real booking route. */
export function demoAvailableSlots(input: {
  date: string;
  service: DemoService;
  staffId: string | "any";
  now: Date;
  people?: readonly DemoPractitioner[];
  appointments?: readonly DemoAppointment[];
  rules?: DemoAvailabilityRules;
}): DemoSlot[] {
  const { date, service, staffId, now } = input;
  const parts = dateParts(date);
  if (!parts || Number.isNaN(now.getTime())) return [];
  const rules = input.rules ?? DEMO_RULES;
  if (rules.slotIntervalMinutes <= 0 || service.durationMinutes <= 0) return [];
  const weekday = new Date(Date.UTC(parts[0], parts[1] - 1, parts[2], 12)).getUTCDay();
  const window = rules.operatingWindows.find((entry) => entry.weekday === weekday);
  if (!window) return [];
  const practitioners = (input.people ?? DEMO_PRACTITIONERS).filter(
    (person) => service.eligibleStaffIds.includes(person.id) &&
      (staffId === "any" || person.id === staffId),
  );
  if (practitioners.length === 0) return [];
  const existing = input.appointments ?? syntheticAppointments(date);
  return availableSlots({
    service, staffId, staffIds: practitioners.map(person => person.id),
    opens: window.opens, closes: window.closes, interval: rules.slotIntervalMinutes,
    earliest: now.getTime() + rules.minimumNoticeMinutes * 60_000,
    instant: minute => localMinutesAsUtc(date, minute, rules.utcOffsetMinutes),
    occupied: existing.map(appointment => ({
      staffId: appointment.staffId,
      start: localMinutesAsUtc(appointment.date, appointment.startMinute, rules.utcOffsetMinutes),
      end: localMinutesAsUtc(appointment.date, appointment.startMinute + appointment.durationMinutes + appointment.bufferAfterMinutes, rules.utcOffsetMinutes),
    })),
  });
}
