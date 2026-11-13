import { type RouteConfig, index, route } from "@react-router/dev/routes";

const preview = process.env.CLOUDFLARE_ENV === "app_preview";
export default [
  index("routes/home.tsx"),
  ...(process.env.VENI_LOCAL_BOOTSTRAP === "1" && process.env.NODE_ENV !== "production" && !preview ? [route("development/business", "routes/local-business.tsx")] : []),
  route("signup", "routes/signup.tsx"),
  route("login", "routes/login.tsx"),
  ...(!preview ? [
    route("app/*", "routes/app-gate.ts"),
    route("auth/*", "routes/auth-gate.ts"),
    route("book/:tenant_slug", "routes/booking-gate.tsx"),
    route("development/setup", "routes/setup-review.tsx"),
    route("health", "routes/health.ts"),
    route("ready", "routes/ready.ts"),
    route("api/tenants/:tenant_id/business-settings", "routes/business-settings.ts"),
  ] : []),
  route("preview/setup", "routes/preview-setup.tsx"),
  // Explicitly demo-only surfaces: no real bookings or tenant administration.
  route("demo/vvb", "routes/demo-booking.tsx"),
  route("demo/vvb/workspace", "routes/demo-workspace.tsx"),
  route("playground", "routes/playground-entry.tsx"),
] satisfies RouteConfig;
