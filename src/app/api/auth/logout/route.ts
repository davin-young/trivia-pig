import { cookies } from "next/headers";
import { NextResponse } from "next/server";
import { env } from "@/server/env";
import { SESSION_COOKIE, destroySession, userFromSessionToken } from "@/server/auth";
import { endSessionUrl } from "@/server/oidc";

export async function POST() {
  const jar = await cookies();
  const token = jar.get(SESSION_COOKIE)?.value;
  const user = await userFromSessionToken(token);
  await destroySession(token);
  // Keycloak users are also signed out of Keycloak, so the next sign-in asks again.
  const sso = user?.oidcSub ? await endSessionUrl() : null;
  const res = NextResponse.redirect(sso ?? `${env.appUrl}/login`, 303);
  res.cookies.delete(SESSION_COOKIE);
  return res;
}
