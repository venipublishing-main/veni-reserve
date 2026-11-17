import { Link } from "react-router";
import Playground from "./playground";
import { SiteHeader } from "../features/site/shell";
export { meta } from "./playground";
/** Main application wrapper only; the isolated static release imports Playground directly. */
export default function PlaygroundEntry() {
  return <><SiteHeader /><aside className="flex flex-wrap items-center justify-between gap-3 bg-white px-5 py-3 text-sm">
    <p>Optional simulation. Leaving or refreshing loses this memory-only session. No configuration is transferred to a business.</p>
    <Link className="font-semibold underline" to="/signup">Create my business (registration pending)</Link>
  </aside><Playground /></>;
}
