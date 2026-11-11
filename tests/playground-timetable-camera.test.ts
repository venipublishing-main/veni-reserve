import { describe, expect, it, vi } from "vitest";
import { createElement } from "react";
import { renderToStaticMarkup } from "react-dom/server";
import { activeTimetable, reveal, clampCamera, fitZoom, zoomAt, screenToWorld, worldToScreen, wheelFactor, handleTimetableWheel, minimapRect, centreAt, TimetablePan, LANE_WIDTH, laneLeft, lanesWidth, previewPosition } from "../app/features/playground/timetable-camera";
import { BookingSpanSurface } from "../app/features/playground/booking-span-surface";
import { ReceptionDialog } from "../app/features/playground/reception-dialog";
import { bookingSpans, dayScale, spanBounds } from "../app/features/playground/booking-spans";
import { capacityRows } from "../app/features/playground/capacity";
import { emptyConfiguration, editPerson, PlaygroundSession } from "../app/features/playground/session";
import { SpanPreviewInteraction } from "../app/features/playground/span-preview";
import { ReceptionDraft } from "../app/features/playground/reception-state";
import type { PointerEvent } from "react";
const world = { width: 1200, height: 960 }, view = { width: 250, height: 320 }, date = "2026-11-11";
function fixture() {
  let c = emptyConfiguration(); c.business.name = "Synthetic camera"; c.business.timezone = "Africa/Johannesburg";
  c.people[0].name = "Synthetic person"; c.people[0].roles = ["Staff"]; c = editPerson(c, c.people[0], true);
  c.services[0] = { ...c.services[0], name: "Synthetic service", durationMinutes: 60, bufferAfterMinutes: 10, eligibleStaffIds: ["staff-1"] };
  const s = new PlaygroundSession(() => Date.parse("2026-11-10T06:00:00Z")); s.update(c); expect(s.complete()).toEqual([]); s.selectDiaryDate(date); s.book(date, "service-1", 540, "staff-1"); return s;
}
describe("bounded time camera", () => {
  it("reveals keyboard-focused offscreen items without changing zoom or relying on native hidden scrolling", () => {
    expect(reveal({ zoom: 1, x: 0, y: 0 }, { x: 600, y: 800, width: 120, height: 30 }, world, view)).toEqual({ zoom: 1, x: 470, y: 510 });
    const c = { zoom: 2, x: 200, y: 400 }; expect(reveal(c, { x: 210, y: 210, width: 120, height: 30 }, world, view)).toEqual(c);
  });
  it("isolates an expanded timetable from the background and other foreground dialogs", () => {
    const dialog = {}, other = {}; expect(activeTimetable(true, null, null)).toBe(true); expect(activeTimetable(false, null, null)).toBe(false);
    expect(activeTimetable(true, null, dialog)).toBe(false); expect(activeTimetable(true, dialog, dialog)).toBe(true); expect(activeTimetable(true, dialog, other)).toBe(false);
  });
  it("fits all working-day height, clamps bounds and preserves lane width regardless of zoom", () => {
    const c = clampCamera({ zoom: 0, x: -90, y: 900 }, world, view); expect(c).toEqual({ zoom: 1 / 3, x: 0, y: 0 });
    expect(clampCamera({ zoom: 999, x: 99999, y: 99999 }, world, view)).toEqual({ zoom: 4, x: 950, y: 3520 });
    expect(lanesWidth(1)).toBe(120); expect(lanesWidth(3)).toBe(372); expect(laneLeft(2)).toBe(252);
  });
  it("anchors the pointer's exact world coordinate while zooming and inverts the shared mapping", () => {
    const c = { zoom: 1, x: 75, y: 200 }, pointer = { x: 110, y: 140 };
    const next = zoomAt(c, 1.5, pointer.y, world, view);
    expect(screenToWorld(next, pointer)).toEqual(screenToWorld(c, pointer));
    expect(worldToScreen(next, screenToWorld(next, pointer))).toEqual(pointer); expect(next.x).toBe(c.x);
  });
  it("allows anchoring to yield only at finite day edges", () => {
    const next = zoomAt({ zoom: 1, x: 0, y: 640 }, .01, 300, world, view);
    expect(next).toEqual({ zoom: fitZoom(world, view), x: 0, y: 0 });
  });
  it("normalizes pixel, line and page deltas, limits spikes and supports fractional trackpad input", () => {
    expect(wheelFactor(16, 0, 320)).toBe(wheelFactor(1, 1, 320)); expect(wheelFactor(160, 0, 320)).toBe(wheelFactor(.5, 2, 320));
    expect(wheelFactor(9999, 0, 320)).toBe(wheelFactor(160, 0, 320)); expect(wheelFactor(-.5, 0, 320)).toBeGreaterThan(1);
    expect(wheelFactor(.5, 0, 320)).toBeLessThan(1);
  });
  it("recentres from minimap coordinates and represents the visible rectangle", () => {
    const c = centreAt({ zoom: 1, x: 0, y: 0 }, .5, .5, world, view);
    expect(c).toEqual({ zoom: 1, x: 475, y: 320 }); expect(minimapRect(c, world, view)).toEqual({ x: 475 / 1200, y: 1 / 3, width: 250 / 1200, height: 1 / 3 });
    expect(centreAt(c, -2, 10, world, view)).toEqual({ zoom: 1, x: 0, y: 640 });
    expect(minimapRect({ zoom: 1 / 3, x: 0, y: 0 }, world, view).height).toBe(1);
  });
  it("retains exact 60+10 endpoints at every zoom and inverts times through split breaks", () => {
    const s = fixture(), state = structuredClone(s.getSnapshot()); state.config.hours[3] = [{ opens: 540, closes: 720 }, { opens: 780, closes: 1020 }];
    const scale = dayScale(state, date, 30), spans = bookingSpans(state, date), range = { start: 540, end: 1020 };
    const service = spanBounds(spans[0], scale, range)!, buffer = spanBounds(spans[1], scale, range)!;
    expect(service.height).toBe(120); expect(buffer.height).toBe(20);
    for (const zoom of [.2, 1, 3]) { const c = { zoom, x: 0, y: 10 }; const start = worldToScreen(c, { x: 0, y: buffer.top }); const end = worldToScreen(c, { x: 0, y: buffer.top + buffer.height }); expect((end.y - start.y) / zoom).toBeCloseTo(20); }
    for (const minute of [540, 547, 600, 610, 720, 750, 780, 1019]) expect(scale.minuteAt(scale.position(minute))).toBeCloseTo(minute);
  });
  it("does not mutate session configuration, snapshots or invalidate an open booking draft", () => {
    const s = fixture(), before = s.getSnapshot(), draft = new ReceptionDraft(s);
    const c = centreAt(zoomAt({ zoom: 1, x: 0, y: 0 }, 2, 160, world, view), .5, .8, world, view); expect(c.y).toBeGreaterThan(0);
    expect(s.getSnapshot()).toBe(before); expect(draft.submit({ date, serviceId: "service-1", staffId: "staff-1", minute: 615 })).toBeNull();
  });
});
describe("actual wheel handler and gesture state", () => {
  function wheel(overrides = {}) { return { ctrlKey: false, metaKey: false, cancelable: true, deltaY: -30, deltaMode: 0, clientY: 200, preventDefault: vi.fn(), stopPropagation: vi.fn(), ...overrides }; }
  it("consumes a plain board wheel exactly once and passes the pointer relative to the viewport", () => {
    const e = wheel(), zoom = vi.fn(); expect(handleTimetableWheel(e, true, false, 320, 50, zoom)).toBe(true);
    expect(e.preventDefault).toHaveBeenCalledOnce(); expect(e.stopPropagation).toHaveBeenCalledOnce(); expect(zoom).toHaveBeenCalledExactlyOnceWith(wheelFactor(-30, 0, 320), 150);
  });
  it.each([{ ctrlKey: true }, { metaKey: true }, { cancelable: false }, { deltaY: 0 }])("leaves browser zoom/noncancellable events untouched: %j", flags => {
    const e = wheel(flags), zoom = vi.fn(); expect(handleTimetableWheel(e, true, false, 320, 0, zoom)).toBe(false); expect(e.preventDefault).not.toHaveBeenCalled(); expect(zoom).not.toHaveBeenCalled();
  });
  it.each(["outside", "background-modal", "form", "preview"])("does not consume %s wheel input", kind => {
    const e = wheel(), zoom = vi.fn(); expect(handleTimetableWheel(e, kind === "form" || kind === "preview", kind === "form" || kind === "preview", 320, 0, zoom)).toBe(false); expect(e.preventDefault).not.toHaveBeenCalled();
  });
  it("captures middle-pan, checks pointer identity, releases capture and suppresses its action click", () => {
    const p = new TimetablePan(), capture = { setPointerCapture: vi.fn(), hasPointerCapture: () => true, releasePointerCapture: vi.fn() };
    expect(p.start(7, 1, false, { x: 40, y: 50 }, capture)).toBe(true); expect(capture.setPointerCapture).toHaveBeenCalledExactlyOnceWith(7);
    expect(p.move(8, { x: 50, y: 70 })).toBeNull(); expect(p.move(7, { x: 50, y: 70 })).toEqual({ x: -10, y: -20 });
    p.stop(); expect(capture.releasePointerCapture).toHaveBeenCalledExactlyOnceWith(7); expect(p.move(7, { x: 60, y: 80 })).toBeNull(); expect(p.consumeClick()).toBe(true); expect(p.consumeClick()).toBe(false);
    expect(p.start(8, 0, false, { x: 0, y: 0 })).toBe(false); expect(p.consumeClick()).toBe(false);
  });
  it.each(["release", "cancel", "lost capture", "blur", "Escape", "unmount", "reset"])("the shared stop path is idempotent after %s", () => {
    const p = new TimetablePan(), releasePointerCapture = vi.fn(); p.start(1, 0, true, { x: 0, y: 0 }, { setPointerCapture: () => {}, hasPointerCapture: () => true, releasePointerCapture });
    p.stop(); p.stop(); expect(releasePointerCapture).toHaveBeenCalledOnce(); expect(p.pointer).toBeNull(); expect(p.consumeClick()).toBe(true);
  });
  it("blocks hover/focus scheduling during navigation and cancels existing delayed previews", () => {
    vi.useFakeTimers(); const show = vi.fn(), c = new SpanPreviewInteraction(show, () => false), target = {} as HTMLElement;
    const handlers = c.handlers(["a"], () => {}), event = { currentTarget: target, pointerType: "mouse" } as PointerEvent<HTMLElement>;
    c.preference("hover"); handlers.onPointerEnter(event); c.navigation(true); show.mockClear(); handlers.onPointerEnter(event); vi.advanceTimersByTime(1000); expect(show).not.toHaveBeenCalled();
    c.navigation(false); const other = { ...event, currentTarget: {} as HTMLElement }; handlers.onPointerEnter(other); vi.advanceTimersByTime(450); expect(show).toHaveBeenLastCalledWith(["a"]); c.dispose(); vi.useRealTimers();
  });
});
describe.each(["day", "range"] as const)("%s shared viewport markup", scope => {
  it.each([1, 2, 3, 17])("keeps %i practitioner lanes bounded, accessible and without native tooltips", count => {
    const s = fixture(), state = structuredClone(s.getSnapshot()); state.config.staff = Array.from({ length: count }, (_, i) => ({ ...state.config.staff[0], id: i ? `staff-${i+1}` : "staff-1" }));
    const surface = createElement(BookingSpanSurface, { state, rows: capacityRows(s, state, date), people: state.config.staff.map(p => p.id), range: { start: 540, end: 1020 }, pitch: 32, scope, mode: "hover", pin: () => {}, book: () => {} });
    const html = renderToStaticMarkup(scope === "day" ? surface : createElement(ReceptionDialog, { title: "Day capacity", onClose: () => {}, returnFocus: null, children: surface }));
    expect(html.match(/class="span-person-lane"/g)).toHaveLength(count); expect(html).toContain(`width:${LANE_WIDTH}px`); expect(html).not.toContain("minmax(0, 1fr))"); expect(html).not.toMatch(/title="[^"]+/);
    expect(html).toContain('title=""'); expect(html).toContain('aria-label="09:00-10:00 Booked:'); expect(html).toContain('data-time="1005"'); expect(html).toContain("Fit day"); expect(html).toContain("Readable / reset"); expect(html).toContain("Whole-day minimap"); expect(html).not.toContain("Time-range group");
    if (scope === "range") expect(html.indexOf("<dialog")).toBeLessThan(html.indexOf('data-preview-scope="range"'));
  });
  it("clamps screen-space previews within the active dialog bounds, without board zoom", () => {
    expect(previewPosition({ right: 780, top: 700 }, { left: 100, right: 500, top: 100, bottom: 600 })).toEqual({ left: 200, top: 380, width: 300, maxHeight: 220 });
    expect(previewPosition({ right: 100, top: 100 }, { left: 12, right: 212, top: 12, bottom: 160 })).toEqual({ left: 12, top: 12, width: 200, maxHeight: 148 });
  });
});
