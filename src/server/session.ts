import "server-only";
import { cookies } from "next/headers";
import { redirect } from "next/navigation";
import { NextResponse } from "next/server";
import type { User } from "@prisma/client";
import { SESSION_COOKIE, SESSION_DAYS, createSession, userFromSessionToken } from "./auth";
import { env } from "./env";

/** Current signed-in user in a server component / route handler. */
export async function currentUser(): Promise<User | null> {
  const jar = await cookies();
  return userFromSessionToken(jar.get(SESSION_COOKIE)?.value);
}

export async function requireUser(next = "/dashboard"): Promise<User> {
  const user = await currentUser();
  if (!user) redirect(`/login?next=${encodeURIComponent(next)}`);
  return user;
}

export function cookieOptions(maxAgeSeconds: number) {
  return {
    httpOnly: true,
    sameSite: "lax" as const,
    secure: env.appUrl.startsWith("https://"),
    path: "/",
    maxAge: maxAgeSeconds,
  };
}

export async function startSession(res: NextResponse, userId: string) {
  const { token } = await createSession(userId);
  res.cookies.set(SESSION_COOKIE, token, cookieOptions(SESSION_DAYS * 86400));
  return res;
}

export function json(data: unknown, status = 200) {
  return NextResponse.json(data, { status });
}
export function err(message: string, status = 400) {
  return NextResponse.json({ error: message }, { status });
}

/** For API routes: returns the user or a 401 response. */
export async function apiUser(): Promise<User | NextResponse> {
  const user = await currentUser();
  return user ?? err("Not signed in", 401);
}

export { clientIp } from "./rateLimit";
