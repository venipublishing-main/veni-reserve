import { type RouteConfig, index, route } from "@react-router/dev/routes";

export default [
  index("routes/home.tsx"),
  route("health", "routes/health.ts"),
  route("ready", "routes/ready.ts"),
  route("api/tenants/:tenant_id/business-settings", "routes/business-settings.ts"),
] satisfies RouteConfig;
