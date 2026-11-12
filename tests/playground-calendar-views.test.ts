import { describe, expect, it, vi } from "vitest";
import { createElement } from "react";
import { renderToStaticMarkup } from "react-dom/server";
import { PlaygroundSession, editPerson } from "../app/features/playground/session";
import { weekDates } from "../app/features/playground/week-overview";
import { WeekTimetable, weekRange } from "../app/features/playground/week-timetable";
import { MonthBoard, monthDates, monthAnchor, monthOverview } from "../app/features/playground/month-board";
import { clockScale, bookingSpans, spanBounds } from "../app/features/playground/booking-spans";
import { screenToWorld, zoomAt, horizontalWheel } from "../app/features/playground/timetable-camera";
import { BookingSpanSurface } from "../app/features/playground/booking-span-surface";
import { capacityRows } from "../app/features/playground/capacity";
import { SpanPreviewInteraction } from "../app/features/playground/span-preview";

const date = "2026-11-11";
function fixture() {
  const s = new PlaygroundSession(() => Date.parse("2026-11-08T06:00Z")); let c = structuredClone(s.getSnapshot().config);
  c.business.name = "Synthetic calendar"; c.business.timezone = "Africa/Johannesburg";
  c.people[0].name = "Synthetic practitioner"; c.people[0].roles = ["Owner"]; c = editPerson(c, c.people[0], true);
  c.services[0] = { ...c.services[0], name: "Synthetic service", durationMinutes: 60, bufferAfterMinutes: 10, eligibleStaffIds: ["staff-1"] };
  c.hours[1] = [{ opens: 480, closes: 960 }]; c.hours[2] = [{ opens: 540, closes: 720 }, { opens: 780, closes: 900 }];
  s.update(c); expect(s.complete()).toEqual([]); s.selectDiaryDate(date); return s;
}
describe("shared clock Week", () => {
  it("normalizes horizontal wheel motion without zoom and preserves browser/modal/form boundaries", () => {
    const e = { deltaX: 3, deltaY: 0, deltaMode: 1, ctrlKey: false, metaKey: false, cancelable: true, clientY: 100, preventDefault: vi.fn(), stopPropagation: vi.fn() }, shift = vi.fn();
    expect(horizontalWheel(e, true, false, 400, shift)).toBe(true); expect(shift).toHaveBeenCalledWith(48);
    for (const flags of [{ ctrlKey: true }, { metaKey: true }, { cancelable: false }, { deltaY: 5 }]) expect(horizontalWheel({ ...e, ...flags }, true, false, 400, vi.fn())).toBe(false);
    expect(horizontalWheel(e, false, false, 400, vi.fn())).toBe(false); expect(horizontalWheel(e, true, true, 400, vi.fn())).toBe(false);
  });
  it("aligns 10:00 across unequal opening hours and uncompressed split breaks", () => {
    const s = fixture(), state = s.getSnapshot(), range = weekRange(state, weekDates(date));
    expect(range).toEqual({ start: 480, end: 1020 });
    const monday = clockScale(state, "2026-11-09", range, 32), tuesday = clockScale(state, "2026-11-10", range, 32);
    expect(monday.position(600)).toBe(tuesday.position(600)); expect(tuesday.position(780) - tuesday.position(720)).toBe(128);
    expect(tuesday.parts.filter(p => p.closed).map(p => [p.start, p.end])).toEqual([[480, 540], [720, 780], [900, 1020]]);
    for (const minute of [480, 547, 600, 720, 755, 780, 1020]) expect(tuesday.minuteAt(tuesday.position(minute))).toBeCloseTo(minute);
    const camera = { zoom: .5, x: 400, y: 100 }, pointer = { x: 200, y: 120 }, world = { width: 2200, height: tuesday.height }, view = { width: 500, height: 300 };
    expect(screenToWorld(zoomAt(camera, 1.3, pointer.y, world, view), pointer)).toEqual(screenToWorld(camera, pointer));
  });
  it("reuses continuous exact 60+10 service/buffer geometry for the group's actual date", () => {
    const s = fixture(); s.book("2026-11-10", "service-1", 540, "staff-1"); s.selectDiaryDate(date);
    const state = s.getSnapshot(), range = weekRange(state, weekDates(date)), scale = clockScale(state, "2026-11-10", range, 32), spans = bookingSpans(state, "2026-11-10");
    expect(spanBounds(spans[0], scale, range)!.height / spanBounds(spans[1], scale, range)!.height).toBeCloseTo(6);
    const html = renderToStaticMarkup(createElement(BookingSpanSurface, { state, range, pitch: 32, people: ["staff-1"], rows: capacityRows(s, state, "2026-11-10"), mode: "hover", scope: "day", shared: { date: "2026-11-10", camera: { zoom: 1, x: 0, y: 0 }, height: 400, moving: false, offset: 300 }, pin: vi.fn(), book: vi.fn() }));
    expect(html).toContain('data-state="Booked"'); expect(html).toContain('data-state="Buffer"'); expect(html).toContain('aria-label="2026-11-10'); expect(html).not.toContain("minimap"); expect(html).not.toMatch(/title="[^"]+/);
  });
  it("keeps seven dated headings horizontal, explicit navigation and bounded mounted day bodies", () => {
    const s = fixture(), html = renderToStaticMarkup(createElement(WeekTimetable, { state: s.getSnapshot(), session: s, today: date, serviceId: "", actorId: "", mode: "click", suspended: false, openDay: vi.fn(), openDetails: vi.fn(), openComposer: vi.fn() }));
    for (const d of weekDates(date)) expect(html).toContain(d);
    expect(html).toContain("Next day columns"); expect(html).toContain("Scroll week horizontally"); expect(html).toContain("Fit day");
    expect(html).not.toContain("week-appointment"); expect(html).not.toContain("minimap");
    expect((html.match(/data-date=/g) ?? []).length).toBeLessThan(7);
  });
});
describe("Month is a bounded count/identity overview", () => {
  it.each(["2028-02-15", "2026-12-31", "2027-01-01", "2026-11-11"])("pads %s to Monday–Sunday without losing month dates", date => {
    const days = monthDates(date); expect(days.length % 7).toBe(0); expect(days.length).toBeLessThanOrEqual(42);
    expect(new Date(days[0]).getUTCDay()).toBe(1); expect(new Date(days.at(-1)!).getUTCDay()).toBe(0);
    expect(new Set(days).size).toBe(days.length);
    expect(days).toContain(monthAnchor(date));
    if (date.startsWith("2028-02")) expect(days).toContain("2028-02-29");
  });
  it("navigates month/year boundaries without using the host timezone", () => {
    expect(monthAnchor("2026-12-31", 1)).toBe("2027-01-01"); expect(monthAnchor("2027-01-31", -1)).toBe("2026-12-01");
  });
  it("counts one appointment, not its buffer or busy interval; retains removed/closed records", () => {
    const s = fixture(); s.book(date, "service-1", 540, "staff-1"); s.connectBusy(date, "staff-1", 550, 30);
    const a = s.getSnapshot().appointments[0], c = structuredClone(s.getSnapshot().config); c.hours[3] = []; c.staff = []; s.update(c);
    const day = monthOverview(s.getSnapshot(), date).find(d => d.date === date)!;
    expect(day.appointments).toHaveLength(1); expect(day.busy).toHaveLength(1); expect(day.closed).toBe(true); expect(day.appointments[0].retained).toBe(true); expect(day.appointments[0].conflict).toBe(true);
    const html = renderToStaticMarkup(createElement(MonthBoard, { state: s.getSnapshot(), today: date, mode: "hover", suspended: false, selectDate: vi.fn(), openDay: vi.fn(), openWeek: vi.fn(), openDetails: vi.fn() }));
    expect(html).toContain("Markers mean has bookings, not fully booked"); expect(html).toContain(`${a.staffName}: has bookings`); expect(html).toContain("CONFLICT"); expect(html).toContain("Retained"); expect(html).not.toMatch(/title=/);
    expect(s.getSnapshot().appointments[0]).toBe(a);
  });
  it("uses delayed read-only preview handlers, with explicit click pin and cancellation", () => {
    vi.useFakeTimers(); const show = vi.fn(), pin = vi.fn(), c = new SpanPreviewInteraction(show, () => false), target = { contains: () => false } as unknown as HTMLElement;
    c.preference("hover"); const handlers = c.handlers([date], pin);
    handlers.onPointerEnter({ pointerType: "mouse", currentTarget: target } as never); vi.advanceTimersByTime(449); expect(pin).not.toHaveBeenCalled();
    vi.advanceTimersByTime(1); expect(show).toHaveBeenLastCalledWith([date]); expect(pin).not.toHaveBeenCalled();
    handlers.onClick({ currentTarget: target } as never); expect(pin).toHaveBeenCalledWith([date], target);
    c.navigation(true); show.mockClear(); handlers.onFocus({ currentTarget: target } as never); vi.advanceTimersByTime(500); expect(show).not.toHaveBeenCalled(); c.dispose(); vi.useRealTimers();
  });
});
