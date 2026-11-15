import { env } from "cloudflare:workers";
import { createLocalVeniOAuth, LOCAL_APP_ORIGIN, LOCAL_SUPABASE_ORIGIN } from "./veni-oauth-client.server";

/** This adapter must never activate in a deployed Worker or an app-preview build.
 * Local secrets belong in an untracked .dev.vars, never in wrangler.jsonc. */
export function localOAuthClient(request: Request) {
  const url = new URL(request.url);
  if (!import.meta.env.DEV || env.VENI_ENV !== "dev" || url.origin !== LOCAL_APP_ORIGIN) return null;

  const vars = env as unknown as Record<string, string | undefined>;
  if (!vars.VENI_OAUTH_CLIENT_ID || !vars.VENI_OAUTH_CLIENT_SECRET ||
      !vars.VENI_OAUTH_PUBLISHABLE_KEY || !vars.VENI_OAUTH_COOKIE_KEY) return null;
  try {
    return createLocalVeniOAuth({
      appOrigin: LOCAL_APP_ORIGIN,
      providerOrigin: LOCAL_SUPABASE_ORIGIN,
      clientId: vars.VENI_OAUTH_CLIENT_ID,
      clientSecret: vars.VENI_OAUTH_CLIENT_SECRET,
      publishableKey: vars.VENI_OAUTH_PUBLISHABLE_KEY,
      cookieKey: vars.VENI_OAUTH_COOKIE_KEY
    });
  } catch { return null; }
}
