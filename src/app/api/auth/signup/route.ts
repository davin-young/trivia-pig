import { z } from "zod";
import { NextResponse } from "next/server";
import { prisma } from "@/server/db";
import { createUser, normaliseEmail } from "@/server/auth";
import { env } from "@/server/env";
import { clientIp, err, startSession } from "@/server/session";
import { hit } from "@/server/rateLimit";

const body = z.object({
  email: z.string().email().max(200),
  password: z.string().min(8, "Password must be at least 8 characters").max(200),
  name: z.string().max(80).optional(),
});

export async function POST(req: Request) {
  if (!hit(`signup:${clientIp(req)}`, 5, 10 * 60_000)) return err("Too many sign-ups from here, try later", 429);
  const parsed = body.safeParse(await req.json().catch(() => null));
  if (!parsed.success) return err(parsed.error.issues[0]?.message ?? "Invalid sign-up");
  const firstUser = (await prisma.user.count()) === 0;
  if (!env.allowSignup && !firstUser) return err("Sign-ups are disabled on this server", 403);
  const email = normaliseEmail(parsed.data.email);
  if (await prisma.user.findUnique({ where: { email } })) return err("An account with that email already exists", 409);
  const user = await createUser(email, parsed.data.password, parsed.data.name);
  return startSession(NextResponse.json({ ok: true }), user.id);
}
