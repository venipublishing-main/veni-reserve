import { describe, expect, it, vi } from "vitest";
import { compatibleMinute, SubmissionGate } from "../app/features/booking/draft-navigation";
import { readFileSync } from "node:fs";
describe("recoverable booking drafts", () => {
  it("retains a compatible time and drops only stale dependent time", () => {
    expect(compatibleMinute(540, [{ startMinute: 540 }])).toBe(540);
    expect(compatibleMinute(540, [])).toBeNull();
    expect(compatibleMinute(null, [{ startMinute: 540 }])).toBeNull();
  });
  it("allows recovery after failure but cannot submit twice after success", () => {
    const gate = new SubmissionGate(), commit = vi.fn(() => null);
    expect(gate.run(() => "No slot")).toBe("No slot");
    expect(gate.run(commit)).toBeNull(); expect(gate.run(commit)).toContain("already"); expect(commit).toHaveBeenCalledOnce();
  });
  it("keeps explicit recovery buttons outside required-field submission and releases white-time anchoring explicitly", () => {
    const read = (path: string) => readFileSync(new URL(path, import.meta.url), "utf8");
    const customer = read("../app/features/booking/booking-experience.tsx"), composer = read("../app/features/playground/reception-composer.tsx");
    expect(customer).toContain("Change practitioner"); expect(customer).toContain("Change date &amp; time");
    expect(customer).toContain("panel.current?.focus()"); expect(customer).not.toContain("history.back");
    expect(composer.indexOf('aria-label="Change booking selection"')).toBeLessThan(composer.indexOf('<form'));
    expect(composer).toContain("disabled={anchored}"); expect(composer).toContain("setAnchored(false)");
    expect(composer).not.toContain('setService(""); setMinute(-1)');
  });
});
