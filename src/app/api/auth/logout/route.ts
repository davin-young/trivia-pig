import { cookies } from "next/headers";
import { NextResponse } from "next/server";
import { SESSION_COOKIE, destroySession } from "@/server/auth";
import { env } from "@/server/env";

export async function POST() {
  const jar = await cookies();
  await destroySession(jar.get(SESSION_COOKIE)?.value);
  const res = NextResponse.redirect(`${env.appUrl}/login`, 303);
  res.cookies.delete(SESSION_COOKIE);
  return res;
}
