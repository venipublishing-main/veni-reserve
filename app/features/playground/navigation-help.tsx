import { useEffect } from "react";
import { ReceptionDialog } from "./reception-dialog";

/** Shared by first-use help and the isolated release Guide. */
export function NavigationInstructions() {
  return <ul className="space-y-2 text-sm">
    <li>Wheel over the timetable = zoom around the pointer. Ctrl/Meta wheel keeps browser zoom.</li>
    <li>Hold the wheel/middle button and drag = pan. Release to stop.</li>
    <li>Click a white time = new booking. Click a coloured booking = details.</li>
    <li>Fit day = whole-day overview. Readable restores readable time detail.</li>
    <li>Week uses the same timetable across seven dated columns. Scroll horizontally, pan, or use Previous/Next day columns. The dates share one clock scale.</li>
    <li>Month markers mean has bookings, not fully booked. Click a date to pin its summary, then New booking, Open day, Open week or appointment details. New booking keeps you in Month and uses that date.</li>
    <li>Compare up to eight floating pins without blocking the timetable. Drag a pin header, or focus it and use arrows/Home. Close or Escape dismisses one; Close all clears pins. On a phone, switch pins in the tray or minimise them to use the board.</li>
    <li>Use Back / Change practitioner or Change date &amp; time to recover an unavailable choice. White-time entry keeps its exact start until you explicitly change time.</li>
    <li>To move a booking, select an authorised simulated operator, open pinned details and choose Move appointment. Review OLD → NEW and Confirm move; Cancel move preserves the original. Dragging only pans the timetable.</li>
    <li>Alternatives: +/−, Earlier/Later and person buttons. Hand lets you drag with the left button or touch. Focus the timetable for Space-drag, arrow keys, +/− or Home (Fit day). Touch can use buttons or Agenda; pinch zoom is not implemented.</li>
  </ul>;
}

/** Wait for foreground dialogs to close; never stack first-use help over them. */
export function useFirstNavigationHelp(pending: boolean, open: () => void) {
  useEffect(() => {
    if (!pending) return;
    return queueNavigationHelp(open);
  }, [pending, open]);
}
export function queueNavigationHelp(open: () => void) {
    let opened = false;
    const attempt = () => {
      if (opened || document.querySelector("dialog[open]")) return;
      opened = true; open();
    };
    const observer = new MutationObserver(attempt);
    observer.observe(document.body, { subtree: true, childList: true, attributes: true, attributeFilter: ["open"] });
    // Allow sibling dialog effects to establish their modal layer first.
    const timer = setTimeout(attempt, 0);
    return () => { opened = true; clearTimeout(timer); observer.disconnect(); };
}

export function NavigationHelp({ close, returnFocus }: { close: () => void; returnFocus: HTMLElement | null }) {
  return <ReceptionDialog title="Reception Day navigation" onClose={close} returnFocus={returnFocus}>
    <p>You can skip this guide and reopen it with Navigation help.</p>
    <NavigationInstructions />
    <button type="button" className="rounded-lg border px-3 py-2 font-semibold" onClick={close}>Got it / Start exploring</button>
  </ReceptionDialog>;
}
