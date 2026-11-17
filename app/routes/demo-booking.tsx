import type { Route } from "./+types/demo-booking";
import { BookingExperience } from "../features/booking/booking-experience";
import { DEMO_BUSINESS, todayInTimeZone } from "../features/demo/booking";

export function meta() {
  return [
    { title: "Booking preview | van Vollenhoven Bruwer | Veni Reserve" },
    { name: "description", content: "Interactive, synthetic VVB booking journey built on Veni Reserve." },
  ];
}
export function loader() {
  const now = new Date();
  return { today: todayInTimeZone(now, DEMO_BUSINESS.timezone), now: now.toISOString() };
}
export default function DemoBooking({ loaderData }: Route.ComponentProps) {
  return <BookingExperience {...loaderData} />;
}
