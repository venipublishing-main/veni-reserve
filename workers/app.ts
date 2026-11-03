import { createRequestHandler } from "react-router";

const requestHandler = createRequestHandler(
  () => import("virtual:react-router/server-build"),
  import.meta.env.MODE,
);

export default {
  async fetch(request) {
    // React Router rejects some verbs before dispatching the resource action.
    // Keep the private API's method contract consistent at the HTTP boundary.
    if (request.method !== "GET" && request.method !== "PUT" &&
        /^\/api\/tenants\/[^/]+\/business-settings\/?$/i.test(new URL(request.url).pathname)) {
      return Response.json({ error: { code: "method_not_allowed" } }, {
        status: 405, headers: { Allow: "GET, PUT", "Cache-Control": "no-store" },
      });
    }
    return requestHandler(request);
  },
} satisfies ExportedHandler<Env>;
