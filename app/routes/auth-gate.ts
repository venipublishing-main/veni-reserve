import type { Route } from "./+types/auth-gate";
import { rejectAccountWrite, unavailable } from "../lib/product-access.server";
// No code/token parsing, exchanges or authentication cookies while integration is gated.
export const loader = unavailable;
export function action({ request }: Route.ActionArgs) { return rejectAccountWrite(request); }
