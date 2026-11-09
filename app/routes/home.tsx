import { env } from "cloudflare:workers";
import { Link } from "react-router";
import type { Route } from "./+types/home";

export function meta() {
  return [
    { title: "Veni Reserve" },
    { name: "description", content: "Your booking system. Your brand. Your rules." },
  ];
}

export function loader() {
  return { environment: env.VENI_ENV };
}

export default function Home({ loaderData }: Route.ComponentProps) {
  return (
    <main className="min-h-screen bg-[#f5f6f2] text-[#213d31]">
      <div className="mx-auto flex max-w-6xl flex-wrap items-center justify-between gap-4 px-5 py-7 sm:px-8">
        <div className="flex items-center gap-3">
          <span className="flex h-11 w-11 items-center justify-center rounded-2xl bg-[#214b40] text-xl font-bold text-white">V</span>
          <span className="text-xl font-bold tracking-tight">Veni Reserve</span>
        </div>
        <span className="rounded-full border border-[#d5e2d7] bg-white px-4 py-2 text-xs font-semibold uppercase tracking-wider text-[#69876e]">Building Tenant 001</span>
      </div>
      <section className="mx-auto grid max-w-6xl items-center gap-12 px-5 pb-24 pt-20 sm:px-8 lg:grid-cols-2 lg:pt-32">
        <div>
          <p className="text-xs font-bold uppercase tracking-[0.24em] text-[#75937b]">Veni Flow · Booking software</p>
          <h1 className="mt-5 max-w-2xl text-5xl font-semibold leading-[1.09] tracking-tight sm:text-6xl">
            Your booking system.<br /><span className="text-[#6c8c74]">Your brand. Your rules.</span>
          </h1>
          <p className="mt-7 max-w-xl text-base leading-8 text-[#647c6b]">
            A configurable booking platform designed to feel like your own business. Built for service teams, not a particular industry.
          </p>
          <div className="mt-9 flex flex-wrap gap-3">
            <Link to="/demo/vvb" className="rounded-full bg-[#214b40] px-7 py-3.5 text-sm font-semibold text-white hover:bg-[#133b31] focus-visible:outline-2 focus-visible:outline-offset-2 focus-visible:outline-[#214b40]">Explore VVB booking demo →</Link>
            <Link to="/demo/vvb/workspace" className="rounded-full border border-[#cddccf] bg-white px-7 py-3.5 text-sm font-semibold text-[#214b40] hover:bg-[#eaf1eb]">Reception workspace preview</Link>
          </div>
          <p className="mt-6 max-w-lg text-xs leading-6 text-[#819585]">Demonstrations use fictional services, practitioners and client details. They cannot make or change real appointments.</p>
          {loaderData.environment === "dev" && (
            <p className="mt-7 text-xs font-semibold uppercase tracking-wider text-[#719278]">Local development environment</p>
          )}
        </div>
        <div className="relative rounded-[34px] bg-[#dfe9df] p-6 sm:p-9">
          <div className="rounded-[26px] bg-white p-7 shadow-[0_18px_55px_rgba(33,69,44,0.09)]">
            <div className="flex items-center justify-between">
              <span className="text-xs font-bold uppercase tracking-[0.2em] text-[#829f85]">Illustrative booking</span>
              <span className="rounded-full bg-[#eaf2e9] px-3 py-1.5 text-[11px] font-bold text-[#4c7f55]">Demo only</span>
            </div>
            <h2 className="mt-7 text-2xl font-semibold">A booking experience that feels like your business.</h2>
            <p className="mt-3 text-sm leading-7 text-[#79907f]">Services, practitioners, available times and a clear confirmation journey.</p>
            <div className="mt-7 space-y-3">
              {["Choose your service", "Find the right time", "Complete your booking journey"].map((value, index) => (
                <div key={value} className="flex items-center gap-4 rounded-xl border border-[#e7eee6] p-4">
                  <span className="flex h-9 w-9 items-center justify-center rounded-full bg-[#eaf2e9] text-sm font-bold text-[#507b58]">{index + 1}</span>
                  <span className="text-sm font-semibold text-[#425c48]">{value}</span>
                </div>
              ))}
            </div>
            <Link to="/demo/vvb" className="mt-7 block rounded-full bg-[#214b40] px-5 py-3 text-center text-sm font-semibold text-white hover:bg-[#133b31]">View the demo</Link>
          </div>
        </div>
      </section>
    </main>
  );
}