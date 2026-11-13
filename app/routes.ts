import { type RouteConfig, index, route } from "@react-router/dev/routes";

export default [
  index("routes/home.tsx"),
  route("signup", "routes/signup.tsx"),
  route("login", "routes/login.tsx"),
  route("app/*", "routes/app-gate.ts"),
  route("auth/*", "routes/auth-gate.ts"),
  route("book/:tenant_slug", "routes/booking-gate.tsx"),
  route("development/setup", "routes/setup-review.tsx"),
  route("health", "routes/health.ts"),
  route("ready", "routes/ready.ts"),
  route("api/tenants/:tenant_id/business-settings", "routes/business-settings.ts"),
  // Explicitly demo-only surfaces: no real bookings or tenant administration.
  route("demo/vvb", "routes/demo-booking.tsx"),
  route("demo/vvb/workspace", "routes/demo-workspace.tsx"),
  route("playground", "routes/playground-entry.tsx"),
] satisfies RouteConfig;
