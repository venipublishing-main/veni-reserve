import { env } from "cloudflare:workers";
import type { LoaderFunctionArgs } from "react-router";
import { reserveAccount } from "../lib/reserve-account.server";
import { unavailable } from "../lib/product-access.server";

export function loader({ request }: LoaderFunctionArgs) {
  return reserveAccount(request, env)?.begin(request) ?? unavailable();
}
