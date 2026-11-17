/** Shared customer/reception time-button appearance; actions stay with each adapter. */
export function timeButtonClass(selected = false) {
  return `rounded-xl border py-3 text-sm font-semibold focus-visible:outline-2 focus-visible:outline-offset-2 focus-visible:outline-[var(--booking-primary)] ${selected ? "border-[var(--booking-primary)] bg-[var(--booking-primary)] text-[var(--booking-on-primary)]" : "border-[#dce7dc] bg-white text-[#38594a] hover:border-[#8daa94]"}`;
}
