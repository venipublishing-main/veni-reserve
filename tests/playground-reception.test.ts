import { afterEach, describe, expect, it, vi } from "vitest";
import { createElement } from "react";
import { renderToStaticMarkup } from "react-dom/server";
import { MemoryRouter } from "react-router";
import { PlaygroundSession, SESSION_POLICY } from "../app/features/playground/session";
import { diaryBlocks, boardTicks, exceptionBlocks, unoccupiedPeriods, workingSpan, candidateMinute } from "../app/features/playground/diary-projection";
import { clampPosition, DetailPreviewController, ReceptionDraft } from "../app/features/playground/reception-state";
import { PlaygroundDiary } from "../app/features/playground/diary";
import { ReceptionComposer } from "../app/features/playground/reception-composer";
import { ReceptionDialog } from "../app/features/playground/reception-dialog";
import { ReceptionExperience } from "../app/features/booking/reception-experience";

const now = Date.parse("2026-11-10T06:00:00Z"), date = "2026-11-11";
// Independent synthetic fixture; never used to populate the visitor's setup.
function active(clock = () => now) {
  const s = new PlaygroundSession(clock), c = structuredClone(s.getSnapshot().config);
  c.business = { name: "Fictional workshop", category: "", timezone: "Africa/Johannesburg" }; c.location.name = "Synthetic room";
  c.people[0] = { id: "staff-1", name: "Fictional maker", roles: ["Owner"] }; c.staff[0].name = "Fictional maker";
  c.services[0] = { ...c.services[0], name: "Repair", durationMinutes: 30, bufferAfterMinutes: 10, eligibleStaffIds: ["staff-1"] };
  c.hours[3] = [{ opens: 547, closes: 727 }, { opens: 787, closes: 1027 }]; c.startInterval = 20;
  s.update(c); expect(s.complete()).toEqual([]); return s;
}
const selection = { date, staffId: "staff-1", serviceId: "service-1", minute: 547 };
const render = (element: ReturnType<typeof createElement>) => renderToStaticMarkup(createElement(MemoryRouter, null, element));
afterEach(() => vi.useRealTimers());

describe("reception booking uses the same session authority", () => {
  it("commits once and immediately updates diary and public availability", () => {
    const s = active(), draft = new ReceptionDraft(s);
    expect(draft.submit(selection)).toBeNull(); expect(draft.submit(selection)).toContain("already");
    expect(s.getSnapshot().appointments).toHaveLength(1);
    expect(diaryBlocks(s.getSnapshot(), date).filter(b => b.kind === "appointment")).toHaveLength(1);
    expect(s.slots(date, "service-1", "staff-1").some(slot => slot.startMinute === 547)).toBe(false);
    s.cancel(s.getSnapshot().appointments[0].id); expect(draft.submit(selection)).toContain("already");
    expect(s.getSnapshot().appointments).toHaveLength(0);
  });
  it("revalidates races with another booking, busy time and current notice", () => {
    const s = active(), draft = new ReceptionDraft(s); s.book(date, "service-1", 547, "staff-1");
    expect(draft.submit(selection)).toContain("no longer"); s.cancel(s.getSnapshot().appointments[0].id);
    s.connectBusy(date, "staff-1", 547, 60); expect(draft.submit(selection)).toContain("no longer");
    s.disconnect(); expect(draft.submit(selection)).toBeNull();
    let time = Date.parse("2026-11-11T05:00:00Z"); const moving = active(() => time), pending = new ReceptionDraft(moving);
    time += 15 * 60_000; expect(pending.submit(selection)).toContain("no longer");
  });
  it("rejects stale configuration, ineligible people, bad grid and break/closing crossings", () => {
    const s = active(), draft = new ReceptionDraft(s), c = structuredClone(s.getSnapshot().config); c.startInterval = 7; s.update(c);
    expect(draft.submit(selection)).toContain("Configuration changed"); expect(s.getSnapshot().appointments).toEqual([]);
    const fresh = active();
    for (const patch of [{ staffId: "not-bookable" }, { minute: 548 }, { minute: 707 }, { minute: 1007 }]) {
      expect(new ReceptionDraft(fresh).submit({ ...selection, ...patch })).toContain("no longer");
    }
  });
  it.each(["hard", "soft", "expiry"])("invalidates an open composer on %s reset and cannot commit into a replacement session", action => {
    let time = now; const s = active(() => time), draft = new ReceptionDraft(s);
    if (action === "hard") s.hardReset(); else if (action === "soft") s.softReset(); else time += SESSION_POLICY.inactivityMs;
    expect(draft.submit(selection)).toContain("expired or was reset"); expect(s.getSnapshot().appointments).toEqual([]);
  });
  it("renders prefilled date/person/candidate and same-adapter submit controls without public navigation", () => {
    const html = render(createElement(ReceptionComposer, { session: active(), seed: { date, staffId: "staff-1", minute: 547 }, onClose: () => {}, returnFocus: null }));
    expect(html).toContain('value="547" selected=""'); expect(html).toContain('value="2026-11-11"');
    expect(html).toContain("Create synthetic booking"); expect(html).toContain("Dock left"); expect(html).toContain("Recentre");
    expect(html).not.toContain('href="/demo');
  });
});

describe("compact board projection without a second availability engine", () => {
  it("embeds the shared Agenda without changing the default VVB workspace", () => {
    const embedded = render(createElement(ReceptionExperience, { today: date, embedded: true }));
    const original = render(createElement(ReceptionExperience, { today: date }));
    expect(embedded).not.toContain('aria-label="Workspace preview"'); expect(original).toContain('aria-label="Workspace preview"');
    expect(embedded).toContain("Scheduled"); expect(original).toContain("Scheduled");
  });
  it("derives only the working span, sparse ticks and open gaps including breaks", () => {
    const s = active(); expect(workingSpan(s.getSnapshot(), date)).toEqual({ start: 547, end: 1027 });
    expect(boardTicks(547, 1027).length).toBeLessThanOrEqual(8);
    expect(unoccupiedPeriods(s.getSnapshot(), date, "staff-1")).toEqual([{ start: 547, end: 727 }, { start: 787, end: 1027 }]);
    expect(candidateMinute(s.getSnapshot(), date, 550)).toBe(567);
    s.book(date, "service-1", 547, "staff-1"); s.connectBusy(date, "staff-1", 607, 60);
    expect(unoccupiedPeriods(s.getSnapshot(), date, "staff-1")).toEqual([{ start: 587, end: 607 }, { start: 667, end: 727 }, { start: 787, end: 1027 }]);
    // A visible 20-minute gap is not enough for the 40-minute occupied interval.
    expect(new ReceptionDraft(s).submit({ ...selection, minute: 587 })).toContain("no longer");
  });
  it("keeps out-of-hours and removed-person snapshots in explicit exception data", () => {
    const s = active(); s.book(date, "service-1", 547, "staff-1"); const a = s.getSnapshot().appointments[0];
    const c = structuredClone(s.getSnapshot().config); c.hours[3] = [{ opens: 787, closes: 1027 }]; s.update(c);
    expect(exceptionBlocks(s.getSnapshot(), date).map(b => b.kind)).toEqual(["appointment", "buffer"]);
    c.staff = []; s.update(c); expect(exceptionBlocks(s.getSnapshot(), date)).toHaveLength(2); expect(s.getSnapshot().appointments[0]).toEqual(a);
    const html = render(createElement(PlaygroundDiary, { session: s, today: date })); expect(html).toContain("Exceptions: 2 occupied items");
  });
  it("renders closed days compactly, with no permanent detail list or page-jump anchors", () => {
    const s = active(); s.selectDiaryDate("2026-11-15");
    const html = render(createElement(PlaygroundDiary, { session: s, today: date }));
    expect(html).toContain("Closed on this day"); expect(html).not.toContain("1440px"); expect(html).not.toContain('href="#detail-');
    expect(html).not.toContain("Readable agenda and block details"); expect(html).toContain("New booking");
  });
  it("retains all dense items and conflict labels while visual precision is independent of interval", () => {
    const s = active(); s.book(date, "service-1", 547, "staff-1"); s.connectBusy(date, "staff-1", 567, 30);
    const before = diaryBlocks(s.getSnapshot(), date), c = structuredClone(s.getSnapshot().config); c.startInterval = 1; s.update(c);
    expect(diaryBlocks(s.getSnapshot(), date)).toEqual(before);
    const html = render(createElement(PlaygroundDiary, { session: s, today: date }));
    expect(html).toContain("3 occupied items / exact details"); expect(html).toContain("CONFLICT"); expect(html).toContain("Fictional maker day lane");
  });
});

describe("read-only delayed preview and movable composer safeguards", () => {
  it("defaults to click; hover waits, then stays while pointer enters preview", () => {
    vi.useFakeTimers(); const show = vi.fn(), controller = new DetailPreviewController(show);
    controller.enter(["one"]); vi.advanceTimersByTime(1000); expect(show).not.toHaveBeenCalled();
    controller.preference("hover"); show.mockClear(); controller.enter(["one"]); vi.advanceTimersByTime(449); expect(show).not.toHaveBeenCalled();
    vi.advanceTimersByTime(1); expect(show).toHaveBeenLastCalledWith(["one"]);
    controller.leave(); vi.advanceTimersByTime(100); controller.keep(); vi.advanceTimersByTime(1000); expect(show).toHaveBeenLastCalledWith(["one"]);
    controller.dismiss(); expect(show).toHaveBeenLastCalledWith(null); controller.dispose();
  });
  it("changing preference or disposing/resetting cancels delayed results", () => {
    vi.useFakeTimers(); const show = vi.fn(), controller = new DetailPreviewController(show);
    controller.preference("hover"); controller.enter(["old"]); controller.preference("click"); show.mockClear(); vi.runAllTimers(); expect(show).not.toHaveBeenCalled();
    controller.preference("hover"); controller.enter(["old"]); controller.dispose(); show.mockClear(); vi.runAllTimers(); expect(show).not.toHaveBeenCalled();
  });
  it("restores focus after explicit dismissal without leaving a delayed preview queued", () => {
    vi.useFakeTimers(); const events: string[] = [], controller = new DetailPreviewController(ids => events.push(ids ? "show" : "hide"));
    controller.preference("hover"); controller.enter(["one"]); vi.advanceTimersByTime(450);
    controller.enter(["two"]); controller.dismiss(() => events.push("restore-focus"));
    expect(events.slice(-2)).toEqual(["hide", "restore-focus"]);
    vi.runAllTimers(); expect(events.at(-1)).toBe("restore-focus");
  });
  it.each([{ x: -500, y: -100 }, { x: 3000, y: 2000 }, { x: 400, y: 100 }])("clamps drag/dock position inside viewport: %o", point => {
    const result = clampPosition(point, { width: 1366, height: 768 }, { width: 460, height: 550 });
    expect(result.x).toBeGreaterThanOrEqual(12); expect(result.x + 460).toBeLessThanOrEqual(1354);
    expect(result.y).toBeGreaterThanOrEqual(12); expect(result.y + 550).toBeLessThanOrEqual(756);
  });
  it("uses a named native dialog with explicit close, keyboard movement and non-drag controls", () => {
    const html = render(createElement(ReceptionDialog, { title: "Test composer", children: "Synthetic only", movable: true, onClose: () => {}, returnFocus: null }));
    expect(html).toContain("<dialog"); expect(html).toContain('aria-labelledby="reception-dialog-title"'); expect(html).toContain("arrow keys");
    expect(html).toContain("Dock right"); expect(html).toContain(">Close</button>");
  });
});
