import type { BookingAdapter } from "./session";

/** Fail-closed boundary, not a production booking implementation or endpoint.
 * A future server transport requires Membership/capabilities, authoritative
 * validation, transactions, idempotency and an outbox. Never select by client flag. */
export const productionBookingAdapter: BookingAdapter = {
  kind: "production",
  slots() { throw new Error("Production booking is not implemented."); },
  book() { throw new Error("Production booking is not implemented."); },
  cancel() { throw new Error("Production booking is not implemented."); },
};
