import { createRequestHandler, RouterContextProvider } from "react-router";
import { previewBoundary, previewEnvironment, previewHeaders } from "../app/lib/app-preview.server";
import { previewContext } from "../app/lib/preview-context";
declare const __APP_PREVIEW_SHA__: string;

const requestHandler = createRequestHandler(
  () => import("virtual:react-router/server-build"),
  import.meta.env.MODE,
);

export default {
  async fetch(request, env) {
    if (previewEnvironment(env.VENI_ENV)) {
      if (!/^[a-f0-9]{40}$/.test(__APP_PREVIEW_SHA__)) return new Response("Preview build identity missing", { status: 503 });
      const nonce = crypto.randomUUID().replaceAll("-", "");
      const context = new RouterContextProvider();
      context.set(previewContext, { source: __APP_PREVIEW_SHA__, nonce });
      const boundary = await previewBoundary(request, __APP_PREVIEW_SHA__);
      // Static assets also pass through this boundary; no source files are served.
      const assets = (env as Env & { ASSETS?: Fetcher }).ASSETS;
      let response = boundary;
      if (!response && assets && (new URL(request.url).pathname.startsWith("/assets/") || new URL(request.url).pathname === "/__preview-assets.json")) response = await assets.fetch(request);
      response ??= await requestHandler(request, context);
      const headers = new Headers(response.headers);
      for (const [key, value] of Object.entries(previewHeaders(nonce))) headers.set(key, value);
      headers.delete("Set-Cookie");
      return new Response(request.method === "HEAD" ? null : response.body, { status: response.status, headers });
    }
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
