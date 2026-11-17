import { createReserveOAuth, PRIMARY_PROVIDER, STAGING_ORIGIN, TEST_ORIGIN, TEST_PROVIDER } from "./veni-oauth.server";

export type AccountBindings = {
  VENI_ENV: string;
  VENI_ACCOUNT_MODE?: string;
  SUPABASE_URL?: string;
  SUPABASE_PUBLISHABLE_KEY?: string;
  VENI_OAUTH_CLIENT_ID?: string;
  VENI_OAUTH_CLIENT_SECRET?: string;
  VENI_OAUTH_COOKIE_KEY?: string;
};

export function reserveAccount(request: Request, env: AccountBindings) {
  if (import.meta.env.VENI_PREVIEW_BUILD) return null;
  const origin = new URL(request.url).origin;
  const local = import.meta.env.DEV && env.VENI_ENV === "dev" && origin === TEST_ORIGIN && env.SUPABASE_URL === TEST_PROVIDER;
  const staging = env.VENI_ENV === "stg" && origin === STAGING_ORIGIN && env.SUPABASE_URL === PRIMARY_PROVIDER;
  if ((!local && !staging) || env.VENI_ACCOUNT_MODE !== "shared" ||
      !env.SUPABASE_PUBLISHABLE_KEY?.startsWith("sb_publishable_") ||
      !env.VENI_OAUTH_CLIENT_ID || !env.VENI_OAUTH_CLIENT_SECRET || !env.VENI_OAUTH_COOKIE_KEY) return null;
  try {
    return createReserveOAuth({ appOrigin: origin, providerOrigin: env.SUPABASE_URL!,
      clientId: env.VENI_OAUTH_CLIENT_ID, clientSecret: env.VENI_OAUTH_CLIENT_SECRET,
      publishableKey: env.SUPABASE_PUBLISHABLE_KEY, cookieKey: env.VENI_OAUTH_COOKIE_KEY });
  } catch { return null; }
}
