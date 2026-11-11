import { canOverrideBuffer, personColour } from "./personnel";
import { defaultHours, dayPeriods, validHours } from "./scheduling";
import type { WeeklyHours } from "./scheduling";
import { offlineLocalities } from "./localities";
import { availableSlots, dayClock } from "../booking/availability";
import { simulatedCalendar } from "./calendar";
import type { SimulatedCalendarState } from "./calendar";
import { addDays, todayInTimeZone } from "../demo/booking";
import type { DemoService, DemoPractitioner } from "../demo/booking";
import type { ReceptionAppointment } from "../booking/reception-experience";

export const SESSION_POLICY = { inactivityMs: 60 * 60_000, warningMs: 5 * 60_000 } as const;
export const WORKSPACE_ROLES = ["Owner", "Admin", "Reception", "Staff"] as const;
export type TeamPerson = { id: string; name: string; colour?: string; email?: string; roles: (typeof WORKSPACE_ROLES)[number][] };
export type Configuration = {
  business: { name: string; category: string; timezone: string; timezoneSource?: "locality" | "manual" };
  location: { id: string; name: string; address: string; localityId: string };
  // Local person/role metadata is not a User or Membership. Only the linked
  // staff subset accepts bookings; role selection never grants bookability.
  people: TeamPerson[];
  services: (DemoService & { price: string; locationIds: string[] })[];
  staff: (DemoPractitioner & { locationIds: string[] })[];
  hours: WeeklyHours; startInterval: number;
  theme: { primary: string; accent: string; logoUrl?: string };
};
export type SimulatedAppointment = ReceptionAppointment & { start: number; end: number; locationId: string; staffColour?: string; bufferOverride?: { actorId: string; appointmentIds: string[] } };
export type SessionState = {
  phase: "setup" | "active"; step: number; view: "booking" | "reception" | "configure";
  config: Configuration; baseline: Configuration | null; appointments: SimulatedAppointment[];
  calendar: SimulatedCalendarState;
  diaryDate: string;
  lastActivity: number; epoch: number; configRevision: number; nextId: number; notice: string;
};

export function emptyConfiguration(): Configuration {
  return {
    business: { name: "", category: "", timezone: "" }, location: { id: "location-1", name: "", address: "", localityId: "" },
    people: [{ id: "staff-1", name: "", roles: [] }],
    services: [{ id: "service-1", name: "", description: "", durationMinutes: 30,
      bufferAfterMinutes: 0, price: "", eligibleStaffIds: [], locationIds: ["location-1"] }],
    staff: [{ id: "staff-1", name: "", role: "", initials: "", locationIds: ["location-1"] }],
    hours: defaultHours(), startInterval: 15, theme: { primary: "#244b42", accent: "#d8e9d9" },
  };
}
const text = (s: unknown, max = 100): s is string => typeof s === "string" &&
  s.trim().length > 0 && s.length <= max && !/[<>\p{Cc}\p{Bidi_Control}]/u.test(s);
export function validTimezone(zone: string) {
  try { return !!zone && !!new Intl.DateTimeFormat("en", { timeZone: zone }).resolvedOptions().timeZone; }
  catch { return false; }
}
/** Keep one identity while independently editing simulated roles and booking settings. */
export function editPerson(c: Configuration, person: TeamPerson, bookable: boolean): Configuration {
  const existing = c.staff.find(p => p.id === person.id);
  return { ...c, people: c.people.map(p => p.id === person.id ? { ...person, colour: personColour(person) } : p),
    staff: [...c.staff.filter(p => p.id !== person.id), ...(bookable ? [{
      ...(existing ?? { id: person.id, role: "", locationIds: [c.location.id] }),
      name: person.name, initials: person.name.slice(0, 2).toUpperCase(),
    }] : [])].sort((a, b) => c.people.findIndex(p => p.id === a.id) - c.people.findIndex(p => p.id === b.id)),
    services: c.services.map(s => ({ ...s, eligibleStaffIds: bookable ? s.eligibleStaffIds : s.eligibleStaffIds.filter(id => id !== person.id) })),
  };
}
export function configurationErrors(c: Configuration, step?: number): string[] {
  const errors: { step: number; message: string }[] = [];
  const check = (s: number, valid: boolean, message: string) => { if (!valid) errors.push({ step: s, message }); };
  check(0, text(c.business.name), "Name your business (up to 100 characters).");
  check(0, c.location.name === "" || text(c.location.name), "Keep the optional branch / venue name under 100 characters.");
  check(0, c.location.address === "" || text(c.location.address, 250), "Keep the optional address under 250 characters.");
  check(0, c.location.localityId === "" || !!offlineLocalities.resolve(c.location.localityId), "Choose a known locality or use manual timezone selection.");
  check(0, validTimezone(c.business.timezone), "Choose a valid business timezone.");
  check(0, c.business.category === "" || text(c.business.category, 60), "Keep the optional category under 60 characters.");
  check(1, c.services.length >= 1 && c.services.length <= 10, "Add between one and ten services.");
  check(1, new Set(c.services.map(s => s.id)).size === c.services.length, "Service identities must be unique.");
  for (const s of c.services) {
    check(1, text(s.name), "Give every service a name.");
    check(1, Number.isInteger(s.durationMinutes) && s.durationMinutes >= 5 && s.durationMinutes <= 480,
      "Service durations must be 5–480 whole minutes.");
    check(1, Number.isInteger(s.bufferAfterMinutes) && s.bufferAfterMinutes >= 0 && s.bufferAfterMinutes <= 120,
      "Buffers must be 0–120 whole minutes.");
    check(1, s.price === "" || /^\d{1,6}(\.\d{1,2})?$/.test(s.price), "Prices must be non-negative amounts with at most two decimal places.");
    check(2, s.eligibleStaffIds.length > 0 && s.eligibleStaffIds.every(id => c.staff.some(p => p.id === id)),
      "Assign at least one eligible person to every service.");
    check(2, s.locationIds.includes(c.location.id), "Services must belong to this location.");
  }
  check(2, c.people.length >= 1 && c.people.length <= 3 && c.people.every(p => text(p.name)),
    "Name one to three people (a Playground limit only).");
  check(2, new Set(c.people.map(p => p.id)).size === c.people.length && c.people.every(p => p.roles.length > 0 &&
    new Set(p.roles).size === p.roles.length && p.roles.every(role => WORKSPACE_ROLES.includes(role))),
    "Choose at least one simulated workspace role per person; person identities must be unique.");
  check(2, c.people.every(p => p.colour === undefined || /^#[0-9a-f]{6}$/i.test(p.colour)), "Choose a six-digit colour for each person.");
  check(2, c.people.every(p => !p.email || (p.email.length <= 254 && /^[^\s<>@]+@[^\s<>@]+\.[^\s<>@]+$/.test(p.email) && !/[\p{Cc}\p{Bidi_Control}]/u.test(p.email))), "Use a valid fictional email or leave it blank for an example.test address.");
  check(2, c.staff.length >= 1 && c.staff.every(p => text(p.name) && p.locationIds.includes(c.location.id) &&
    c.people.some(person => person.id === p.id && person.name === p.name)), "Enable bookings for at least one named person at this location.");
  check(2, new Set(c.staff.map(p => p.id)).size === c.staff.length, "Staff identities must be unique.");
  check(3, validHours(c.hours), "Use seven weekday schedules with non-overlapping whole-minute periods between 00:00 and 24:00. Overnight periods are unsupported.");
  check(3, Number.isInteger(c.startInterval) && c.startInterval > 0 && c.startInterval <= 1440, "Booking-start interval must be 1-1440 whole minutes.");
  check(4, /^#[0-9a-f]{6}$/i.test(c.theme.primary), "Choose a six-digit hexadecimal primary colour.");
  check(4, /^#[0-9a-f]{6}$/i.test(c.theme.accent), "Choose a six-digit hexadecimal accent colour.");
  return [...new Set(errors.filter(e => step === undefined || e.step === step).map(e => e.message))];
}

function immutable<T>(value: T): T {
  if (value && typeof value === "object") {
    for (const child of Object.values(value)) immutable(child);
    Object.freeze(value);
  }
  return value;
}
function initial(now: number, epoch = 0, notice = ""): SessionState {
  return immutable({ phase: "setup", step: 0, view: "booking", config: emptyConfiguration(), baseline: null,
    appointments: [], calendar: { connected: false, busy: null }, diaryDate: "", lastActivity: now, epoch,
    configRevision: 0, nextId: 1, notice });
}

/** Explicit adapter boundary. Production is deliberately not an implementation of
 * this local store: its transport must authorize and commit on the server. */
export interface BookingAdapter {
  readonly kind: "playground" | "production";
  slots(date: string, serviceId: string, staffId: string): { startMinute: number; staffId: string }[];
  book(date: string, serviceId: string, minute: number, staffId: string): string | null;
  cancel(id: string): void;
}
export class PlaygroundSession implements BookingAdapter {
  readonly kind = "playground" as const;
  private state: SessionState;
  private listeners = new Set<() => void>();
  private urls = new Set<string>();
  constructor(private clock = Date.now, private revoke = (url: string) => URL.revokeObjectURL(url),
    readonly policy: { inactivityMs: number; warningMs: number } = SESSION_POLICY) {
    this.state = initial(clock());
  }
  getSnapshot = () => this.state;
  subscribe = (listener: () => void) => { this.listeners.add(listener); return () => { this.listeners.delete(listener); }; };
  private emit(state: SessionState) {
    this.state = immutable(state);
    const retained = new Set([state.config.theme.logoUrl, state.baseline?.theme.logoUrl]);
    for (const url of this.urls) if (!retained.has(url)) { this.revoke(url); this.urls.delete(url); }
    this.listeners.forEach(fn => fn());
  }
  checkExpiry() {
    if (this.clock() - this.state.lastActivity >= this.policy.inactivityMs) {
      this.hardReset("Your inactive playground expired. Start again with a fresh business."); return true;
    }
    return false;
  }
  touch() {
    if (this.checkExpiry()) return false;
    this.emit({ ...this.state, lastActivity: this.clock() }); return true;
  }
  hardReset(notice = "Your temporary session was cleared.") {
    this.emit(initial(this.clock(), this.state.epoch + 1, notice));
  }
  softReset() {
    if (!this.touch() || !this.state.baseline) return;
    this.emit({ ...this.state, config: structuredClone(this.state.baseline), appointments: [],
      calendar: { connected: false, busy: null }, view: "booking", epoch: this.state.epoch + 1, configRevision: this.state.configRevision + 1,
      diaryDate: addDays(todayInTimeZone(new Date(this.clock()), this.state.baseline.business.timezone), 1),
      nextId: 1, notice: "Restored your original tutorial configuration." });
  }
  update(config: Configuration) {
    if (!this.touch()) return;
    if ((this.state.appointments.length || this.state.calendar.busy) && config.business.timezone !== this.state.config.business.timezone) {
      this.emit({ ...this.state, notice: "Cancel appointments and disconnect simulated busy time before changing timezone. Stored instants remain unchanged." }); return;
    }
    // Only this session's validated image pipeline may supply object URLs.
    if (config.theme.logoUrl && !this.urls.has(config.theme.logoUrl)) return;
    this.emit({ ...this.state, config: structuredClone(config), configRevision: this.state.configRevision + 1 });
  }
  setLogo(url: string, epoch: number) {
    if (this.checkExpiry() || epoch !== this.state.epoch || !this.touch()) { this.revoke(url); return; }
    this.urls.add(url);
    this.emit({ ...this.state, config: { ...this.state.config, theme: { ...this.state.config.theme, logoUrl: url } },
      configRevision: this.state.configRevision + 1 });
  }
  step(step: number) {
    if (!this.touch()) return;
    if (step < 0 || step > 4 || (step > this.state.step && configurationErrors(this.state.config, this.state.step).length)) return;
    this.emit({ ...this.state, step });
  }
  complete(): string[] {
    if (!this.touch()) return ["Session expired. Start again."];
    if (this.state.phase !== "setup") return ["The original tutorial baseline is already captured."];
    const errors = configurationErrors(this.state.config);
    if (errors.length) return errors;
    this.emit({ ...this.state, phase: "active", baseline: structuredClone(this.state.config), view: "booking",
      diaryDate: addDays(todayInTimeZone(new Date(this.clock()), this.state.config.business.timezone), 1), notice: "Your playground is ready. Everything stays in this tab." });
    return [];
  }
  view(view: SessionState["view"]) { if (this.touch()) this.emit({ ...this.state, view }); }
  selectDiaryDate(date: string) {
    if (/^\d{4}-\d{2}-\d{2}$/.test(date) && Number.isFinite(Date.parse(date)) &&
      new Date(date).toISOString().slice(0, 10) === date && this.touch()) this.emit({ ...this.state, diaryDate: date });
  }
  slots(date: string, serviceId: string, staffId: string) { return this.calculateSlots(date, serviceId, staffId); }
  receptionSlots(date: string, serviceId: string, staffId: string, actorId: string) {
    return canOverrideBuffer(this.state.config, actorId, staffId) ? this.calculateSlots(date, serviceId, staffId, actorId) : this.slots(date, serviceId, staffId);
  }
  private calculateSlots(date: string, serviceId: string, staffId: string, actorId?: string) {
    const s = this.state, c = s.config;
    if (s.phase !== "active" || this.clock() - s.lastActivity >= this.policy.inactivityMs || configurationErrors(c).length) return [];
    const today = todayInTimeZone(new Date(this.clock()), c.business.timezone);
    if (date < today || date > addDays(today, 14)) return [];
    const service = c.services.find(x => x.id === serviceId);
    if (!service || !service.locationIds.includes(c.location.id)) return [];
    return dayPeriods(c.hours, date).flatMap(period => availableSlots({ service, staffId, staffIds: c.staff.filter(p => p.locationIds.includes(c.location.id)).map(p => p.id),
      opens: period.opens, closes: period.closes, interval: c.startInterval, earliest: this.clock() + 120 * 60_000,
      instant: dayClock(date, c.business.timezone), occupied: [
        ...s.appointments.map(a => ({ staffId: a.staffId, start: a.start, end: actorId && canOverrideBuffer(c, actorId, a.staffId) ? a.start + a.durationMinutes * 60_000 : a.end })),
        ...simulatedCalendar(s.calendar).busyIntervals(),
      ] }));
  }
  book(date: string, serviceId: string, minute: number, staffId: string): string | null {
    return this.commitBooking(date, serviceId, minute, staffId);
  }
  bufferTouches(date: string, serviceId: string, minute: number, staffId: string): string[] {
    const c = this.state.config, service = c.services.find(s => s.id === serviceId);
    if (!service || !validTimezone(c.business.timezone)) return [];
    const start = dayClock(date, c.business.timezone)(minute); if (start === null) return [];
    const end = start + (service.durationMinutes + service.bufferAfterMinutes) * 60_000;
    return this.state.appointments.filter(a => a.staffId === staffId && a.bufferAfterMinutes > 0 && start < a.end && end > a.start + a.durationMinutes * 60_000).map(a => a.id).sort();
  }
  receptionBook(date: string, serviceId: string, minute: number, staffId: string, actorId: string, confirmedBufferIds: string[]): string | null {
    if (!canOverrideBuffer(this.state.config, actorId, staffId)) return "This simulated operator cannot override this person's buffers.";
    const current = this.bufferTouches(date, serviceId, minute, staffId);
    if (!current.length || JSON.stringify(current) !== JSON.stringify([...new Set(confirmedBufferIds)].sort())) return "Buffers changed or confirmation is missing. Review the warning again.";
    return this.commitBooking(date, serviceId, minute, staffId, { actorId, appointmentIds: current });
  }
  private commitBooking(date: string, serviceId: string, minute: number, staffId: string, override?: { actorId: string; appointmentIds: string[] }): string | null {
    if (!this.touch()) return "Session expired. Start again.";
    if (this.state.appointments.length >= 200) return "This playground allows 200 synthetic appointments. Cancel or reset to continue.";
    const slot = (override ? this.receptionSlots(date, serviceId, staffId, override.actorId) : this.slots(date, serviceId, staffId)).find(s => s.startMinute === minute);
    if (!slot) return "That time is no longer available. Please choose another slot.";
    const c = this.state.config, service = c.services.find(s => s.id === serviceId)!, person = c.staff.find(p => p.id === slot.staffId)!;
    const start = dayClock(date, c.business.timezone)(minute)!;
    const id = `synthetic-${this.state.nextId}`;
    this.emit({ ...this.state, diaryDate: date, nextId: this.state.nextId + 1, appointments: [...this.state.appointments, {
      id, date, startMinute: minute, durationMinutes: service.durationMinutes, bufferAfterMinutes: service.bufferAfterMinutes,
      staffId: slot.staffId, serviceId, locationId: c.location.id, customerLabel: `Synthetic visitor ${this.state.nextId}`,
      status: "scheduled", start, end: start + (service.durationMinutes + service.bufferAfterMinutes) * 60_000,
      serviceName: service.name, staffName: person.name, staffColour: personColour(c.people.find(p => p.id === person.id)!),
      ...(override ? { bufferOverride: override } : {}),
    }] });
    return null;
  }
  cancel(id: string) { if (this.touch()) this.emit({ ...this.state, appointments: this.state.appointments.filter(a => a.id !== id) }); }
  connectBusy(date: string, staffId: string, minute: number, duration: number): string | null {
    if (!this.touch()) return "Session expired.";
    const c = this.state.config;
    if (!validTimezone(c.business.timezone) || !c.staff.some(p => p.id === staffId) ||
      !Number.isInteger(minute) || minute < 0 || !Number.isInteger(duration) || duration < 15 || minute + duration > 1440) return "Choose a staff member and valid same-day busy period.";
    const instant = dayClock(date, c.business.timezone), start = instant(minute), end = instant(minute + duration);
    if (start === null || end === null) return "This local time is invalid or ambiguous. Choose another time.";
    this.emit({ ...this.state, calendar: { connected: true, busy: { staffId, start, end } } }); return null;
  }
  disconnect() { if (this.touch()) this.emit({ ...this.state, calendar: { connected: false, busy: null } }); }
  dispose() { for (const url of this.urls) this.revoke(url); this.urls.clear(); this.listeners.clear(); this.state = initial(this.clock(), this.state.epoch + 1); }
}
