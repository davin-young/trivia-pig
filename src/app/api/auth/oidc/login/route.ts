import { NextResponse } from "next/server";
import { OIDC_COOKIE, oidcEnabled, startLogin } from "@/server/oidc";
import { cookieOptions } from "@/server/session";
import { env } from "@/server/env";

/** Redirect to Keycloak. */
export async function GET(req: Request) {
  if (!oidcEnabled()) return NextResponse.redirect(`${env.appUrl}/login`);
  const raw = new URL(req.url).searchParams.get("next") ?? "/dashboard";
  const next = raw.startsWith("/") && !raw.startsWith("//") ? raw : "/dashboard";
  try {
    const { url, cookie } = await startLogin(next);
    const res = NextResponse.redirect(url.href);
    res.cookies.set(OIDC_COOKIE, cookie, cookieOptions(600));
    return res;
  } catch (e) {
    console.error("[oidc] discovery failed", e);
    return NextResponse.redirect(`${env.appUrl}/login?error=sso`);
  }
}
