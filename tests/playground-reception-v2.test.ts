import { afterEach, describe, expect, it, vi } from "vitest";
import { createElement, isValidElement } from "react";
import type { ReactNode, ReactElement } from "react";
import { renderToStaticMarkup } from "react-dom/server";
import { readFileSync } from "node:fs";
import { PlaygroundSession, editPerson, SESSION_POLICY } from "../app/features/playground/session";
import { todayInTimeZone } from "../app/features/demo/booking";
import { weekDates, weekOverview, WeekOverview } from "../app/features/playground/week-overview";
import { NavigationHelp, queueNavigationHelp } from "../app/features/playground/navigation-help";
import { TimeTileBoard } from "../app/features/playground/time-tile-board";
import { tileDisplayLimit, groupTimeTiles, timeTiles } from "../app/features/playground/time-tiles";
import { ReceptionDraft } from "../app/features/playground/reception-state";

const date = "2026-11-11", now = Date.parse("2026-11-10T06:00:00Z");
function active(clock = () => now) {
  const s = new PlaygroundSession(clock); let c = structuredClone(s.getSnapshot().config);
  c.business.name = "Synthetic V2"; c.business.timezone = "Africa/Johannesburg";
  c.people[0] = { id: "staff-1", name: "Long practitioner ".repeat(5).trim(), roles: ["Owner"], colour: "#123456" };
  c = editPerson(c, c.people[0], true);
  c.services[0] = { ...c.services[0], name: "Long service ".repeat(7).trim(), durationMinutes: 60, bufferAfterMinutes: 10, eligibleStaffIds: ["staff-1"] };
  s.update(c); expect(s.complete()).toEqual([]); s.selectDiaryDate(date); return s;
}
function elements(node: ReactNode): ReactElement<Record<string, unknown>>[] {
  if (Array.isArray(node)) return node.flatMap(elements);
  if (!isValidElement<Record<string, unknown>>(node)) return [];
  return [node, ...elements(node.props.children as ReactNode)];
}
afterEach(() => { vi.useRealTimers(); vi.unstubAllGlobals(); });

describe("Week is a civil-date projection of existing records", () => {
  it.each([
    ["2027-01-01", "2026-12-28", "2027-01-03"],
    ["2026-11-01", "2026-10-26", "2026-11-01"],
    ["2028-02-29", "2028-02-28", "2028-03-05"],
    ["2026-11-09", "2026-11-09", "2026-11-15"],
  ])("shows all Monday–Sunday dates containing %s", (selected, first, last) => {
    const days = weekDates(selected); expect(days).toHaveLength(7); expect(new Set(days).size).toBe(7);
    expect(days[0]).toBe(first); expect(days[6]).toBe(last);
  });
  it("uses the business date when its day differs from UTC/browser date", () => {
    const instant = new Date("2026-11-08T23:30:00Z");
    expect(weekDates(todayInTimeZone(instant, "Africa/Johannesburg"))[0]).toBe("2026-11-09");
    expect(weekDates(todayInTimeZone(instant, "America/Los_Angeles"))[0]).toBe("2026-11-02");
  });
  it("counts bookings once, sorts exact starts and retains snapshots after closed/removed-person changes", () => {
    const s = active(); s.book(date, "service-1", 660, "staff-1"); s.book(date, "service-1", 540, "staff-1");
    const originals = s.getSnapshot().appointments, c = structuredClone(s.getSnapshot().config);
    c.hours[3] = []; c.staff = []; c.people = []; s.update(c);
    const day = weekOverview(s.getSnapshot(), date)[2];
    expect(day.closed).toBe(true); expect(day.appointments).toHaveLength(2);
    expect(day.appointments.map(a => a.appointment.startMinute)).toEqual([540, 660]);
    expect(day.appointments.every(a => a.retained && a.detailIds.length === 2)).toBe(true);
    expect(s.getSnapshot().appointments).toEqual(originals);
    const html = renderToStaticMarkup(createElement(WeekOverview, { state: s.getSnapshot(), today: date, selectWeek: vi.fn(), openDay: vi.fn(), openAppointment: vi.fn(), newBooking: vi.fn() }));
    expect(html).toContain("Closed day"); expect(html).toContain(originals[0].staffName!); expect(html).toContain(originals[0].serviceName!);
    expect(html).toContain("Protected buffer: 10:00–10:10"); expect(html).toContain("Retained exception");
    expect(html.match(/class="week-appointment/g)).toHaveLength(2);
  });
  it("retains actual conflicts and confirmed overrides using the existing projection, and updates cancellation", () => {
    const s = active(); s.book(date, "service-1", 540, "staff-1");
    const first = s.getSnapshot().appointments[0];
    expect(s.receptionBook(date, "service-1", 600, "staff-1", "staff-1", [first.id])).toBeNull();
    let day = weekOverview(s.getSnapshot(), date)[2];
    expect(day.appointments).toHaveLength(2); expect(day.appointments.every(a => !a.conflict)).toBe(true);
    expect(day.appointments[1].appointment.bufferOverride?.appointmentIds).toContain(first.id);
    expect(s.connectBusy(date, "staff-1", 550, 15)).toBeNull();
    day = weekOverview(s.getSnapshot(), date)[2]; expect(day.busy).toHaveLength(1); expect(day.appointments[0].conflict).toBe(true);
    s.cancel(first.id); expect(weekOverview(s.getSnapshot(), date)[2].appointments).toHaveLength(1);
  });
  it("keeps all 200 synthetic records reachable without truncating dense days", () => {
    const s = active(); s.book(date, "service-1", 540, "staff-1"); const state = structuredClone(s.getSnapshot());
    state.appointments = Array.from({ length: 200 }, (_, i) => ({ ...state.appointments[0], id: `fixture-${i}`, startMinute: 540 + i }));
    const html = renderToStaticMarkup(createElement(WeekOverview, { state, today: date, selectWeek: vi.fn(), openDay: vi.fn(), openAppointment: vi.fn(), newBooking: vi.fn() }));
    expect(html.match(/class="week-appointment/g)).toHaveLength(200); expect(html).toContain("200 bookings");
  });
  it("routes actual day/card/composer handlers to their own date even when Day selection differs", () => {
    const s = active(); s.book("2026-11-12", "service-1", 540, "staff-1"); s.selectDiaryDate(date);
    const openDay = vi.fn(), openAppointment = vi.fn(), newBooking = vi.fn(), selectWeek = vi.fn(), target = {} as HTMLElement;
    const tree = WeekOverview({ state: s.getSnapshot(), today: "2026-11-10", openDay, openAppointment, newBooking, selectWeek });
    const daySection = elements(tree).find(e => e.type === "section" && e.props["aria-label"] === "2026-11-12")!;
    const buttons = elements(daySection).filter(e => e.type === "button");
    (buttons[0].props.onClick as () => void)(); expect(openDay).toHaveBeenCalledWith("2026-11-12");
    (buttons[1].props.onClick as (e: unknown) => void)({ currentTarget: target }); expect(newBooking).toHaveBeenCalledWith("2026-11-12", target);
    (buttons[2].props.onClick as (e: unknown) => void)({ currentTarget: target });
    const id = s.getSnapshot().appointments[0].id; expect(openAppointment).toHaveBeenCalledWith("2026-11-12", [id, `${id}-buffer`], target);
    const nav = elements(tree).filter(e => e.type === "button").slice(0, 3);
    nav.forEach(e => (e.props.onClick as () => void)());
    expect(selectWeek.mock.calls).toEqual([["2026-11-02"], ["2026-11-10"], ["2026-11-16"]]);
    expect(s.getSnapshot().diaryDate).toBe(date);
  });
  it("viewing arbitrary weeks changes no eligibility, snapshots or pending booking validity", () => {
    const s = active(), before = s.getSnapshot(), slots = s.slots(date, "service-1", "staff-1"), draft = new ReceptionDraft(s);
    for (const d of [date, "2020-01-01", "2030-12-31"]) expect(weekOverview(before, d)).toHaveLength(7);
    expect(s.getSnapshot()).toBe(before); expect(s.slots(date, "service-1", "staff-1")).toEqual(slots);
    expect(s.slots("2030-12-31", "service-1", "staff-1")).toEqual([]);
    expect(draft.submit({ date, serviceId: "service-1", staffId: "staff-1", minute: 540 })).toBeNull();
  });
});

describe("content-aware practitioner presentation", () => {
  it("renders complete long practitioner and mixed status/group text without clamps or native titles", () => {
    const s = active(); s.book(date, "service-1", 540, "staff-1"); s.connectBusy(date, "staff-1", 550, 70);
    const html = renderToStaticMarkup(createElement(TimeTileBoard, { session: s, state: s.getSnapshot(), person: "staff-1", serviceId: "service-1", openDetails: vi.fn(), openComposer: vi.fn(), previewEvents: () => ({}), dismissPreview: vi.fn() }));
    expect(html).toContain(s.getSnapshot().config.staff[0].name); expect(html).toContain("CONFLICT / Booked / Busy");
    expect(html).not.toMatch(/line-clamp|truncate|title=/);
    const css = readFileSync(new URL("../app/app.css", import.meta.url), "utf8");
    const tileRule = css.match(/\.reception-time-tile \{([^}]+)\}/)![1];
    expect(tileRule).toContain("height: auto"); expect(tileRule).toContain("overflow-wrap: anywhere"); expect(tileRule).not.toContain("overflow: hidden");
    expect(css).toContain("minmax(min(100%, 140px), 1fr)"); expect(css).not.toContain("38dvh"); expect(css).not.toContain("minimap");
    // CSS assertions constrain implementation; they do not establish visual fit.
  });
  it("reduces density for larger wrapped cards while preserving every exact start in groups", () => {
    expect(tileDisplayLimit(450, 600, 180, 80)).toBeLessThan(tileDisplayLimit(450, 600, 76, 40));
    const s = active(), c = structuredClone(s.getSnapshot().config); c.startInterval = 1; s.update(c);
    const tiles = timeTiles(s.getSnapshot(), date, "staff-1");
    for (const width of [80, 140, 450]) expect(groupTimeTiles(tiles, tileDisplayLimit(width, 250, 240, 150)).flat()).toEqual(tiles);
  });
});

describe("first-use navigation help is memory-session state, not reset epoch", () => {
  it("survives date/view/config changes and baseline restoration but clears on hard reset/expiry", () => {
    let clock = now; const s = active(() => clock);
    expect(s.getSnapshot().navigationHelpSeen).toBe(false); expect(s.acknowledgeNavigationHelp()).toBe(true);
    const revision = s.getSnapshot().configRevision;
    s.selectDiaryDate("2026-11-12"); s.view("reception"); s.view("booking");
    expect(s.getSnapshot().configRevision).toBe(revision); s.update(structuredClone(s.getSnapshot().config)); s.softReset();
    expect(s.getSnapshot().navigationHelpSeen).toBe(true);
    clock += SESSION_POLICY.inactivityMs; s.checkExpiry(); expect(s.getSnapshot().navigationHelpSeen).toBe(false);
    expect(s.acknowledgeNavigationHelp()).toBe(false);
    const fresh = active(); fresh.acknowledgeNavigationHelp(); fresh.hardReset(); expect(fresh.getSnapshot().navigationHelpSeen).toBe(false);
    expect(active().getSnapshot().navigationHelpSeen).toBe(false);
  });
  it("waits behind another modal, opens once, and cancels pending work on reset/unmount", () => {
    vi.useFakeTimers(); let modal = true; let mutation = () => {}; const disconnect = vi.fn();
    vi.stubGlobal("document", { body: {}, querySelector: () => modal ? {} : null });
    vi.stubGlobal("MutationObserver", class { constructor(callback: () => void) { mutation = callback; } observe() {} disconnect = disconnect; });
    const open = vi.fn(), dispose = queueNavigationHelp(open);
    vi.runAllTimers(); expect(open).not.toHaveBeenCalled(); modal = false; mutation(); mutation(); expect(open).toHaveBeenCalledOnce(); dispose();
    const cancelled = vi.fn(), cancel = queueNavigationHelp(cancelled); cancel(); vi.runAllTimers(); mutation(); expect(cancelled).not.toHaveBeenCalled(); expect(disconnect).toHaveBeenCalledTimes(2);
  });
  it("provides skip/close/Escape through the existing focus-restoring dialog and shared release wording", () => {
    const close = vi.fn(), tree = NavigationHelp({ close, returnFocus: null });
    expect(tree.props.onClose).toBe(close);
    const start = elements(tree).find(e => e.type === "button")!; (start.props.onClick as () => void)(); expect(close).toHaveBeenCalledOnce();
    const html = renderToStaticMarkup(tree); expect(html).toContain("Got it / Start exploring"); expect(html).toContain("Fit day"); expect(html).toContain("pinch zoom is not implemented"); expect(html).not.toContain("minimap");
    const guide = readFileSync(new URL("../preview/main.tsx", import.meta.url), "utf8"); expect(guide).toContain("<NavigationInstructions />");
  });
});
