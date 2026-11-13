import type { Route } from "./+types/app-gate";
import { requireProductSession } from "../lib/product-access.server";
export function loader({ request }: Route.LoaderArgs) { return requireProductSession(request); }
export const action = loader;
