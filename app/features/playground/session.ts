import { availableSlots, dayClock } from "../booking/availability";
import { simulatedCalendar } from "./calendar";
import type { SimulatedCalendarState } from "./calendar";
import { addDays, todayInTimeZone } from "../demo/booking";
import type { DemoService, DemoPractitioner } from "../demo/booking";
import type { ReceptionAppointment } from "../booking/reception-experience";

export const SESSION_POLICY = { inactivityMs: 60 * 60_000, warningMs: 5 * 60_000 } as const;
export type Configuration = {
  business: { name: string; category: string; timezone: string };
  location: { id: string; name: string };
  services: (DemoService & { price: string; locationIds: string[] })[];
  staff: (DemoPractitioner & { locationIds: string[] })[];
  days: number[]; opens: number; closes: number;
  theme: { primary: string; logoUrl?: string };
};
export type SimulatedAppointment = ReceptionAppointment & { start: number; end: number; locationId: string };
export type SessionState = {
  phase: "setup" | "active"; step: number; view: "booking" | "reception" | "configure";
  config: Configuration; baseline: Configuration | null; appointments: SimulatedAppointment[];
  calendar: SimulatedCalendarState;
  lastActivity: number; epoch: number; configRevision: number; nextId: number; notice: string;
};

export function emptyConfiguration(): Configuration {
  return {
    business: { name: "", category: "", timezone: "" }, location: { id: "location-1", name: "" },
    services: [{ id: "service-1", name: "", description: "", durationMinutes: 30,
      bufferAfterMinutes: 0, price: "", eligibleStaffIds: [], locationIds: ["location-1"] }],
    staff: [{ id: "staff-1", name: "", role: "", initials: "", locationIds: ["location-1"] }],
    days: [1, 2, 3, 4, 5], opens: 9 * 60, closes: 17 * 60, theme: { primary: "#244b42" },
  };
}
const text = (s: unknown, max = 100): s is string => typeof s === "string" &&
  s.trim().length > 0 && s.length <= max && !/[<>\p{Cc}\p{Bidi_Control}]/u.test(s);
export function validTimezone(zone: string) {
  try { return !!zone && !!new Intl.DateTimeFormat("en", { timeZone: zone }).resolvedOptions().timeZone; }
  catch { return false; }
}
export function configurationErrors(c: Configuration, step?: number): string[] {
  const errors: { step: number; message: string }[] = [];
  const check = (s: number, valid: boolean, message: string) => { if (!valid) errors.push({ step: s, message }); };
  check(0, text(c.business.name) && text(c.location.name), "Name your business and location (up to 100 characters each).");
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
  check(2, c.staff.length >= 1 && c.staff.length <= 2 && c.staff.every(p => text(p.name) && p.locationIds.includes(c.location.id)),
    "Name one or two staff members at this location.");
  check(2, new Set(c.staff.map(p => p.id)).size === c.staff.length, "Staff identities must be unique.");
  check(3, c.days.length > 0 && c.days.every(d => Number.isInteger(d) && d >= 0 && d <= 6), "Select at least one operating day.");
  check(3, Number.isInteger(c.opens) && Number.isInteger(c.closes) && c.opens >= 0 && c.closes <= 1440 && c.opens < c.closes,
    "Closing time must follow opening time on the same day.");
  check(3, c.services.every(s => s.durationMinutes + s.bufferAfterMinutes <= c.closes - c.opens),
    "Every service and its buffer must fit inside operating hours.");
  check(4, /^#[0-9a-f]{6}$/i.test(c.theme.primary), "Choose a six-digit hexadecimal primary colour.");
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
    appointments: [], calendar: { connected: false, busy: null }, lastActivity: now, epoch,
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
      nextId: 1, notice: "Restored your original tutorial configuration." });
  }
  update(config: Configuration) {
    if (!this.touch()) return;
    if (this.state.appointments.length && config.business.timezone !== this.state.config.business.timezone) {
      this.emit({ ...this.state, notice: "Cancel appointments before changing timezone." }); return;
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
    this.emit({ ...this.state, phase: "active", baseline: structuredClone(this.state.config), view: "booking", notice: "Your playground is ready. Everything stays in this tab." });
    return [];
  }
  view(view: SessionState["view"]) { if (this.touch()) this.emit({ ...this.state, view }); }
  slots(date: string, serviceId: string, staffId: string) {
    const s = this.state, c = s.config;
    if (s.phase !== "active" || this.clock() - s.lastActivity >= this.policy.inactivityMs || configurationErrors(c).length) return [];
    const today = todayInTimeZone(new Date(this.clock()), c.business.timezone);
    if (date < today || date > addDays(today, 14)) return [];
    const service = c.services.find(x => x.id === serviceId);
    if (!service || !service.locationIds.includes(c.location.id)) return [];
    const weekday = new Date(`${date}T12:00:00Z`).getUTCDay();
    if (!c.days.includes(weekday)) return [];
    return availableSlots({ service, staffId, staffIds: c.staff.filter(p => p.locationIds.includes(c.location.id)).map(p => p.id),
      opens: c.opens, closes: c.closes, interval: 15, earliest: this.clock() + 120 * 60_000,
      instant: dayClock(date, c.business.timezone), occupied: [
        ...s.appointments.map(a => ({ staffId: a.staffId, start: a.start, end: a.end })),
        ...simulatedCalendar(s.calendar).busyIntervals(),
      ] });
  }
  book(date: string, serviceId: string, minute: number, staffId: string): string | null {
    if (!this.touch()) return "Session expired. Start again.";
    if (this.state.appointments.length >= 200) return "This playground allows 200 synthetic appointments. Cancel or reset to continue.";
    const slot = this.slots(date, serviceId, staffId).find(s => s.startMinute === minute);
    if (!slot) return "That time is no longer available. Please choose another slot.";
    const c = this.state.config, service = c.services.find(s => s.id === serviceId)!, person = c.staff.find(p => p.id === slot.staffId)!;
    const start = dayClock(date, c.business.timezone)(minute)!;
    const id = `synthetic-${this.state.nextId}`;
    this.emit({ ...this.state, nextId: this.state.nextId + 1, appointments: [...this.state.appointments, {
      id, date, startMinute: minute, durationMinutes: service.durationMinutes, bufferAfterMinutes: service.bufferAfterMinutes,
      staffId: slot.staffId, serviceId, locationId: c.location.id, customerLabel: `Synthetic visitor ${this.state.nextId}`,
      status: "scheduled", start, end: start + (service.durationMinutes + service.bufferAfterMinutes) * 60_000,
      serviceName: service.name, staffName: person.name,
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
