import { z } from "zod";
import { NextResponse } from "next/server";
import { prisma } from "@/server/db";
import { checkPassword, normaliseEmail } from "@/server/auth";
import { env } from "@/server/env";
import { clientIp, err, startSession } from "@/server/session";
import { hit } from "@/server/rateLimit";

const body = z.object({ email: z.string().email().max(200), password: z.string().min(1).max(200) });

export async function POST(req: Request) {
  if (!env.localAuth) return err("Password sign-in is disabled; use single sign-on", 403);
  if (!hit(`login:${clientIp(req)}`, 10, 60_000)) return err("Too many attempts, try again in a minute", 429);
  const parsed = body.safeParse(await req.json().catch(() => null));
  if (!parsed.success) return err("Enter your email and password");
  const email = normaliseEmail(parsed.data.email);
  // Per account as well, so one account cannot be guessed at from many addresses.
  if (!hit(`login:${email}`, 20, 15 * 60_000)) return err("Too many attempts for this account, try again later", 429);
  const user = await prisma.user.findUnique({ where: { email } });
  // Unknown emails do the same bcrypt work, so timing does not show which accounts exist.
  if (!(await checkPassword(parsed.data.password, user?.passwordHash)) || !user) {
    return err("Wrong email or password", 401);
  }
  return startSession(NextResponse.json({ ok: true }), user.id);
}
