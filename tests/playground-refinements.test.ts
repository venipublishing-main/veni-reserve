import { describe, expect, it, vi } from "vitest";
import { createElement } from "react";
import { renderToStaticMarkup } from "react-dom/server";
import { MemoryRouter } from "react-router";
import { PlaygroundSession, configurationErrors, editPerson, emptyConfiguration, SESSION_POLICY } from "../app/features/playground/session";
import { exceptionBlocks } from "../app/features/playground/diary-projection";
import { diaryBlocks, diaryColumns, PlaygroundDiary } from "../app/features/playground/diary";
import { canonicalZone, zoneChoices, zoneLabel, zonePreview, zoneDatePreview, TimezoneChoice } from "../app/features/playground/timezone";
import { ConfigurationEditor } from "../app/features/playground/setup";
import { bookingTheme } from "../app/features/booking/theme";

const now = Date.parse("2026-11-10T06:00:00Z"), date = "2026-11-11";
function configuration() {
  let c = emptyConfiguration();
  c.business = { name: "Fictional studio", category: "", timezone: "Africa/Johannesburg" };
  c.location.name = "Test location";
  c.people = [{ id: "staff-1", name: "Test owner", roles: ["Owner", "Admin"] },
    { id: "staff-2", name: "Test maker", roles: ["Staff"] },
    { id: "person-3", name: "Test reception", roles: ["Reception"] }];
  c = editPerson(c, c.people[0], true); c = editPerson(c, c.people[1], true);
  c.services[0] = { ...c.services[0], name: "Test service", durationMinutes: 30, bufferAfterMinutes: 15, eligibleStaffIds: ["staff-1", "staff-2"] };
  return c;
}
function active(clock = () => now) {
  const s = new PlaygroundSession(clock); s.update(configuration()); expect(s.complete()).toEqual([]); return s;
}
const render = (element: ReturnType<typeof createElement>) => renderToStaticMarkup(createElement(MemoryRouter, null, element));

describe("separate people, workspace roles and bookable staff", () => {
  it("supports three entered people with one owner identity, multiple roles and separate bookability", () => {
    const c = configuration(); expect(configurationErrors(c)).toEqual([]);
    expect(c.people).toHaveLength(3); expect(c.staff).toHaveLength(2);
    expect(c.people.filter(p => p.id === "staff-1")).toHaveLength(1);
    expect(c.people[0].roles).toEqual(["Owner", "Admin"]);
    expect(c.staff[0].role).toBe("");
    const html = render(createElement(ConfigurationEditor, { config: c, step: 2, update: () => {}, upload: async () => {} }));
    for (const label of ["Owner", "Admin", "Reception", "Staff", "Accepts customer bookings"]) expect(html).toContain(label);
    expect(html).not.toContain("Add a person (optional)");
  });
  it("rejects a fourth person, unnamed slots, unknown roles and duplicate identities", () => {
    const c = configuration(); c.people.push({ id: "fourth", name: "Fourth", roles: ["Staff"] });
    expect(configurationErrors(c, 2).length).toBeGreaterThan(0);
    c.people.pop(); c.people[2].name = ""; expect(configurationErrors(c, 2).length).toBeGreaterThan(0);
    c.people[2] = { ...c.people[0] }; expect(configurationErrors(c, 2).length).toBeGreaterThan(0);
    c.people[2] = { id: "third", name: "Third", roles: ["Superuser" as "Admin"] }; expect(configurationErrors(c, 2).length).toBeGreaterThan(0);
  });
  it("excludes non-bookable reception from eligibility, no-preference assignment and diary lanes", () => {
    const s = active(); expect(s.slots(date, "service-1", "person-3")).toEqual([]);
    expect(s.slots(date, "service-1", "any").some(slot => slot.staffId === "person-3")).toBe(false);
    const c = structuredClone(s.getSnapshot().config); c.services[0].eligibleStaffIds = ["person-3"];
    expect(configurationErrors(c, 2)).toContain("Assign at least one eligible person to every service.");
    const html = render(createElement(PlaygroundDiary, { session: s, today: date }));
    expect(html).not.toContain('data-staff="person-3"'); expect(html).toContain('data-staff="staff-1"');
  });
  it("retains snapshots and protected time through role, name, bookability and removal edits", () => {
    const s = active(); s.book(date, "service-1", 540, "staff-1"); const original = s.getSnapshot().appointments[0];
    let c = structuredClone(s.getSnapshot().config);
    c = editPerson(c, { ...c.people[0], name: "Renamed owner", roles: ["Reception"] }, false); s.update(c);
    expect(s.getSnapshot().appointments[0]).toEqual(original); expect(s.slots(date, "service-1", "staff-1")).toEqual([]);
    let html = render(createElement(PlaygroundDiary, { session: s, today: date }));
    expect(html).toContain("Exceptions: 2 occupied items"); expect(exceptionBlocks(s.getSnapshot(), date)[0].label).toContain("Test owner"); expect(html).not.toContain('data-staff="staff-1"');
    c = editPerson(c, c.people[0], true); c.services[0].eligibleStaffIds = [...c.services[0].eligibleStaffIds, "staff-1"]; s.update(c);
    expect(s.slots(date, "service-1", "staff-1").some(slot => slot.startMinute === 570)).toBe(false);
    expect(s.slots(date, "service-1", "staff-1").some(slot => slot.startMinute === 585)).toBe(true);
    c = editPerson(c, c.people[0], false); c.people = c.people.filter(p => p.id !== "staff-1"); s.update(c);
    html = render(createElement(PlaygroundDiary, { session: s, today: date }));
    expect(html).toContain("Exceptions: 2 occupied items"); expect(exceptionBlocks(s.getSnapshot(), date)[0].appointmentId).toBe(original.id); expect(s.getSnapshot().appointments[0]).toEqual(original);
  });
  it("does not change no-preference ordering when editing a name", () => {
    const c = configuration(), edited = editPerson(c, { ...c.people[0], name: "New name" }, true);
    expect(edited.staff.map(p => p.id)).toEqual(c.staff.map(p => p.id));
  });
});

describe("timezone choice and instant protection", () => {
  it("canonicalizes aliases, labels cities and rejects unsupported zones", () => {
    expect(canonicalZone("US/Eastern")).toBe(canonicalZone("America/New_York"));
    expect(canonicalZone("not/a-zone")).toBeNull(); expect(zoneLabel("Africa/Johannesburg")).toContain("Johannesburg (Africa)");
    expect(zoneChoices()).toContain("Africa/Johannesburg");
  });
  it("renders deterministic initial markup and preserves the explicitly selected zone", () => {
    const change = vi.fn();
    const element = createElement(TimezoneChoice, { value: "Europe/Paris", locked: false, onChange: change });
    const first = render(element); expect(render(element)).toBe(first);
    expect(first).toContain('value="Europe/Paris" selected=""'); expect(first).not.toContain("Browser setting:"); expect(change).not.toHaveBeenCalled();
  });
  it("handles unavailable Intl and falls back when supportedValuesOf is missing", () => {
    const method = vi.spyOn(Intl, "supportedValuesOf").mockImplementation(() => { throw new Error("Unsupported"); });
    expect(zoneChoices()).toContain("UTC"); method.mockRestore();
    vi.stubGlobal("Intl", undefined);
    try { expect(zoneChoices()).toEqual([]); expect(canonicalZone("UTC")).toBeNull(); expect(zonePreview("UTC", new Date(now))).toContain("unavailable"); }
    finally { vi.unstubAllGlobals(); }
  });
  it("calculates the relevant seasonal and fractional UTC offsets", () => {
    expect(zonePreview("America/New_York", new Date("2026-01-15T12:00:00Z"))).toContain("UTC-05:00");
    expect(zonePreview("America/New_York", new Date("2026-07-15T12:00:00Z"))).toContain("UTC-04:00");
    expect(zonePreview("Asia/Kolkata", new Date(now))).toContain("UTC+05:30");
  });
  it("anchors the diary preview to the selected local date even beyond UTC+12", () => {
    const preview = zoneDatePreview("Pacific/Kiritimati", date);
    expect(preview).toContain("11 Nov 2026"); expect(preview).toContain("12:00:00"); expect(preview).toContain("UTC+14:00");
    expect(zoneDatePreview("Pacific/Apia", "2011-12-30")).toContain("unavailable");
  });
  it("blocks timezone edits for appointments and for busy time independently", () => {
    const s = active(); s.book(date, "service-1", 540, "staff-1"); const appointment = s.getSnapshot().appointments[0];
    let c = structuredClone(s.getSnapshot().config); c.business.timezone = "Europe/Paris"; s.update(c);
    expect(s.getSnapshot().config.business.timezone).toBe("Africa/Johannesburg"); expect(s.getSnapshot().appointments[0]).toEqual(appointment);
    s.cancel(appointment.id); s.connectBusy(date, "staff-1", 600, 60); const busy = s.getSnapshot().calendar.busy;
    s.update(c); expect(s.getSnapshot().calendar.busy).toEqual(busy); expect(s.getSnapshot().config.business.timezone).toBe("Africa/Johannesburg");
    s.disconnect(); s.update(c); expect(s.getSnapshot().config.business.timezone).toBe("Europe/Paris");
    c = structuredClone(s.getSnapshot().config); c.business.timezone = "Not/AZone"; s.update(c); expect(s.slots(date, "service-1", "any")).toEqual([]);
  });
});

describe("diary projection, conflicts and shared dates", () => {
  it("positions appointments, buffers, busy and closed intervals with exact half-open boundaries", () => {
    const s = active(); s.book(date, "service-1", 540, "staff-1"); s.connectBusy(date, "staff-1", 585, 60);
    const blocks = diaryBlocks(s.getSnapshot(), date);
    expect(blocks.find(b => b.kind === "appointment")).toMatchObject({ start: 540, end: 570, conflict: false });
    expect(blocks.find(b => b.kind === "buffer")).toMatchObject({ start: 570, end: 585, conflict: false });
    expect(blocks.find(b => b.kind === "busy")).toMatchObject({ start: 585, end: 645, conflict: false });
    expect(blocks.filter(b => b.kind === "closed" && b.staffId === "staff-1").map(b => [b.start, b.end])).toEqual([[0, 540], [1020, 1440]]);
    const html = render(createElement(PlaygroundDiary, { session: s, today: date }));
    expect(html).toContain('data-time="540"'); expect(html).toContain('data-time="570"'); expect(html).not.toContain("top:0%;height:");
    expect(html).not.toContain("Readable agenda"); expect(html).toContain("Africa/Johannesburg");
  });
  it("shows busy overlap with appointment and buffer without hiding or moving blocks", () => {
    const s = active(); s.book(date, "service-1", 540, "staff-1"); s.connectBusy(date, "staff-1", 555, 45);
    const blocks = diaryBlocks(s.getSnapshot(), date).filter(b => b.staffId === "staff-1" && b.kind !== "closed");
    expect(blocks).toHaveLength(3); expect(blocks.every(b => b.conflict)).toBe(true);
    const columns = diaryColumns(blocks); expect(columns.every(b => b.columns === 2)).toBe(true);
    expect(columns.find(b => b.block.kind === "busy")?.column).toBe(1);
    expect(columns.find(b => b.block.kind === "buffer")?.column).toBe(0);
    expect(render(createElement(PlaygroundDiary, { session: s, today: date }))).toContain('data-conflict="true"');
  });
  it("retains booked blocks when hours shrink or the day closes", () => {
    const s = active(); s.book(date, "service-1", 540, "staff-1"); const c = structuredClone(s.getSnapshot().config);
    c.hours[3][0].opens = 600; s.update(c); expect(diaryBlocks(s.getSnapshot(), date).find(b => b.kind === "appointment")?.conflict).toBe(true);
    c.hours[3] = []; s.update(c); const blocks = diaryBlocks(s.getSnapshot(), date);
    expect(blocks.find(b => b.kind === "closed")).toMatchObject({ start: 0, end: 1440 });
    expect(blocks.find(b => b.kind === "buffer")).toMatchObject({ start: 570, end: 585 });
  });
  it("cancellation releases only appointment and buffer; disconnect releases only busy time", () => {
    const s = active(); s.book(date, "service-1", 540, "staff-1"); s.connectBusy(date, "staff-1", 600, 60);
    s.cancel(s.getSnapshot().appointments[0].id); let blocks = diaryBlocks(s.getSnapshot(), date);
    expect(blocks.some(b => b.kind === "appointment" || b.kind === "buffer")).toBe(false); expect(blocks.some(b => b.kind === "busy")).toBe(true);
    expect(s.slots(date, "service-1", "staff-1").some(slot => slot.startMinute === 540)).toBe(true);
    expect(s.slots(date, "service-1", "staff-1").some(slot => slot.startMinute === 600)).toBe(false);
    s.book(date, "service-1", 540, "staff-1"); s.disconnect(); blocks = diaryBlocks(s.getSnapshot(), date);
    expect(blocks.some(b => b.kind === "appointment")).toBe(true); expect(blocks.some(b => b.kind === "busy")).toBe(false);
  });
  it("keeps the simulator/diary date in one store and selects a newly booked day", () => {
    const s = active(); expect(s.getSnapshot().diaryDate).toBe(date);
    s.selectDiaryDate("2026-11-12"); expect(s.getSnapshot().diaryDate).toBe("2026-11-12");
    s.selectDiaryDate("2026-02-30"); expect(s.getSnapshot().diaryDate).toBe("2026-11-12");
    s.book(date, "service-1", 540, "staff-1"); expect(s.getSnapshot().diaryDate).toBe(date);
    expect(diaryBlocks(s.getSnapshot(), "2026-11-12").some(b => b.kind === "appointment")).toBe(false);
  });
  it("clips a busy interval ending at midnight without leaking into the next day", () => {
    const s = active(); s.connectBusy(date, "staff-1", 1380, 60);
    expect(diaryBlocks(s.getSnapshot(), date).find(b => b.kind === "busy")).toMatchObject({ start: 1380, end: 1440 });
    expect(diaryBlocks(s.getSnapshot(), "2026-11-12").some(b => b.kind === "busy")).toBe(false);
  });
});

describe("accent and expanded reset baseline", () => {
  it("validates accent, derives contrasting text and never changes availability", () => {
    const s = active(), before = s.slots(date, "service-1", "any"), c = structuredClone(s.getSnapshot().config);
    c.theme.accent = "#ffffff"; s.update(c); expect(s.slots(date, "service-1", "any")).toEqual(before);
    expect(bookingTheme(c.theme.primary, c.theme.accent)).toMatchObject({ "--booking-accent": "#ffffff", "--booking-on-accent": "#000000" });
    expect(bookingTheme(c.theme.primary, "#000000")).toMatchObject({ "--booking-on-accent": "#ffffff" });
    c.theme.accent = "red; background: url(bad)"; expect(configurationErrors(c, 4).length).toBeGreaterThan(0);
    expect(JSON.stringify(bookingTheme(c.theme.primary, c.theme.accent))).not.toContain("url(");
  });
  it("soft reset restores roles, bookability, both colours and all three original people", () => {
    const s = active(), baseline = structuredClone(s.getSnapshot().baseline!);
    let c = structuredClone(s.getSnapshot().config); c = editPerson(c, { ...c.people[0], roles: ["Reception"] }, false);
    c.theme = { primary: "#000000", accent: "#ffffff" }; s.update(c); s.softReset();
    expect(s.getSnapshot().config).toEqual(baseline); expect(s.getSnapshot().diaryDate).toBe(date);
  });
  it.each(["hard", "expiry"])("%s clears expanded configuration and shared diary state", action => {
    let time = now; const s = active(() => time); s.book(date, "service-1", 540, "staff-1"); s.connectBusy(date, "staff-2", 600, 60);
    if (action === "hard") s.hardReset(); else { time += SESSION_POLICY.inactivityMs; s.checkExpiry(); }
    expect(s.getSnapshot().config).toEqual(emptyConfiguration()); expect(s.getSnapshot().baseline).toBeNull();
    expect(s.getSnapshot().diaryDate).toBe(""); expect(s.getSnapshot().appointments).toEqual([]); expect(s.getSnapshot().calendar.busy).toBeNull();
  });
});
