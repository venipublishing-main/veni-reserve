import { describe, expect, it } from "vitest";
import { PlaygroundSession, editPerson, SESSION_POLICY } from "../app/features/playground/session";
import { MoveDraft } from "../app/features/playground/reception-state";
const now = Date.parse("2026-11-10T06:00Z"), date = "2026-11-11";
function fixture(clock = () => now, bookingDate = date) {
  const s = new PlaygroundSession(clock); let c = structuredClone(s.getSnapshot().config);
  c.business.name = "Synthetic moves"; c.business.timezone = "Africa/Johannesburg";
  c.people = [{ id: "a", name: "Synthetic A", roles: ["Staff"] }, { id: "b", name: "Synthetic B", roles: ["Staff"] }, { id: "owner", name: "Synthetic owner", roles: ["Owner"] }]; c.staff = [];
  for (const p of c.people) c = editPerson(c, p, true);
  c.services[0] = { ...c.services[0], name: "Original service", durationMinutes: 60, bufferAfterMinutes: 15, eligibleStaffIds: ["a", "b", "owner"] };
  s.update(c); expect(s.complete()).toEqual([]); expect(s.book(bookingDate, "service-1", 540, "a")).toBeNull(); return s;
}
describe("atomic snapshot-preserving moves", () => {
  it("overlaps its own interval, preserves identity/count/snapshots, and releases old capacity", () => {
    const s = fixture(), a = s.getSnapshot().appointments[0], draft = new MoveDraft(s, a.id), before = s.getSnapshot();
    expect(s.moveSlots(a.id, date, "a", "a").some(t => t.startMinute === 555)).toBe(true); expect(s.getSnapshot()).toBe(before);
    expect(draft.submit({ date, minute: 555, staffId: "a" }, "a")).toBeNull();
    const moved = s.getSnapshot().appointments[0]; expect(moved.id).toBe(a.id); expect(moved.customerLabel).toBe(a.customerLabel); expect(moved.durationMinutes).toBe(60); expect(moved.bufferAfterMinutes).toBe(15);
    expect(moved.moveHistory).toHaveLength(1); expect(s.getSnapshot().appointments).toHaveLength(1);
    expect(draft.submit({ date, minute: 630, staffId: "a" }, "a")).toContain("already");
    const across = new MoveDraft(s, a.id); expect(across.submit({ date: "2026-11-12", minute: 540, staffId: "b" }, "owner")).toBeNull();
    expect(s.slots(date, "service-1", "a").some(t => t.startMinute === 540)).toBe(true);
  });
  it.each([["", "a"], ["b", "b"], ["a", "b"]])("rejects scope %s to %s in the adapter", (actor, target) => {
    const s = fixture(), a = s.getSnapshot().appointments[0];
    expect(new MoveDraft(s, a.id).submit({ date, minute: 660, staffId: target }, actor)).toContain("cannot move"); expect(s.getSnapshot().appointments[0]).toBe(a);
  });
  it("rejects hard and external conflicts, and preserves source on cancellation/failure", () => {
    const s = fixture(), a = s.getSnapshot().appointments[0], draft = new MoveDraft(s, a.id);
    s.book(date, "service-1", 660, "b"); expect(draft.submit({ date, minute: 660, staffId: "b" }, "owner")).toContain("no longer available");
    s.connectBusy(date, "a", 800, 60); expect(draft.submit({ date, minute: 810, staffId: "a" }, "owner")).toContain("no longer available");
    expect(s.getSnapshot().appointments[0]).toBe(a); // Discarding a draft needs no mutation.
  });
  it("requires fresh destination buffer consent and never transfers old waivers", () => {
    const s = fixture(), first = s.getSnapshot().appointments[0];
    s.book(date, "service-1", 660, "a"); const moving = s.getSnapshot().appointments[1], draft = new MoveDraft(s, moving.id);
    expect(draft.submit({ date, minute: 600, staffId: "a" }, "owner")).toContain("freshly confirm");
    expect(draft.submit({ date, minute: 600, staffId: "a" }, "owner", [first.id], s.moveBufferConsent(moving.id, date, 600, "a"))).toBeNull();
    expect(s.getSnapshot().appointments.find(a => a.id === moving.id)?.bufferOverride?.appointmentIds).toEqual([first.id]);
    expect(new MoveDraft(s, first.id).submit({ date, minute: 800, staffId: "a" }, "owner")).not.toBeNull(); // off-grid
    expect(new MoveDraft(s, first.id).submit({ date, minute: 810, staffId: "a" }, "owner")).toBeNull();
    expect(s.getSnapshot().appointments.find(a => a.id === moving.id)?.bufferOverride).toBeUndefined();
  });
  it("rejects source moved/cancelled and configuration-stale drafts, but no-op is harmless", () => {
    const s = fixture(), a = s.getSnapshot().appointments[0], stale = new MoveDraft(s, a.id);
    expect(new MoveDraft(s, a.id).submit({ date, minute: 540, staffId: "a" }, "a")).toBeNull(); expect(s.getSnapshot().appointments[0]).toBe(a);
    expect(new MoveDraft(s, a.id).submit({ date, minute: 630, staffId: "a" }, "a")).toBeNull();
    expect(stale.submit({ date, minute: 720, staffId: "a" }, "a")).toContain("changed or was cancelled");
    const cancelled = new MoveDraft(s, a.id); s.cancel(a.id); expect(cancelled.submit({ date, minute: 540, staffId: "a" }, "a")).toContain("cancelled");
    const t = fixture(), changed = new MoveDraft(t, t.getSnapshot().appointments[0].id); t.update(structuredClone(t.getSnapshot().config)); expect(changed.submit({ date, minute: 630, staffId: "a" }, "a")).toContain("Configuration changed");
  });
  it.each(["hard", "soft", "expiry"])("invalidates %s without resurrecting an appointment", reset => {
    let clock = now; const s = fixture(() => clock), draft = new MoveDraft(s, s.getSnapshot().appointments[0].id);
    if (reset === "hard") s.hardReset(); else if (reset === "soft") s.softReset(); else clock += SESSION_POLICY.inactivityMs;
    expect(draft.submit({ date, minute: 630, staffId: "a" }, "a")).toContain("expired or was reset"); expect(s.getSnapshot().appointments).toEqual([]);
  });
  it("uses recorded duration/buffer with current eligibility, notice and horizon", () => {
    const s = fixture(), a = s.getSnapshot().appointments[0], c = structuredClone(s.getSnapshot().config); c.services[0].durationMinutes = 5; c.services[0].bufferAfterMinutes = 0; s.update(c);
    expect(s.moveSlots(a.id, date, "a", "a").some(t => t.startMinute === 990)).toBe(false);
    expect(s.moveSlots(a.id, "2026-12-01", "a", "a")).toEqual([]);
    expect(new MoveDraft(s, a.id).submit({ date, minute: 630, staffId: "a" }, "a")).toBeNull(); expect(s.getSnapshot().appointments[0].durationMinutes).toBe(60);
  });
  it.each(["Reception", "Admin"] as const)("allows %s cross-practitioner moves but still rejects ineligible destinations", role => {
    const s = fixture(), c = structuredClone(s.getSnapshot().config); c.people[2].roles = [role]; c.services[0].eligibleStaffIds = ["a", "b"]; s.update(c);
    const a = s.getSnapshot().appointments[0];
    expect(new MoveDraft(s, a.id).submit({ date, minute: 630, staffId: "owner" }, "owner")).toContain("no longer available");
    expect(new MoveDraft(s, a.id).submit({ date, minute: 630, staffId: "b" }, "owner")).toBeNull();
  });
  it("moves across month/year boundaries within the same booking horizon", () => {
    const s = fixture(() => Date.parse("2026-12-28T06:00Z"), "2026-12-30"), source = s.getSnapshot().appointments[0];
    expect(new MoveDraft(s, source.id).submit({ date: "2027-01-04", minute: 540, staffId: "b" }, "owner")).toBeNull();
    expect(s.getSnapshot().appointments).toHaveLength(1); expect(s.getSnapshot().appointments[0].date).toBe("2027-01-04");
  });
  it("rejects unsupported source removals without deleting the retained booking", () => {
    for (const removed of ["service", "person"]) {
      const s = fixture(), a = s.getSnapshot().appointments[0], c = structuredClone(s.getSnapshot().config);
      if (removed === "service") c.services = []; else c.staff = c.staff.filter(p => p.id !== "a"); s.update(c);
      expect(new MoveDraft(s, a.id).submit({ date, minute: 630, staffId: "b" }, "owner")).toContain("no longer supported");
      expect(s.getSnapshot().appointments[0]).toBe(a);
    }
  });
  it("rejects consent for an old version of the same destination buffer", () => {
    const s = fixture(); s.cancel(s.getSnapshot().appointments[0].id);
    const c = structuredClone(s.getSnapshot().config); c.services[0].bufferAfterMinutes = 60; s.update(c);
    s.book(date, "service-1", 540, "a"); s.book(date, "service-1", 780, "a");
    const [buffer, source] = s.getSnapshot().appointments, draft = new MoveDraft(s, source.id), consent = s.moveBufferConsent(source.id, date, 645, "a");
    expect(new MoveDraft(s, buffer.id).submit({ date, minute: 555, staffId: "a" }, "owner")).toBeNull();
    expect(draft.submit({ date, minute: 645, staffId: "a" }, "owner", [buffer.id], consent)).toContain("freshly confirm");
    expect(draft.submit({ date, minute: 645, staffId: "a" }, "owner", [buffer.id], s.moveBufferConsent(source.id, date, 645, "a"))).toBeNull();
  });
});
