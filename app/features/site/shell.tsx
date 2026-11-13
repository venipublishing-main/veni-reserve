import { Link } from "react-router";
import type { ReactNode } from "react";
export const linkClass = "inline-block rounded-xl border border-slate-300 bg-white px-4 py-3 font-semibold focus-visible:outline-2 focus-visible:outline-offset-2 focus-visible:outline-teal-800";
export function SiteHeader() {
  return <header className="flex flex-wrap items-center justify-between gap-5 border-b border-slate-200 px-5 py-5">
    <Link to="/" className="text-xl font-bold text-teal-950" aria-label="Veni Reserve home">Veni Reserve</Link>
    <nav aria-label="Reserve navigation" className="flex flex-wrap gap-4 text-sm font-semibold">
      <Link to="/playground">Try Playground</Link><Link to="/signup">Create my business</Link><Link to="/login">Sign in</Link>
    </nav>
  </header>;
}
export function SiteShell({ children }: { children: ReactNode }) {
  return <div className="min-h-screen bg-[#f5f6f2] text-slate-900">
    <a className="sr-only focus:not-sr-only" href="#reserve-content">Skip to content</a><SiteHeader />
    <main id="reserve-content" className="mx-auto max-w-5xl space-y-6 px-5 py-10" tabIndex={-1}>{children}</main>
    <footer className="mx-auto max-w-5xl px-5 py-8 text-sm text-slate-600">A Veni Publishing product · In development. No real bookings or registration on this candidate.</footer>
  </div>;
}
