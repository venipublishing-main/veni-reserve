import { env } from "cloudflare:workers";
import type { LoaderFunctionArgs } from "react-router";
import { BusinessWorkspace } from "../features/site/business-workspace";
import { reserveAccount } from "../lib/reserve-account.server";
import { privateHeaders, requireProductSession } from "../lib/product-access.server";

export async function loader({ request }: LoaderFunctionArgs) {
  const session = await reserveAccount(request, env)?.currentSession(request);
  if (!session) throw await requireProductSession(request);
  return null;
}
export const headers = () => privateHeaders;
export const action = ({ request }: LoaderFunctionArgs) => requireProductSession(request);
export default function Workspace() { return <BusinessWorkspace />; }
