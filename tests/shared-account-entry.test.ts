import { describe, expect, it } from "vitest";
import { reserveAccount } from "../app/lib/reserve-account.server";
import { PRIMARY_PROVIDER, STAGING_ORIGIN, TEST_PROVIDER } from "../app/lib/veni-oauth.server";

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
});
