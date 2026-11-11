import { afterEach, describe, expect, it, vi } from "vitest";
import { createElement } from "react";
import type { FocusEvent, MouseEvent, PointerEvent } from "react";
import { renderToStaticMarkup } from "react-dom/server";
import { PlaygroundSession, emptyConfiguration, editPerson } from "../app/features/playground/session";
import { bookingSpans, dayScale, spanBounds } from "../app/features/playground/booking-spans";
import { capacityRows, capacitySummary, rowAvailability } from "../app/features/playground/capacity";
import { BookingSpanSurface } from "../app/features/playground/booking-span-surface";
import { SpanPreviewInteraction } from "../app/features/playground/span-preview";
import { exceptionBlocks, diaryBlocks } from "../app/features/playground/diary-projection";
import { ReceptionDialog } from "../app/features/playground/reception-dialog";
const date = "2026-11-11", now = Date.parse("2026-11-10T06:00:00Z"), range = { start: 540, end: 1020 };
function fixture(duration = 30, buffer = 15) {
  let c = emptyConfiguration(); c.business.name = "Synthetic spans"; c.business.timezone = "Africa/Johannesburg"; c.staff = [];
  c.people = [{ id: "a", name: "Synthetic A", roles: ["Staff"], colour: "#22aa44" }, { id: "b", name: "Synthetic B", roles: ["Staff"], colour: "#ff0000" }];
  for (const p of c.people) c = editPerson(c, p, true);
  c.services[0] = { ...c.services[0], name: "Synthetic service", durationMinutes: duration, bufferAfterMinutes: buffer, eligibleStaffIds: ["a", "b"] };
  const s = new PlaygroundSession(() => now); s.update(c); expect(s.complete()).toEqual([]); s.selectDiaryDate(date); return s;
}
function html(s: PlaygroundSession, scope: "day" | "range" = "day", people = ["a", "b"]) {
  const state = s.getSnapshot();
  const surface = createElement(BookingSpanSurface, { state, rows: capacityRows(s, state, date), people, range, pitch: 30, scope, mode: "hover", pin: () => {}, book: () => {} });
  return renderToStaticMarkup(scope === "day" ? surface : createElement(ReceptionDialog, { title: "Capacity", onClose: () => {}, returnFocus: null, children: surface }));
}
afterEach(() => vi.useRealTimers());
describe("continuous service and buffer geometry", () => {
  it("matches the owner sketch with one service shape and one buffer per booking in stable lanes", () => {
    const s = fixture(); expect(s.book(date, "service-1", 540, "a")).toBeNull();
    const c = structuredClone(s.getSnapshot().config); c.services[0].durationMinutes = 15; s.update(c);
    expect(s.book(date, "service-1", 555, "b")).toBeNull(); expect(s.book(date, "service-1", 585, "a")).toBeNull();
    const state = s.getSnapshot(), spans = bookingSpans(state, date), scale = dayScale(state, date, 30);
    expect(spans.map(s => [s.block.staffId, s.block.kind, s.block.start, s.block.end])).toEqual([
      ["a", "appointment", 540, 570], ["a", "buffer", 570, 585], ["a", "appointment", 585, 600], ["a", "buffer", 600, 615],
      ["b", "appointment", 555, 570], ["b", "buffer", 570, 585],
    ]);
    expect(spans.every(s => s.lane === 0 && !s.block.conflict)).toBe(true);
    expect(spanBounds(spans[0], scale, range)).toMatchObject({ top: 0, height: 60 });
    expect(spanBounds(spans[1], scale, range)).toMatchObject({ top: 60, height: 30 });
    expect(capacitySummary(capacityRows(s, state, date)).bookings).toBe(3);
    for (const scope of ["day", "range"] as const) { const rendered = html(s, scope); expect(rendered.match(/class="booking-span"/g)).toHaveLength(6); expect(rendered).toContain(`data-preview-scope="${scope}"`); expect(rendered).not.toContain('data-conflict="true"'); }
  });
  it("draws an hour as one four-row block and an exact ten-minute buffer including row gaps", () => {
    const s = fixture(60, 10); s.book(date, "service-1", 540, "a");
    const state = s.getSnapshot(), spans = bookingSpans(state, date), scale = dayScale(state, date, 30);
    expect(spanBounds(spans[0], scale, range)).toMatchObject({ top: 0, height: 120 });
    expect(spanBounds(spans[1], scale, range)).toMatchObject({ top: 120, height: 20 });
    expect(spans[0].detailIds).toEqual(spans[1].detailIds); expect(html(s).match(/data-state="Booked"/g)).toHaveLength(1);
  });
  it("keeps neutral full-capacity time buttons at the same positions and rejects booking", () => {
    const s = fixture(), before = html(s); s.book(date, "service-1", 540, "a"); s.book(date, "service-1", 540, "b");
    const after = html(s); expect(before.match(/data-time="\d+"/g)).toEqual(after.match(/data-time="\d+"/g));
    expect(after).toContain('data-time="540" data-state="Blocked"'); expect(after).toContain('disabled=""');
    expect(rowAvailability(capacityRows(s, s.getSnapshot(), date)[0]).available).toBe(false);
    expect(s.book(date, "service-1", 540, "a")).toContain("no longer");
  });
  it("preserves off-grid endpoints and uses separate lanes for same-person true overlaps", () => {
    const s = fixture(30, 10), c = structuredClone(s.getSnapshot().config); c.startInterval = 1; s.update(c); s.book(date, "service-1", 547, "a");
    c.startInterval = 15; s.update(c); s.connectBusy(date, "a", 555, 30);
    const state = s.getSnapshot(), spans = bookingSpans(state, date), scale = dayScale(state, date, 30);
    const booking = spans.find(s => s.block.kind === "appointment")!, buffer = spans.find(s => s.block.kind === "buffer")!, busy = spans.find(s => s.block.kind === "busy")!;
    expect(spanBounds(booking, scale, range)).toMatchObject({ top: 14, height: 60 });
    expect(booking.lane).toBe(buffer.lane); expect(busy.lane).not.toBe(booking.lane); expect(booking.block.conflict).toBe(true);
    expect(exceptionBlocks(state, date, diaryBlocks(state, date)).length).toBeGreaterThan(0);
  });
  it("preserves stable continuation identity and lane when a range cuts service or buffer", () => {
    const s = fixture(60, 10); s.book(date, "service-1", 540, "a"); const state = s.getSnapshot(), spans = bookingSpans(state, date), scale = dayScale(state, date, 30);
    expect(spanBounds(spans[0], scale, { start: 555, end: 585 })).toEqual({ top: 0, height: 60, continuedBefore: true, continuedAfter: true });
    expect(spanBounds(spans[1], scale, { start: 600, end: 605 })).toMatchObject({ height: 10, continuedAfter: true });
    expect(spans[0].detailIds).toContain(spans[1].block.id);
  });
  it("discloses paged occupancy/conflicts while shared availability still considers every person", () => {
    const s = fixture(); s.book(date, "service-1", 540, "b"); s.connectBusy(date, "b", 555, 15);
    const rendered = html(s, "day", ["a"]); expect(rendered).toContain("Other people pages: 2 occupied items / CONFLICT");
    expect(rendered).not.toContain('data-staff="b"'); expect(rendered).toContain('data-time="540" data-state="Available"');
    const second = html(s, "day", ["b"]); expect(second).toContain('data-state="Booked"'); expect(second).toContain('data-state="Buffer"');
  });
  it("shows split breaks, retained out-of-hours and removed-person exceptions without changing snapshots", () => {
    const s = fixture(); s.book(date, "service-1", 540, "a"); const c = structuredClone(s.getSnapshot().config); c.hours[3] = [{ opens: 555, closes: 600 }, { opens: 660, closes: 720 }]; s.update(c);
    const state = s.getSnapshot(), scale = dayScale(state, date, 30);
    expect(scale.parts.find(p => p.closed)).toMatchObject({ start: 600, end: 660, height: 24 }); expect(html(s)).toContain("Closed 10:00-11:00");
    expect(exceptionBlocks(state, date, diaryBlocks(state, date)).length).toBeGreaterThan(0);
    const removed = structuredClone(state); removed.config.staff = removed.config.staff.filter(p => p.id !== "a");
    expect(exceptionBlocks(removed, date, diaryBlocks(removed, date)).some(b => b.staffId === "a")).toBe(true);
  });
});

// Exercise the actual shared span event handlers, not just their timer primitive.
describe.each(["day", "range"])("%s span event wiring", () => {
  function setup() {
    vi.useFakeTimers(); const show = vi.fn(), pin = vi.fn(), previewNode = {};
    const c = new SpanPreviewInteraction(show, target => target === previewNode);
    const target = { isConnected: true, contains: () => false, focus: vi.fn() } as unknown as HTMLElement;
    const h = c.handlers(["appointment", "buffer"], pin);
    const pointer = { currentTarget: target, pointerType: "mouse" } as PointerEvent<HTMLElement>;
    const focus = { currentTarget: target, relatedTarget: null } as FocusEvent<HTMLElement>;
    return { c, show, pin, target, h, pointer, focus, previewNode };
  }
  it("defaults to click, delays read-only hover, and permits pointer travel into the preview", () => {
    const { c, show, pin, h, pointer } = setup(); h.onPointerEnter(pointer); vi.advanceTimersByTime(500); expect(show).not.toHaveBeenCalled();
    c.preference("hover"); show.mockClear(); h.onPointerEnter(pointer); vi.advanceTimersByTime(449); expect(show).not.toHaveBeenCalled(); vi.advanceTimersByTime(1); expect(show).toHaveBeenLastCalledWith(["appointment", "buffer"]);
    h.onPointerLeave(pointer); vi.advanceTimersByTime(200); c.keep(); vi.advanceTimersByTime(500); expect(show).toHaveBeenLastCalledWith(["appointment", "buffer"]); expect(pin).not.toHaveBeenCalled(); c.dispose();
  });
  it("supports keyboard focus into preview, pinning by native click/Enter, and touch without hover", () => {
    const { c, show, pin, h, pointer, focus, target, previewNode } = setup(); c.preference("hover"); show.mockClear();
    h.onPointerEnter({ ...pointer, pointerType: "touch" } as PointerEvent<HTMLElement>); vi.advanceTimersByTime(500); expect(show).not.toHaveBeenCalled();
    h.onFocus(focus); vi.advanceTimersByTime(450); h.onBlur({ ...focus, relatedTarget: previewNode } as FocusEvent<HTMLElement>); c.keep(); vi.advanceTimersByTime(500); expect(show).toHaveBeenLastCalledWith(["appointment", "buffer"]);
    h.onClick({ currentTarget: target } as MouseEvent<HTMLElement>); expect(pin).toHaveBeenCalledExactlyOnceWith(["appointment", "buffer"], target); expect(show).toHaveBeenLastCalledWith(null); c.dispose();
  });
  it("consumes Escape before the containing dialog and restores focus without immediately reopening", () => {
    const { c, show, h, pointer, focus, target } = setup(); c.preference("hover");
    vi.mocked(target.focus).mockImplementation(() => h.onFocus(focus)); h.onPointerEnter(pointer); vi.advanceTimersByTime(450);
    const e = { key: "Escape", preventDefault: vi.fn(), stopPropagation: vi.fn(), stopImmediatePropagation: vi.fn() };
    expect(c.escape(e)).toBe(true); expect(e.preventDefault).toHaveBeenCalledOnce(); expect(e.stopImmediatePropagation).toHaveBeenCalledOnce(); expect(target.focus).toHaveBeenCalledOnce();
    h.onPointerEnter(pointer); vi.advanceTimersByTime(500); expect(show).toHaveBeenLastCalledWith(null); expect(c.escape(e)).toBe(false); c.dispose();
  });
  it.each(["date", "range", "operator", "reset", "expiry", "unmount"])("cancels a pending preview when the surface is disposed for %s", () => {
    const { c, show, h, pointer } = setup(); c.preference("hover"); show.mockClear(); h.onPointerEnter(pointer); c.dispose(); vi.advanceTimersByTime(1000); expect(show).not.toHaveBeenCalled();
  });
});
