import { cookies } from "next/headers";
import { NextResponse } from "next/server";
import { OIDC_COOKIE, OidcDenied, finishLogin, unpackPending } from "@/server/oidc";
import { startSession } from "@/server/session";
import { env } from "@/server/env";

/** Keycloak redirects back here with ?code=…&state=… */
export async function GET(req: Request) {
  const jar = await cookies();
  const pending = unpackPending(jar.get(OIDC_COOKIE)?.value);
  if (!pending) return NextResponse.redirect(`${env.appUrl}/login?error=sso`);
  // Rebuild the URL from APP_URL: behind a proxy/tunnel req.url may say http://0.0.0.0:3000.
  const current = new URL(`${env.appUrl}/api/auth/oidc/callback${new URL(req.url).search}`);
  try {
    const { user, next } = await finishLogin(current, pending);
    const res = NextResponse.redirect(`${env.appUrl}${next}`);
    res.cookies.delete(OIDC_COOKIE);
    return startSession(res, user.id);
  } catch (e) {
    const denied = e instanceof OidcDenied;
    if (!denied) console.error("[oidc] callback failed", e);
    const res = NextResponse.redirect(`${env.appUrl}/login?error=${denied ? "role" : "sso"}`);
    res.cookies.delete(OIDC_COOKIE);
    return res;
  }
}
