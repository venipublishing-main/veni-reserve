import { Link } from "react-router";
import { SiteShell, linkClass } from "./shell";
export function AccountEntry({ signingUp, next }: { signingUp: boolean; next: string }) {
  return <SiteShell><h1 className="text-3xl font-semibold">{signingUp ? "Create my business" : "Sign in to Veni Reserve"}</h1>
    <section className="space-y-4 rounded-2xl border border-amber-300 bg-white p-6" aria-labelledby="account-gate">
      <h2 id="account-gate" className="text-xl font-semibold">Veni Account connection pending</h2>
      <p>Real registration and sign-in are not available on this candidate. Please do not enter passwords or personal account details here.</p>
      <p>We are preparing a secure connection to Veni Account. An existing Veni Account does not yet grant access to a Reserve business.</p>
      <p>After trusted sign-in, your intended Reserve destination is <code>{next}</code>. No account or business has been created.</p>
    </section>
    <p>You do not need to complete Playground to register when registration opens. Playground configuration stays separate and is not transferred.</p>
    <div className="flex flex-wrap gap-4"><Link className={linkClass} to="/">Reserve home</Link><Link className={linkClass} to="/playground">Explore the optional Playground</Link></div>
  </SiteShell>;
}
