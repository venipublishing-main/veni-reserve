import { BusinessWorkspace } from "../features/site/business-workspace";
import { env } from "cloudflare:workers";
import type { LoaderFunctionArgs } from "react-router";
import { localReviewAllowed, privateHeaders } from "../lib/product-access.server";
import { SetupReview } from "../features/site/setup-review";
export function loader({ request }: LoaderFunctionArgs) {
  if (!localReviewAllowed(request, import.meta.env.DEV, env.VENI_ENV)) throw new Response("Not found", { status: 404, headers: privateHeaders });
  return null;
}
export const headers = () => privateHeaders;
export default function LocalBusiness() {
  return <BusinessWorkspace local>
    <p className="rounded border border-amber-400 bg-amber-50 p-4">DEVELOPMENT ONLY — actual disposable PostgreSQL and local Supabase Auth, fictional data only. Saves survive page/server reload, but a database reset destroys them. No Veni Account federation or public business activation.</p>
    <details><summary>Brand / Theme Studio — separate unsaved demonstration</summary><p>Business saves above do not save a Theme or Theme Revision. No publishing exists.</p><SetupReview /></details>
  </BusinessWorkspace>;
}
