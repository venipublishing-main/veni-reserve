import { describe, expect, it, vi } from "vitest";

vi.mock("cloudflare:workers", () => ({
  env: { VENI_ENV: "dev", SUPABASE_SECRET_KEY: "test-only-sentinel" },
}));

import { env } from "cloudflare:workers";
import { loader } from "../app/routes/health";

describe("health resource route", () => {
  it("returns uncached JSON with only public service metadata", async () => {
    const response = loader();

    expect(response.status).toBe(200);
    expect(response.headers.get("Content-Type")).toContain("application/json");
    expect(response.headers.get("Cache-Control")).toBe("no-store");
    expect(await response.json()).toEqual({
      status: "ok",
      service: "veni-reserve",
      environment: "dev",
    });
  });

  it("uses the runtime environment binding", async () => {
    const original = env.VENI_ENV;
    Object.assign(env, { VENI_ENV: "stg" });
    try {
      expect(await loader().json()).toMatchObject({ environment: "stg" });
    } finally {
      Object.assign(env, { VENI_ENV: original });
    }
  });
});
