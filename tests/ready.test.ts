import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";

vi.mock("cloudflare:workers", () => ({ env: {} }));
import { env } from "cloudflare:workers";
import { loader } from "../app/routes/ready";
import { loader as health } from "../app/routes/health";

const url = "https://readiness-test.supabase.co";
const key = "sb_publishable_test_sentinel";
const privateSentinel = "private-key-test-sentinel";
const payload = "provider-body-version-sentinel";
const error = "private-network-error-sentinel";
const upstream = vi.fn<typeof fetch>();

beforeEach(() => {
  Object.assign(env, {
    VENI_ENV: "stg", SUPABASE_URL: url, SUPABASE_PUBLISHABLE_KEY: key,
    SUPABASE_SECRET_KEY: privateSentinel,
  });
  upstream.mockReset();
  vi.stubGlobal("fetch", upstream);
});
afterEach(() => {
  vi.unstubAllGlobals();
  vi.useRealTimers();
});

async function check(response: Response, ready: boolean) {
  expect(response.status).toBe(ready ? 200 : 503);
  expect(response.headers.get("Cache-Control")).toBe("no-store");
  const text = await response.text();
  for (const sentinel of [url, key, privateSentinel, payload, error]) {
    expect(text.includes(sentinel)).toBe(false);
  }
  expect(JSON.parse(text)).toEqual({
    status: ready ? "ok" : "not_ready", service: "veni-reserve",
    environment: "stg", dependencies: { supabase: ready ? "ok" : "unavailable" },
  });
}

describe("readiness resource route", () => {
  it("uses exactly one authenticated health GET and returns sanitized readiness", async () => {
    upstream.mockResolvedValue(new Response(payload));
    await check(await loader(), true);
    expect(upstream).toHaveBeenCalledTimes(1);
    const [endpoint, options] = upstream.mock.calls[0];
    expect(String(endpoint)).toBe(`${url}/auth/v1/health`);
    expect(options?.method).toBe("GET");
    expect(new Headers(options?.headers).get("apikey") === key).toBe(true);
    expect(new Headers(options?.headers).has("Authorization")).toBe(false);
    expect(options?.redirect).toBe("manual");
    expect(options?.signal).toBeInstanceOf(AbortSignal);
  });

  it.each([
    ["SUPABASE_URL", undefined], ["SUPABASE_URL", ""],
    ["SUPABASE_PUBLISHABLE_KEY", undefined], ["SUPABASE_PUBLISHABLE_KEY", ""],
    ["SUPABASE_URL", "invalid"], ["SUPABASE_URL", "http://example.test"],
    ["SUPABASE_URL", "https://user:password@example.test"],
    ["SUPABASE_URL", `${url}/unexpected`], ["SUPABASE_URL", `${url}?q=x`],
    ["SUPABASE_URL", `${url}#fragment`],
    ["SUPABASE_PUBLISHABLE_KEY", privateSentinel],
    ["SUPABASE_PUBLISHABLE_KEY", "sb_publishable_"],
  ])("fails closed without fetching for invalid %s (case %#)", async (name, value) => {
    Object.assign(env, { [name]: value });
    await check(await loader(), false);
    expect(upstream).not.toHaveBeenCalled();
  });

  it.each([301, 401, 500])("sanitizes provider HTTP %i", async (status) => {
    upstream.mockResolvedValue(new Response(payload, { status }));
    await check(await loader(), false);
    expect(upstream).toHaveBeenCalledTimes(1);
  });

  it("sanitizes a network exception without retrying", async () => {
    upstream.mockRejectedValue(new Error(error));
    await check(await loader(), false);
    expect(upstream).toHaveBeenCalledTimes(1);
  });

  it("aborts a stalled fetch after five seconds and returns sanitized failure", async () => {
    vi.useFakeTimers();
    upstream.mockImplementation((_url, options) => new Promise((_resolve, reject) => {
      options?.signal?.addEventListener("abort", () => reject(new Error(error)), { once: true });
    }));
    const pending = loader();
    await vi.advanceTimersByTimeAsync(4_999);
    expect(upstream.mock.calls[0][1]?.signal?.aborted).toBe(false);
    await vi.advanceTimersByTimeAsync(1);
    await check(await pending, false);
    expect(upstream.mock.calls[0][1]?.signal?.aborted).toBe(true);
    expect(upstream).toHaveBeenCalledTimes(1);
    expect(vi.getTimerCount()).toBe(0);
  });

  it("keeps liveness independent of absent Supabase bindings and network", async () => {
    Object.assign(env, { SUPABASE_URL: undefined, SUPABASE_PUBLISHABLE_KEY: undefined });
    const response = health();
    expect(response.status).toBe(200);
    expect(await response.json()).toEqual({ status: "ok", service: "veni-reserve", environment: "stg" });
    expect(upstream).not.toHaveBeenCalled();
  });
});
