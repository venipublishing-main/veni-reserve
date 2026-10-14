import { env } from "cloudflare:workers";

export function loader() {
  return Response.json(
    {
      status: "ok",
      service: "veni-reserve",
      environment: env.VENI_ENV,
    },
    { headers: { "Cache-Control": "no-store" } },
  );
}
