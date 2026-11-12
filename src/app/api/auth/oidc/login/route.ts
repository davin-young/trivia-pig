import { NextResponse } from "next/server";
import { OIDC_COOKIE, oidcEnabled, startLogin } from "@/server/oidc";
import { cookieOptions } from "@/server/session";
import { env } from "@/server/env";
import { safeNext } from "@/shared/safeNext";

/** Redirect to Keycloak. */
export async function GET(req: Request) {
  if (!oidcEnabled()) return NextResponse.redirect(`${env.appUrl}/login`);
  const next = safeNext(new URL(req.url).searchParams.get("next"));
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
