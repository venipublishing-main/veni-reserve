import { describe, expect, it, vi } from "vitest";
import { createElement, isValidElement } from "react";
import type { ReactNode, ReactElement } from "react";
import { renderToStaticMarkup } from "react-dom/server";
import { readFileSync } from "node:fs";
import { PlaygroundSession, editPerson } from "../app/features/playground/session";
import { PinnedPanels, pinKey, pinTitle, pinsForSession, resolvePinRef, monthBookingSeed, pinEscapeAllowed, MAX_PINS } from "../app/features/playground/pinned-state";
import { FloatingPanel } from "../app/features/playground/floating-pins";
import { DialogDrag, MoveDraft, ReceptionDraft } from "../app/features/playground/reception-state";
import { DaySummary, monthOverview } from "../app/features/playground/month-board";
const date = "2026-11-11", now = Date.parse("2026-11-10T06:00Z");
function fixture(clock = () => now) {
  const s = new PlaygroundSession(clock); let c = structuredClone(s.getSnapshot().config);
  c.business.name = "Synthetic pins"; c.business.timezone = "Africa/Johannesburg";
  c.people[0].name = "Synthetic practitioner"; c.people[0].roles = ["Owner"]; c = editPerson(c, c.people[0], true);
  c.services[0] = { ...c.services[0], name: "Synthetic service", durationMinutes: 60, bufferAfterMinutes: 10, eligibleStaffIds: ["staff-1"] };
  s.update(c); expect(s.complete()).toEqual([]); s.selectDiaryDate(date); expect(s.book(date, "service-1", 540, "staff-1")).toBeNull(); return s;
}
function buttons(node: ReactNode): ReactElement<{ children?: ReactNode; onClick?: (e: { currentTarget: HTMLElement }) => void }>[] {
  if (Array.isArray(node)) return node.flatMap(buttons);
  if (!isValidElement<{ children?: ReactNode }>(node)) return [];
  return [...(node.type === "button" ? [node] : []), ...buttons(node.props.children)];
}
describe("memory-only shared pins", () => {
  it("keeps four independent pins, positions, z-order and duplicate focus without eviction", () => {
    const m = new PinnedPanels(0), listener = vi.fn(), stop = m.subscribe(listener);
    for (const date of ["2026-11-11", "2026-11-12", "2026-12-31", "2027-01-01"]) expect(m.open({ kind: "day", date }, null)).toBeNull();
    const [a, b] = m.getSnapshot(); m.position(a.key, { x: 100, y: 90 });
    expect(m.getSnapshot()[1].point).toEqual(b.point);
    const prior = m.getSnapshot().find(p => p.key === a.key)!; m.open(a.source, null);
    expect(m.getSnapshot()).toHaveLength(4); expect(m.getSnapshot().at(-1)?.key).toBe(a.key); expect(m.getSnapshot().at(-1)?.request).toBeGreaterThan(prior.request);
    expect(m.getSnapshot().at(-1)?.point).toEqual({ x: 100, y: 90 });
    m.close(b.key); expect(m.getSnapshot()).toHaveLength(3); m.clear(); expect(m.getSnapshot()).toEqual([]); expect(listener).toHaveBeenCalled(); stop();
  });
  it("states the bounded limit and still focuses existing pins at capacity", () => {
    const m = new PinnedPanels(0); for (let i = 0; i < MAX_PINS; i++) m.open({ kind: "day", date: `2026-11-${10 + i}` }, null);
    expect(m.open({ kind: "day", date: "2027-01-01" }, null)).toContain("Close all"); expect(m.getSnapshot()).toHaveLength(MAX_PINS);
    expect(m.open(m.getSnapshot()[0].source, null)).toBeNull(); expect(m.getSnapshot()).toHaveLength(MAX_PINS);
  });
  it("deduplicates appointment plus buffer, but a buffer-only pin retains its association", () => {
    const s = fixture(), a = s.getSnapshot().appointments[0], m = pinsForSession(s);
    const refs = m.references(s.getSnapshot(), date, [a.id, `${a.id}-buffer`]); expect(refs).toHaveLength(1);
    expect(pinKey({ kind: "records", refs })).toBe(pinKey({ kind: "records", refs: m.references(s.getSnapshot(), date, [a.id]) }));
    const buffer = m.references(s.getSnapshot(), date, [`${a.id}-buffer`])[0]; expect(buffer.kind).toBe("buffer"); expect(buffer.id).toBe(a.id);
    expect(resolvePinRef(s.getSnapshot(), buffer).blocks.map(b => b.kind)).toEqual(["buffer"]);
  });
  it("refreshes a pinned identity after cross-day move and shows removal rather than another booking", () => {
    const s = fixture(), a = s.getSnapshot().appointments[0], m = pinsForSession(s), refs = m.references(s.getSnapshot(), date, [a.id]);
    m.open({ kind: "records", refs }, null); const key = m.getSnapshot()[0].key;
    expect(new MoveDraft(s, a.id).submit({ date: "2026-11-12", minute: 600, staffId: "staff-1" }, "staff-1")).toBeNull();
    const resolved = resolvePinRef(s.getSnapshot(), refs[0]); expect(resolved.date).toBe("2026-11-12"); expect(resolved.blocks[0].start).toBe(600);
    expect(pinTitle(s.getSnapshot(), m.getSnapshot()[0].source)).toContain("2026-11-12"); expect(m.getSnapshot()[0].key).toBe(key);
    s.cancel(a.id); s.book(date, "service-1", 540, "staff-1"); expect(resolvePinRef(s.getSnapshot(), refs[0]).blocks).toEqual([]);
    expect(m.getSnapshot()[0].key).toBe(key);
  });
  it("does not attach a disconnected busy pin to a replacement with identical times", () => {
    const s = fixture(), m = pinsForSession(s); s.connectBusy(date, "staff-1", 800, 30);
    const ref = m.references(s.getSnapshot(), date, ["external-busy"])[0]; expect(ref.kind).toBe("busy");
    s.selectDiaryDate("2026-11-12"); expect(resolvePinRef(s.getSnapshot(), ref).blocks).toHaveLength(1);
    s.disconnect(); s.connectBusy(date, "staff-1", 800, 30); expect(resolvePinRef(s.getSnapshot(), ref).blocks).toEqual([]);
    expect(m.references(s.getSnapshot(), date, ["external-busy"])[0].id).not.toBe(ref.id);
  });
  it("survives view/date/configuration navigation within its session, not another session", () => {
    const s = fixture(), m = pinsForSession(s); m.open({ kind: "day", date }, null);
    s.selectDiaryDate("2027-01-01"); s.view("configure"); s.update(structuredClone(s.getSnapshot().config)); s.view("reception");
    expect(pinsForSession(s)).toBe(m); expect(m.getSnapshot()).toHaveLength(1); expect(pinsForSession(fixture()).getSnapshot()).toEqual([]);
  });
  it.each(["soft", "hard", "expiry"])("clears references and positions on %s reset", mode => {
    let time = now; const s = fixture(() => time), m = pinsForSession(s); m.open({ kind: "day", date }, null);
    if (mode === "soft") s.softReset(); else if (mode === "hard") s.hardReset(); else { time += s.policy.inactivityMs + 1; s.checkExpiry(); }
    expect(m.getSnapshot()).toEqual([]);
  });
  it("keeps pin dragging independent and stops safely after cancellation", () => {
    const a = new DialogDrag(), b = new DialogDrag(), viewport = { width: 1000, height: 800 }, size = { width: 360, height: 300 };
    a.start(1, { x: 50, y: 50 }, { x: 20, y: 20 }); b.start(2, { x: 200, y: 200 }, { x: 180, y: 180 });
    expect(a.move(2, { x: 100, y: 100 }, viewport, size)).toBeNull();
    expect(a.move(1, { x: 9999, y: -30 }, viewport, size)).toEqual({ x: 628, y: 12 });
    expect(b.move(2, { x: 210, y: 220 }, viewport, size)).toEqual({ x: 190, y: 200 });
    a.stop(); expect(a.move(1, { x: 100, y: 100 }, viewport, size)).toBeNull();
  });
  it("gives modal and handled preview/gesture Escape priority over the active pin", () => {
    expect(pinEscapeAllowed("Escape", false, false, false)).toBe(true);
    expect(pinEscapeAllowed("Escape", true, false, false)).toBe(false); expect(pinEscapeAllowed("Escape", false, true, false)).toBe(false);
    expect(pinEscapeAllowed("Escape", false, false, true)).toBe(false); expect(pinEscapeAllowed("Enter", false, false, false)).toBe(false);
  });
  it("renders accessible non-modal regions and keeps actual composer modality unchanged", () => {
    const m = new PinnedPanels(0); m.open({ kind: "day", date }, null);
    const html = renderToStaticMarkup(createElement(FloatingPanel, { pin: m.getSnapshot()[0], manager: m, title: date, active: true, index: 0, close: vi.fn(), children: "Synthetic" }));
    expect(html).toContain('role="region"'); expect(html).toContain("Recentre"); expect(html).toContain("arrow keys"); expect(html).not.toMatch(/<dialog|aria-modal|inert|title=/);
    const source = readFileSync(new URL("../app/features/playground/floating-pins.tsx", import.meta.url), "utf8");
    expect(source).toContain("createPortal"); expect(source).toContain("setPointerCapture"); expect(source).toContain("onLostPointerCapture"); expect(source).not.toContain("showModal");
    const modal = readFileSync(new URL("../app/features/playground/reception-dialog.tsx", import.meta.url), "utf8"); expect(modal).toContain("dialog.showModal()");
    const css = readFileSync(new URL("../app/app.css", import.meta.url), "utf8"); expect(css).toContain('.floating-pin[data-active=false] { display: none; }'); expect(css).toContain('.floating-pins[data-minimized=true]');
  });
});
describe("Month direct booking uses shared modal composer", () => {
  it("passes the pinned date from all day-summary actions while the Month selection stays unchanged", () => {
    const s = fixture(), newBooking = vi.fn(), openDay = vi.fn(), openWeek = vi.fn(), target = {} as HTMLElement;
    const tree = DaySummary({ state: s.getSnapshot(), date: "2026-12-31", newBooking, openDay, openWeek });
    for (const [text, callback] of [["New booking", newBooking], ["Open day", openDay], ["Open week", openWeek]] as const) {
      const action = buttons(tree).find(b => b.props.children === text)!; action.props.onClick?.({ currentTarget: target }); expect(callback.mock.calls[0][0]).toBe("2026-12-31");
    }
    expect(s.getSnapshot().diaryDate).toBe(date); expect(s.getSnapshot().appointments).toHaveLength(1);
    const hover = renderToStaticMarkup(createElement(DaySummary, { state: s.getSnapshot(), date })); expect(hover).not.toContain("<button");
  });
  it("keeps valid current service/operator, drops invalid choices, and never invents a start", () => {
    const s = fixture(), state = s.getSnapshot();
    expect(monthBookingSeed(state, "2027-01-01", "service-1", "staff-1")).toEqual({ date: "2027-01-01", serviceId: "service-1", staffId: "staff-1", actorId: "staff-1" });
    const invalid = monthBookingSeed(state, date, "gone", "gone"); expect(invalid.serviceId).toBeUndefined(); expect(invalid.actorId).toBe(""); expect(invalid.minute).toBeUndefined(); expect(invalid.aggregateAvailability).toBeUndefined();
  });
  it("rejects closed/out-of-horizon submissions then allows recovery with one booking and live summary counts", () => {
    const s = fixture(), draft = new ReceptionDraft(s), count = s.getSnapshot().appointments.length;
    expect(draft.submit({ date: "2026-11-15", staffId: "staff-1", serviceId: "service-1", minute: 540 })).not.toBeNull();
    expect(draft.submit({ date: "2028-01-01", staffId: "staff-1", serviceId: "service-1", minute: 540 })).not.toBeNull(); expect(s.getSnapshot().appointments).toHaveLength(count);
    expect(draft.submit({ date: "2026-11-12", staffId: "staff-1", serviceId: "service-1", minute: 540 })).toBeNull();
    expect(draft.submit({ date: "2026-11-12", staffId: "staff-1", serviceId: "service-1", minute: 540 })).toContain("already");
    expect(monthOverview(s.getSnapshot(), date).find(d => d.date === "2026-11-12")?.appointments).toHaveLength(1);
    expect(s.slots("2026-11-12", "service-1", "staff-1").some(s => s.startMinute === 540)).toBe(false);
  });
});
