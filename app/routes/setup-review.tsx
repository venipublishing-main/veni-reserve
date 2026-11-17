import { env } from "cloudflare:workers";
import type { Route } from "./+types/setup-review";
import { data } from "react-router";
import { localReviewAllowed, privateHeaders } from "../lib/product-access.server";
import { SiteShell } from "../features/site/shell";
import { SetupReview } from "../features/site/setup-review";
export function loader({ request }: Route.LoaderArgs) {
  if (!localReviewAllowed(request, import.meta.env.DEV, env.VENI_ENV)) throw new Response("Not found", { status: 404, headers: privateHeaders });
  return data(null, { headers: privateHeaders });
}
export function action() { return new Response("Read-only local review", { status: 405, headers: { ...privateHeaders, Allow: "GET, HEAD" } }); }
export const headers = () => privateHeaders;
export function meta() { return [{ title: "Local setup design review | Veni Reserve" }, { name: "robots", content: "noindex,nofollow" }]; }
export default function LocalSetup() { return <SiteShell><h1 className="text-3xl font-semibold">Local setup design review</h1><SetupReview /></SiteShell>; }
