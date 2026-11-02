import { env } from "cloudflare:workers";

/** Probe provider availability only; no user session or database access. */
export async function isSupabaseReady(): Promise<boolean> {
  const bindings = env as {
    SUPABASE_URL?: string;
    SUPABASE_PUBLISHABLE_KEY?: string;
  };
  const url = bindings.SUPABASE_URL;
  const key = bindings.SUPABASE_PUBLISHABLE_KEY;
  if (!url || !key || !/^sb_publishable_[A-Za-z0-9_-]+$/.test(key)) {
    return false;
  }

  let endpoint: URL;
  try {
    const base = new URL(url);
    if (
      base.protocol !== "https:" || base.username || base.password ||
      base.pathname !== "/" || base.search || base.hash
    ) {
      return false;
    }
    endpoint = new URL("/auth/v1/health", base);
  } catch {
    return false;
  }

  const controller = new AbortController();
  const timeout = setTimeout(() => controller.abort(), 5_000);
  try {
    const response = await fetch(endpoint, {
      method: "GET",
      headers: { apikey: key },
      signal: controller.signal,
      // Never forward the key to a redirect destination.
      redirect: "manual",
    });
    // The response body/version is not part of our readiness contract.
    void response.body?.cancel().catch(() => {});
    return response.ok;
  } catch {
    return false;
  } finally {
    clearTimeout(timeout);
  }
}
