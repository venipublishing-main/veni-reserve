import type { LoaderFunctionArgs } from "react-router";
import { SiteShell } from "../features/site/shell";
import { localOAuthClient } from "../lib/veni-oauth-config.server";
import { privateHeaders } from "../lib/product-access.server";

type Connection = { connected: true; subject: string; expiresAt: number;
  intendedDestination: string; productAccess: "not_granted" };

export async function loader({ request }: LoaderFunctionArgs) {
  const client = localOAuthClient(request);
  if (!client) throw new Response("Not found", { status: 404, headers: privateHeaders });
  const status = await client.status(request);
  if (!status.ok) return { connected: false as const };
  return await status.json() as Connection;
}
export const headers = () => privateHeaders;
export function meta() { return [{ title: "Local Veni Account OAuth | Veni Reserve" },
  { name: "robots", content: "noindex,nofollow" }]; }

export default function LocalVeniAccount({ loaderData }: { loaderData: Awaited<ReturnType<typeof loader>> }) {
  return <SiteShell>
    <h1 className="text-3xl font-semibold">Local Veni Account connection</h1>
    <p className="rounded border border-amber-400 bg-amber-50 p-4">
      DEVELOPMENT ONLY — fictional accounts and a disposable local provider. This verifies a shared
      identity and live Supabase session; it does not grant Reserve tenant access, business roles,
      account merging, or paid product entitlements. Production login remains blocked.
    </p>
    {loaderData.connected ? <>
      <p>Connected synthetic user: <code>{loaderData.subject}</code></p>
      <p>Live session expires (UTC): {new Date(loaderData.expiresAt * 1000).toISOString()}</p>
      <p>Requested product return path: <code>{loaderData.intendedDestination}</code> (locked until separate membership review)</p>
      <p>Reserve product access: <strong>not granted</strong>.</p>
    </> : <>
      <p>No verified local Veni Account session. Provider registration and local secrets must be configured.</p>
      <a className="underline" href="/auth/veni/start?next=%2Fapp">Start local consent test</a>
    </>}
  </SiteShell>;
}
