import { data, Link } from "react-router";
import { SiteShell, linkClass } from "../features/site/shell";
export function loader() { return data(null, { status: 503, headers: { "Cache-Control": "no-store", "X-Robots-Tag": "noindex, nofollow" } }); }
export const action = loader;
export default function BookingGate() {
  return <SiteShell><h1 className="text-3xl font-semibold">Business booking is not published</h1><p>This candidate cannot look up a real business or accept appointments. No booking has been made.</p><Link className={linkClass} to="/">Reserve home</Link></SiteShell>;
}
