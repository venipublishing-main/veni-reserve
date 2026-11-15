import type { LoaderFunctionArgs } from "react-router";
import { localOAuthClient } from "../lib/veni-oauth-config.server";
import { privateHeaders } from "../lib/product-access.server";

export async function loader({ request }: LoaderFunctionArgs) {
  const client = localOAuthClient(request);
  if (!client) throw new Response("Not found", { status: 404, headers: privateHeaders });
  return client.callback(request);
}
