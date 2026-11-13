import { data } from "react-router";
import type { Route } from "./+types/signup";
import { AccountEntry } from "../features/site/account-entry";
import { safeReturnPath } from "../features/site/navigation";
import { privateHeaders, rejectAccountWrite } from "../lib/product-access.server";
export function loader({ request }: Route.LoaderArgs) {
  return data({ next: safeReturnPath(new URL(request.url).searchParams.get("next")) }, { headers: privateHeaders });
}
export function action({ request }: Route.ActionArgs) { return rejectAccountWrite(request); }
export const headers = () => privateHeaders;
export function meta() { return [{ title: "Account entry | Veni Reserve" }, { name: "robots", content: "noindex,nofollow" }]; }
export default function Page({ loaderData }: Route.ComponentProps) { return <AccountEntry signingUp={true} next={loaderData.next} />; }
