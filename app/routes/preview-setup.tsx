import { env } from "cloudflare:workers";
import { data } from "react-router";
import { previewEnvironment } from "../lib/app-preview.server";
import { privateHeaders } from "../lib/product-access.server";
import { SiteShell } from "../features/site/shell";
import { SetupReview } from "../features/site/setup-review";
export function loader() {
  if (!previewEnvironment(env.VENI_ENV)) throw new Response("Not found", { status: 404, headers: privateHeaders });
  return data(null, { headers: privateHeaders });
}
export const action = () => new Response("Not found", { status: 404, headers: privateHeaders });
export const headers = () => privateHeaders;
export const meta = () => [{ title: "Unsaved setup demonstration | Veni Reserve" }];
export default function PreviewSetup() { return <SiteShell><h1 className="text-3xl font-semibold">Business / Brand / Review — UNSAVED DEMONSTRATION</h1><SetupReview onlinePreview /></SiteShell>; }
