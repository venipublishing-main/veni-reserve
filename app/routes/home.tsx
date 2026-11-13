import { Link } from "react-router";
import { SiteShell, linkClass } from "../features/site/shell";
import { setupSteps } from "../features/site/navigation";
export function meta() { return [{ title: "Veni Reserve" }, { name: "description", content: "Your booking system. Your brand. Your rules." }]; }
export default function Home() {
  return <SiteShell>
    <p className="text-sm font-semibold uppercase tracking-wide text-teal-800">Booking software for service businesses · In development</p>
    <h1 className="max-w-3xl text-4xl font-semibold leading-tight sm:text-5xl">Your booking system.<br />Your brand. Your rules.</h1>
    <p className="max-w-2xl text-lg">Set up a business, shape its booking experience and manage your team's appointments in one product.</p>
    <div className="flex flex-wrap gap-4"><Link className={linkClass} to="/playground">Try Playground</Link><Link className={linkClass} to="/signup">Create my business</Link><Link className={linkClass} to="/login">Sign in</Link></div>
    <p>Playground is optional and simulated. Registration is not open yet. Neither route creates a business today.</p>
    <section className="rounded-2xl border border-slate-200 bg-white p-6"><h2 className="text-2xl font-semibold">From setup to your workspace</h2>
      <ol className="mt-4 grid list-inside list-decimal gap-3 sm:grid-cols-3">{setupSteps.map(step => <li key={step}>{step}</li>)}</ol>
      <p className="mt-5">Your business will stay private during setup. Publishing will require validated settings and booking readiness.</p>
    </section>
    <p>Already exploring? You can choose Create my business at any time. Fictional Playground people, bookings and logos are never imported automatically.</p>
  </SiteShell>;
}
