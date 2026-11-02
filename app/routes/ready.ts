import { env } from "cloudflare:workers";
import { isSupabaseReady } from "../lib/supabase-readiness.server";

export async function loader() {
  const ready = await isSupabaseReady();
  return Response.json(
    {
      status: ready ? "ok" : "not_ready",
      service: "veni-reserve",
      environment: env.VENI_ENV,
      dependencies: { supabase: ready ? "ok" : "unavailable" },
    },
    { status: ready ? 200 : 503, headers: { "Cache-Control": "no-store" } },
  );
}
