import { createRoot } from "react-dom/client";
import { BrowserRouter, useLocation } from "react-router";
import { useRef, useState } from "react";
import Playground from "../app/routes/playground";
import { ReceptionDialog } from "../app/features/playground/reception-dialog";
import { feedbackTemplate } from "./feedback";
import "./preview.css";
declare const __PREVIEW_SHA__: string;

function Feedback({ close, trigger }: { close: () => void; trigger: HTMLElement | null }) {
  const [fields, setFields] = useState({ task: "", expected: "", actual: "", device: "" });
  const [status, setStatus] = useState("");
  const text = feedbackTemplate(__PREVIEW_SHA__, fields);
  return <ReceptionDialog title="Preview guide and feedback" onClose={close} returnFocus={trigger}>
    <p>Fictional businesses and simulated bookings only. Nothing here creates a real appointment, account, message or integration.</p>
    <p>Setup, logos and bookings stay in this tab's memory. Refreshing, leaving, closing or inactivity expiry loses the session. Restore tutorial baseline removes experiments; Start over clears the setup.</p>
    <p>Reception: wheel to zoom, middle-drag to pan. Alternatives: +/−, Fit day, Readable, minimap, Hand, focused Space-drag or arrow keys. Agenda is the list alternative.</p>
    <p>Limits: one location, three bookable setup people, ten services, 200 synthetic appointments, two-hour notice and fourteen-day horizon. Locality lookup is an offline catalogue, not address verification. Calendar and operator permissions are simulated. Week/Month views and further polish are backlog items.</p>
    <p>No analytics or session recording is added. Ordinary hosting request logs may exist. Do not put private information in URLs or feedback. This public preview is not confidential.</p>
    <p>Enter only the feedback you want to share. No business configuration, staff emails, logos or appointment records are attached. Copying does not submit anything; send it to the person who invited you.</p>
    {(["task", "expected", "actual", "device"] as const).map(key => <label key={key} className="block text-sm capitalize">{key}<textarea maxLength={2000} className="block w-full rounded border p-2" value={fields[key]} onChange={e => setFields({ ...fields, [key]: e.target.value })} /></label>)}
    <button className="rounded border px-3 py-2" type="button" onClick={async () => {
      try { await navigator.clipboard.writeText(text); setStatus("Copied to your clipboard. Not submitted."); }
      catch { setStatus("Clipboard unavailable. Select and copy the template below manually. Nothing was submitted."); }
    }}>Copy feedback template</button>
    <p role="status">{status}</p><label className="block text-sm">Review/copy manually<textarea readOnly className="h-40 w-full rounded border p-2" value={text} /></label>
  </ReceptionDialog>;
}
function Preview() {
  const [open, setOpen] = useState(false), trigger = useRef<HTMLButtonElement>(null), location = useLocation();
  if (!["/", "/playground", "/playground/"].includes(location.pathname)) return <main><h1>Not available in this feedback preview</h1><a href="/playground">Open My Playground</a></main>;
  return <div className="feedback-preview-shell">
    <header className="feedback-preview-banner"><strong>My Playground — Feedback Preview</strong><span>Build {__PREVIEW_SHA__.slice(0, 12)}</span><span>Simulated only · Memory-only; refresh/expiry loses your session</span><button ref={trigger} onClick={() => setOpen(true)}>Guide / Copy feedback</button></header>
    <Playground key={location.pathname} />
    {open && <Feedback close={() => setOpen(false)} trigger={trigger.current} />}
  </div>;
}
createRoot(document.getElementById("root")!).render(<BrowserRouter><Preview /></BrowserRouter>);
