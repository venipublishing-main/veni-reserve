import {
  isRouteErrorResponse,
  Links,
  Meta,
  Outlet,
  useRouteLoaderData,
  Scripts,
  ScrollRestoration,
} from "react-router";

import type { Route } from "./+types/root";
import "./app.css";
import { previewContext } from "./lib/preview-context";
export function loader({ context }: Route.LoaderArgs) { return { preview: context.get(previewContext) }; }

export function Layout({ children }: { children: React.ReactNode }) {
  const preview = useRouteLoaderData<typeof loader>("root")?.preview;
  return (
    <html lang="en">
      <head>
        <meta charSet="utf-8" />
        <meta name="viewport" content="width=device-width, initial-scale=1" />
        <link rel="icon" href="data:," />
        {preview && <><meta name="robots" content="noindex,nofollow" /><meta name="reserve-preview-source" content={preview.source} /></>}
        <Meta />
        <Links />
      </head>
      <body>
        {preview && <aside aria-label="Preview release" className="border-b border-amber-300 bg-amber-50 p-3 text-sm">NON-PRODUCTION REVIEW PREVIEW · No real accounts or bookings. <a href="/preview/setup" className="underline">Fictional Business / Brand / Review</a> · Build <code>{preview.source.slice(0, 12)}</code>. Unsaved sessions; ordinary hosting request logs may exist.</aside>}
        {children}
        <ScrollRestoration nonce={preview?.nonce} />
        <Scripts nonce={preview?.nonce} />
      </body>
    </html>
  );
}

export default function App() {
  return <Outlet />;
}

export function ErrorBoundary({ error }: Route.ErrorBoundaryProps) {
  let message = "Oops!";
  let details = "An unexpected error occurred.";
  let stack: string | undefined;

  if (isRouteErrorResponse(error)) {
    message = error.status === 404 ? "404" : "Error";
    details =
      error.status === 404
        ? "The requested page could not be found."
        : error.statusText || details;
  } else if (import.meta.env.DEV && error && error instanceof Error) {
    details = error.message;
    stack = error.stack;
  }

  return (
    <main className="pt-16 p-4 container mx-auto">
      <h1>{message}</h1>
      <p>{details}</p>
      {stack && (
        <pre className="w-full p-4 overflow-x-auto">
          <code>{stack}</code>
        </pre>
      )}
    </main>
  );
}
