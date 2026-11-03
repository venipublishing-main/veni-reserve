import { env } from "cloudflare:workers";
import { businessSettings } from "../lib/business-settings.server";
import type { Route } from "./+types/business-settings";

export function loader({ request, params }: Route.LoaderArgs) {
  return businessSettings(request, params.tenant_id, env);
}

export const action = loader;
