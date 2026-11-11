import { z } from "zod";
import { NextResponse } from "next/server";
import { prisma } from "@/server/db";
import { normaliseEmail, verifyPassword } from "@/server/auth";
import { clientIp, err, startSession } from "@/server/session";
import { hit } from "@/server/rateLimit";

const body = z.object({ email: z.string().email().max(200), password: z.string().min(1).max(200) });

export async function POST(req: Request) {
  if (!hit(`login:${clientIp(req)}`, 10, 60_000)) return err("Too many attempts, try again in a minute", 429);
  const parsed = body.safeParse(await req.json().catch(() => null));
  if (!parsed.success) return err("Enter your email and password");
  const user = await prisma.user.findUnique({ where: { email: normaliseEmail(parsed.data.email) } });
  if (!user?.passwordHash || !(await verifyPassword(parsed.data.password, user.passwordHash))) {
    return err("Wrong email or password", 401);
  }
  return startSession(NextResponse.json({ ok: true }), user.id);
}
