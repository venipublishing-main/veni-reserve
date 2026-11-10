import { describe, expect, it, vi } from "vitest";
import { createElement } from "react";
import { renderToStaticMarkup } from "react-dom/server";
import { MemoryRouter } from "react-router";
import { PlaygroundSession, configurationErrors, emptyConfiguration, SESSION_POLICY } from "../app/features/playground/session";
import { BookingExperience } from "../app/features/booking/booking-experience";
import { ReceptionExperience } from "../app/features/booking/reception-experience";
import { ConfigurationEditor } from "../app/features/playground/setup";
import { dayClock } from "../app/features/booking/availability";
import { bookingTheme } from "../app/features/booking/theme";
import { productionBookingAdapter } from "../app/features/playground/production-adapter.server";
import { localLogo } from "../app/features/playground/logo";
import Playground from "../app/routes/playground";

const now = Date.parse("2026-11-10T06:00:00Z");
const date = "2026-11-11";
function setup() {
  const c = emptyConfiguration();
  c.business = { name: "Copper Kite Workshop", category: "Creative classes", timezone: "Africa/Johannesburg" };
  c.location.name = "Garden studio";
  c.services[0] = { ...c.services[0], name: "Clay introduction", durationMinutes: 30, bufferAfterMinutes: 15, eligibleStaffIds: ["staff-1"], price: "150.00" };
  c.staff[0].name = "Fictional Maker";
  c.people[0] = { id: "staff-1", name: "Fictional Maker", roles: ["Owner"] };
  return c;
}
function active(clock = () => now, revoke = vi.fn()) {
  const session = new PlaygroundSession(clock, revoke);
  session.update(setup()); expect(session.complete()).toEqual([]); return session;
}
const markup = (element: ReturnType<typeof createElement>) => renderToStaticMarkup(createElement(MemoryRouter, null, element));

describe("playground configuration and shared product screens", () => {
  it("starts with no business, staff or service identity and does not restore a prior instance", () => {
    const previous = active(); previous.book(date, "service-1", 540, "staff-1");
    const fresh = new PlaygroundSession(() => now).getSnapshot();
    expect(fresh.config.business.name).toBe(""); expect(fresh.config.staff[0].name).toBe("");
    expect(fresh.config.services[0].name).toBe(""); expect(fresh.baseline).toBeNull(); expect(fresh.appointments).toEqual([]);
    const html = markup(createElement(Playground));
    expect(html).toContain("Build your own booking business"); expect(html).not.toContain("van Vollenhoven");
    expect(html).not.toContain("Eye examination");
  });
  it("renders the tutorial inputs in the real booking and reception components", () => {
    const session = active(), c = session.getSnapshot().config;
    const booking = markup(createElement(BookingExperience, {
      today: date, now: new Date(now).toISOString(), services: c.services, people: c.staff,
      business: { ...c.business, descriptor: c.business.category, location: c.location.name, note: "Temporary", primary: "#663399" },
      slotsFor: (d, s, p) => session.slots(d, s, p), onBook: (d, s, slot) => session.book(d, s, slot.startMinute, slot.staffId),
    }));
    expect(booking).toContain("Copper Kite Workshop"); expect(booking).toContain("Clay introduction"); expect(booking).toContain("Garden studio");
    expect(booking).toContain("150.00"); expect(booking).toContain("#663399");
    expect(booking).not.toContain("Optometrists"); expect(booking).not.toContain("Pretoria");
    session.book(date, "service-1", 540, "staff-1");
    const reception = markup(createElement(ReceptionExperience, { today: date, business: { name: c.business.name, descriptor: c.location.name },
      people: c.staff, services: c.services, appointmentsFor: d => session.getSnapshot().appointments.filter(a => a.date === d), onCancel: id => session.cancel(id) }));
    for (const value of ["Copper Kite Workshop", "Clay introduction", "Fictional Maker", "Synthetic visitor 1", "Cancel"]) expect(reception).toContain(value);
    expect(reception).not.toContain("Sample client"); expect(reception).not.toContain("Pretoria");
  });
  it("updates actual rendered configuration immediately without mutating its baseline", () => {
    const session = active(), c = structuredClone(session.getSnapshot().config);
    c.business.name = "New experiment"; c.theme.primary = "#cc8844"; session.update(c);
    const html = markup(createElement(ConfigurationEditor, { config: session.getSnapshot().config, step: 0, update: x => session.update(x), upload: async () => {} }));
    expect(html).toContain("New experiment"); expect(session.getSnapshot().baseline?.business.name).toBe("Copper Kite Workshop");
  });
  it("validates each tutorial stage and requires explicit eligibility", () => {
    const session = new PlaygroundSession(() => now); session.step(1); expect(session.getSnapshot().step).toBe(0);
    expect(session.complete().length).toBeGreaterThan(0);
    const c = setup(); c.services[0].eligibleStaffIds = []; expect(configurationErrors(c, 2).length).toBeGreaterThan(0);
    c.services[0].eligibleStaffIds = ["unknown"]; expect(configurationErrors(c, 2).length).toBeGreaterThan(0);
  });
  it.each(["javascript:alert(1)", "#fff; background:url(https://example.invalid)", "red"])("rejects unsafe theme input %s", value => {
    const c = setup(); c.theme.primary = value; expect(configurationErrors(c, 4).length).toBeGreaterThan(0);
    expect(JSON.stringify(bookingTheme(value))).not.toContain(value);
  });
  it("keeps text readable on light primary backgrounds", () => {
    expect(bookingTheme("#ffffff")).toMatchObject({ "--booking-on-primary": "#000000", "--booking-ink": "#244b42" });
  });
  it("rejects invalid durations, hours, names, prices and zones", () => {
    const c = setup(); c.services[0].durationMinutes = NaN; c.services[0].price = "-10";
    c.business.name = "<script>"; c.business.timezone = "Invented/Zone"; c.opens = c.closes;
    expect(configurationErrors(c).length).toBeGreaterThanOrEqual(5);
  });
  it("preserves VVB identities and read-only defaults in the shared components", () => {
    const html = markup(createElement(BookingExperience, { today: date, now: new Date(now).toISOString() }));
    expect(html).toContain("van Vollenhoven Bruwer"); expect(html).toContain("Optometrists"); expect(html).toContain("Pretoria"); expect(html).toContain("Eye examination");
    const workspace = markup(createElement(ReceptionExperience, { today: date }));
    expect(workspace).toContain("Sample client 01"); expect(workspace).not.toContain(">Cancel");
  });
});

describe("shared scheduling and simulated mutations", () => {
  it("protects the proposed appointment's buffer before a later appointment", () => {
    const s = active(); s.book(date, "service-1", 630, "staff-1");
    const starts = s.slots(date, "service-1", "staff-1").map(slot => slot.startMinute);
    expect(starts).toContain(585); // 09:45 + 30 service + 15 buffer ends exactly at 10:30.
    expect(starts).not.toContain(600); // 10:00 service ends 10:30 but its buffer overlaps.
    expect(starts).toContain(675); // Existing appointment + buffer ends at 11:15.
  });
  it("books once, protects existing buffers and restores slots on cancellation", () => {
    const s = active(); expect(s.slots(date, "service-1", "staff-1").some(x => x.startMinute === 570)).toBe(true);
    expect(s.book(date, "service-1", 540, "staff-1")).toBeNull();
    expect(s.book(date, "service-1", 540, "staff-1")).toContain("no longer available");
    expect(s.book(date, "service-1", 570, "staff-1")).toContain("no longer available");
    expect(s.slots(date, "service-1", "staff-1").some(x => x.startMinute === 585)).toBe(true);
    s.cancel(s.getSnapshot().appointments[0].id);
    expect(s.slots(date, "service-1", "staff-1").some(x => x.startMinute === 570)).toBe(true);
    expect(s.getSnapshot().appointments).toHaveLength(0);
  });
  it("enforces service/staff/location eligibility without fallback to VVB fixtures", () => {
    const s = active(), c = structuredClone(s.getSnapshot().config);
    c.staff.push({ id: "staff-2", name: "Other person", initials: "O", role: "", locationIds: [c.location.id] }); c.people.push({ id: "staff-2", name: "Other person", roles: ["Staff"] }); s.update(c);
    expect(s.slots(date, "service-1", "staff-2")).toEqual([]); expect(s.slots(date, "unknown", "any")).toEqual([]);
    expect(s.slots(date, "service-1", "any").every(slot => slot.staffId === "staff-1")).toBe(true);
    c.services[0].locationIds = ["another-location"]; s.update(c); expect(s.slots(date, "service-1", "any")).toEqual([]);
  });
  it("simulates a busy source and disconnects without touching existing appointments", () => {
    const s = active(); s.book(date, "service-1", 540, "staff-1");
    expect(s.connectBusy(date, "staff-1", 600, 60)).toBeNull();
    expect(s.slots(date, "service-1", "staff-1").some(x => x.startMinute === 600)).toBe(false);
    expect(s.slots(date, "service-1", "staff-1").some(x => x.startMinute === 660)).toBe(true);
    s.disconnect(); expect(s.getSnapshot().calendar).toEqual({ connected: false, busy: null });
    expect(s.slots(date, "service-1", "staff-1").some(x => x.startMinute === 600)).toBe(true);
    expect(s.getSnapshot().appointments).toHaveLength(1);
  });
  it("branding changes cannot alter availability", () => {
    const s = active(), before = s.slots(date, "service-1", "any");
    const c = structuredClone(s.getSnapshot().config); c.theme.primary = "#ffeeaa"; s.update(c);
    expect(s.slots(date, "service-1", "any")).toEqual(before);
  });
  it("enforces notice, horizon and closed days", () => {
    const s = active(); expect(s.slots("2026-11-10", "service-1", "any").every(slot => slot.startMinute >= 600)).toBe(true);
    expect(s.slots("2026-11-15", "service-1", "any")).toEqual([]);
    expect(s.slots("2026-12-01", "service-1", "any")).toEqual([]);
  });
  it("preserves appointment-time names and duration after configuration experiments", () => {
    const s = active(); s.book(date, "service-1", 540, "staff-1"); const before = s.getSnapshot().appointments[0];
    const c = structuredClone(s.getSnapshot().config); c.services[0].name = "Renamed"; c.services[0].durationMinutes = 60; s.update(c);
    expect(s.getSnapshot().appointments[0]).toEqual(before);
  });
  it("resolves non-integer timezones and fails closed at DST gaps and folds", () => {
    expect(dayClock(date, "Asia/Kolkata")(540)).toBe(Date.parse("2026-11-11T03:30:00Z"));
    expect(dayClock("2026-03-08", "America/New_York")(150)).toBeNull();
    expect(dayClock("2026-11-01", "America/New_York")(90)).toBeNull();
    expect(dayClock("2026-02-30", "UTC")(540)).toBeNull();
  });
  it("keeps the production adapter disabled", () => {
    expect(() => productionBookingAdapter.slots(date, "service-1", "staff-1")).toThrow("not implemented");
    expect(() => productionBookingAdapter.book(date, "service-1", 540, "staff-1")).toThrow("not implemented");
    expect(() => productionBookingAdapter.cancel("id")).toThrow("not implemented");
  });
});

describe("baseline, reset and inactivity lifecycle", () => {
  it("captures a deeply immutable baseline and refuses to replace it", () => {
    const s = active(); const baseline = s.getSnapshot().baseline!;
    expect(Object.isFrozen(baseline.services[0])).toBe(true);
    expect(() => { baseline.business.name = "Mutation"; }).toThrow();
    expect(s.complete()).toContain("The original tutorial baseline is already captured.");
  });
  it("soft resets exact tutorial values and retains the original logo only", () => {
    const revoke = vi.fn(), s = new PlaygroundSession(() => now, revoke);
    s.update(setup()); s.setLogo("blob:original", 0); s.complete(); const baseline = structuredClone(s.getSnapshot().baseline);
    s.book(date, "service-1", 540, "staff-1"); s.connectBusy(date, "staff-1", 600, 60);
    const c = structuredClone(s.getSnapshot().config); c.business.name = "Experiment"; s.update(c); s.setLogo("blob:experiment", 0);
    s.softReset(); expect(s.getSnapshot().config).toEqual(baseline); expect(s.getSnapshot().appointments).toEqual([]);
    expect(s.getSnapshot().calendar).toEqual({ connected: false, busy: null });
    expect(revoke).toHaveBeenCalledWith("blob:experiment"); expect(revoke).not.toHaveBeenCalledWith("blob:original");
  });
  it("hard resets configuration, baseline, appointments, calendar and image URLs", () => {
    const revoke = vi.fn(), s = active(() => now, revoke); s.setLogo("blob:logo", 0); s.book(date, "service-1", 540, "staff-1");
    s.hardReset(); const state = s.getSnapshot(); expect(state.phase).toBe("setup"); expect(state.config).toEqual(emptyConfiguration());
    expect(state.baseline).toBeNull(); expect(state.appointments).toEqual([]); expect(state.calendar.busy).toBeNull();
    expect(revoke).toHaveBeenCalledWith("blob:logo");
  });
  it.each(["book", "update", "return"])("expires before %s without relying on a timer", operation => {
    let time = now; const s = active(() => time); const previous = structuredClone(s.getSnapshot().config);
    time += SESSION_POLICY.inactivityMs;
    if (operation === "book") expect(s.book(date, "service-1", 540, "staff-1")).toContain("expired");
    if (operation === "update") s.update(previous);
    if (operation === "return") expect(s.checkExpiry()).toBe(true);
    expect(s.getSnapshot().phase).toBe("setup"); expect(s.getSnapshot().baseline).toBeNull(); expect(s.getSnapshot().config.business.name).toBe("");
  });
  it("measures inactivity from the last action, while reads never extend it", () => {
    let time = now; const s = active(() => time); time += 59 * 60_000; s.touch();
    time += 59 * 60_000; s.slots(date, "service-1", "any"); expect(s.checkExpiry()).toBe(false);
    time += 60_000; expect(s.checkExpiry()).toBe(true);
  });
  it.each(["hard", "soft", "dispose"])("revokes late image results after %s reset/unmount", reset => {
    const revoke = vi.fn(), s = active(() => now, revoke); const epoch = s.getSnapshot().epoch;
    if (reset === "hard") s.hardReset(); else if (reset === "soft") s.softReset(); else s.dispose();
    s.setLogo("blob:late", epoch); expect(revoke).toHaveBeenCalledWith("blob:late"); expect(s.getSnapshot().config.theme.logoUrl).toBeUndefined();
  });
  it("does not mix sessions", () => {
    const a = active(), b = active(); a.book(date, "service-1", 540, "staff-1"); a.hardReset();
    expect(b.getSnapshot().phase).toBe("active"); expect(b.getSnapshot().appointments).toHaveLength(0);
  });
  it("rejects executable or disguised logo files before creating an object URL", async () => {
    await expect(localLogo(new File(["<svg></svg>"], "logo.svg", { type: "image/svg+xml" }))).rejects.toThrow("PNG");
    await expect(localLogo(new File(["<script>"], "fake.png", { type: "image/png" }))).rejects.toThrow("contents");
  });
  it("re-encodes a valid local raster and releases the decoded bitmap", async () => {
    const close = vi.fn(), drawImage = vi.fn(), createURL = vi.spyOn(URL, "createObjectURL").mockReturnValue("blob:sanitized");
    vi.stubGlobal("createImageBitmap", vi.fn().mockResolvedValue({ width: 100, height: 50, close }));
    vi.stubGlobal("document", { createElement: () => ({ width: 0, height: 0,
      getContext: () => ({ drawImage }), toBlob: (fn: (b: Blob) => void) => fn(new Blob(["sanitized"], { type: "image/png" })) }) });
    try {
      const file = new File([new Uint8Array([137, 80, 78, 71, 13, 10, 26, 10])], "logo.png", { type: "image/png" });
      expect(await localLogo(file)).toBe("blob:sanitized"); expect(drawImage).toHaveBeenCalled(); expect(close).toHaveBeenCalled();
      const encoded = createURL.mock.calls[0][0];
      expect(encoded).toBeInstanceOf(Blob);
      expect((encoded as Blob).type).toBe("image/png");
    } finally { vi.unstubAllGlobals(); createURL.mockRestore(); }
  });
});
