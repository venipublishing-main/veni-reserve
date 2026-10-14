import { env } from "cloudflare:workers";
import type { Route } from "./+types/home";

export function meta() {
  return [
    { title: "Veni Reserve" },
    {
      name: "description",
      content: "Your booking system. Your brand. Your rules.",
    },
  ];
}

export function loader() {
  return { environment: env.VENI_ENV };
}

export default function Home({ loaderData }: Route.ComponentProps) {
  return (
    <main className="flex min-h-screen items-center justify-center px-6 py-16">
      <div className="max-w-xl text-center">
        <h1 className="text-4xl font-semibold tracking-tight sm:text-5xl">
          Veni Reserve
        </h1>
        <p className="mt-5 text-lg leading-relaxed">
          Your booking system. Your brand. Your rules.
        </p>
        {loaderData.environment === "dev" && (
          <p className="mt-8 text-sm text-primary">Development environment</p>
        )}
      </div>
    </main>
  );
}
