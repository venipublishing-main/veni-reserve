import { describe, expect, it } from "vitest";
import { reserveAccount } from "../app/lib/reserve-account.server";
import { createReserveOAuth, PRIMARY_PROVIDER, STAGING_ORIGIN, TEST_PROVIDER } from "../app/lib/veni-oauth.server";

const env = {
  VENI_ENV: "stg", VENI_ACCOUNT_MODE: "shared", SUPABASE_URL: PRIMARY_PROVIDER,
  SUPABASE_PUBLISHABLE_KEY: "sb_publishable_fixture",
  VENI_OAUTH_CLIENT_ID: "e37a813d-1c91-4d73-a9d7-783ab660fb46",
  VENI_OAUTH_CLIENT_SECRET: "test-only-client-secret",
  VENI_OAUTH_COOKIE_KEY: "AAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAA",
};
const start = new Request(STAGING_ORIGIN + "/auth/veni/start?next=/app/settings");

describe("Reserve staging account entry", () => {
  it("binds the confidential client, callback and transaction cookie to the staging origin", async () => {
    const response = await reserveAccount(start, env)!.begin(start);
    const location = new URL(response.headers.get("Location")!);
    expect(location.origin).toBe(PRIMARY_PROVIDER);
    expect(location.pathname).toBe("/auth/v1/oauth/authorize");
    expect(location.searchParams.get("redirect_uri")).toBe(STAGING_ORIGIN + "/auth/veni/callback");
    expect(location.searchParams.get("code_challenge_method")).toBe("S256");
    expect(location.searchParams.get("client_id")).toBe(env.VENI_OAUTH_CLIENT_ID);
    const cookie = response.headers.get("Set-Cookie");
    expect(cookie).toMatch(/^__Host-vr_transaction=/);
    for (const attribute of ["HttpOnly", "SameSite=Lax", "Path=/", "Secure"]) expect(cookie).toContain(attribute);
    expect(cookie).not.toContain("Domain=");
    expect(response.headers.get("Cache-Control")).toContain("no-store");
  });

  it("leaves preview, incomplete bindings and unrelated providers disconnected", () => {
    expect(reserveAccount(start, { ...env, VENI_ENV: "app_preview" })).toBeNull();
    expect(reserveAccount(start, { ...env, SUPABASE_URL: TEST_PROVIDER })).toBeNull();
    expect(reserveAccount(start, { ...env, VENI_OAUTH_COOKIE_KEY: undefined })).toBeNull();
    expect(reserveAccount(new Request("https://other.example/app"), env)).toBeNull();
  });

  it("keeps a signed-in user's logout retryable until the provider confirms revocation", async () => {
    const userId = crypto.randomUUID();
    const claims = { sub: userId, iss: PRIMARY_PROVIDER + "/auth/v1", aud: "authenticated",
      role: "authenticated", exp: Math.floor(Date.now() / 1000) + 3600,
      client_id: env.VENI_OAUTH_CLIENT_ID, session_id: crypto.randomUUID() };
    const token = "fixture." + btoa(JSON.stringify(claims)).replace(/=+$/, "") + ".fixture";
    let online = true;
    const account = createReserveOAuth({ appOrigin: STAGING_ORIGIN, providerOrigin: PRIMARY_PROVIDER,
      clientId: env.VENI_OAUTH_CLIENT_ID, clientSecret: env.VENI_OAUTH_CLIENT_SECRET,
      cookieKey: env.VENI_OAUTH_COOKIE_KEY, publishableKey: env.SUPABASE_PUBLISHABLE_KEY }, {
      fetcher: async (url, options) => {
        if (!online) return new Response(null, { status: 503 });
        switch (new URL(String(url)).pathname) {
          case "/auth/v1/oauth/token": return Response.json({ access_token: token, token_type: "bearer" });
          case "/auth/v1/user": return Response.json({ id: userId });
          case "/rest/v1/rpc/reserve_current_reserve_user": return Response.json(userId);
          case "/auth/v1/logout":
            expect(new Headers(options?.headers).get("Authorization")).toBe("Bearer " + token);
            return new Response(null, { status: 204 });
          default: throw new Error("Unexpected provider request");
        }
      },
    });
    const auth = await account.begin(start);
    const state = new URL(auth.headers.get("Location")!).searchParams.get("state");
    const callback = new URL("/auth/veni/callback", STAGING_ORIGIN);
    callback.search = new URLSearchParams({ state: state!, code: crypto.randomUUID() }).toString();
    const result = await account.callback(new Request(callback, {
      headers: { Cookie: auth.headers.getSetCookie()[0].split(";")[0] },
    }));
    const session = result.headers.getSetCookie().find(value => value.startsWith("__Host-vr_session="));
    expect(session).toBeDefined();
    const request = new Request(STAGING_ORIGIN + "/api/workspace/logout", { method: "POST",
      headers: { Cookie: session!.split(";")[0], Origin: STAGING_ORIGIN } });
    online = false;
    const failure = await account.signOut(request);
    expect(failure.status).toBe(503);
    expect(failure.headers.has("Set-Cookie")).toBe(false);
    online = true;
    const retry = await account.signOut(request);
    expect(retry.status).toBe(303);
    expect(retry.headers.getSetCookie().map(value => value.split(";")[0])).toEqual([
      "__Host-vr_session=", "__Host-vr_transaction=", "__Host-vr_setup_request=",
    ]);
  });
});
