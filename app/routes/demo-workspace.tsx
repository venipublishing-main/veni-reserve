import type { Route } from "./+types/demo-workspace";
import { ReceptionExperience } from "../features/booking/reception-experience";
import { DEMO_BUSINESS, todayInTimeZone } from "../features/demo/booking";

export function meta() {
  return [{ title: "Reception preview | Veni Reserve" }];
}
export function loader() {
  return { today: todayInTimeZone(new Date(), DEMO_BUSINESS.timezone) };
}
export default function DemoWorkspace({ loaderData }: Route.ComponentProps) {
  return <ReceptionExperience {...loaderData} />;
}
