/** Keep compatible choices while returning to a selection step. No booking mutation. */
export function compatibleMinute(minute: number | null, slots: readonly { startMinute: number }[]) {
  return minute !== null && slots.some(s => s.startMinute === minute) ? minute : null;
}
export class SubmissionGate {
  private complete = false;
  run(submit: () => string | null) {
    if (this.complete) return "This booking has already been submitted.";
    const error = submit(); if (!error) this.complete = true;
    return error;
  }
}
