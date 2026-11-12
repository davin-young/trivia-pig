import { cookies } from "next/headers";
import { NextResponse } from "next/server";
import { OIDC_COOKIE, OidcDenied, finishLogin, unpackPending } from "@/server/oidc";
import { cookieOptions, startSession } from "@/server/session";
import { env } from "@/server/env";

const RETRY_COOKIE = "jp_oidc_retry";

/** Keycloak redirects back here with ?code=…&state=… */
export async function GET(req: Request) {
  const jar = await cookies();
  const pending = unpackPending(jar.get(OIDC_COOKIE)?.value);
  if (!pending) return NextResponse.redirect(`${env.appUrl}/login?error=sso`);
  // Rebuild the URL from APP_URL: behind a proxy/tunnel req.url may say http://0.0.0.0:3000.
  const query = new URL(req.url).searchParams;
  // A stale sign-in page (left open too long, or submitted twice from two tabs) comes back as
  // "authentication_expired". The person is usually signed in to Keycloak already, so start
  // again once instead of showing an error. The short-lived cookie stops a redirect loop.
  if (query.get("error") === "temporarily_unavailable" && !jar.get(RETRY_COOKIE)) {
    const res = NextResponse.redirect(`${env.appUrl}/api/auth/oidc/login?next=${encodeURIComponent(pending.next)}`);
    res.cookies.set(RETRY_COOKIE, "1", cookieOptions(60));
    return res;
  }
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
