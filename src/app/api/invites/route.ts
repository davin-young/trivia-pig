import { z } from "zod";
import { prisma } from "@/server/db";
import { apiUser, clientIp, err, json } from "@/server/session";
import { normaliseEmail, sendMail } from "@/server/auth";
import { randomToken, sha256 } from "@/server/crypto";
import { env } from "@/server/env";
import { hit } from "@/server/rateLimit";

const body = z.object({ email: z.string().email().max(200), role: z.enum(["COHOST", "SCOREKEEPER"]) });

const INVITE_TTL_MS = 7 * 86400_000;

/** Invite someone to co-host (edit boards + run games) or scorekeep (scores only) for you. */
export async function POST(req: Request) {
  const user = await apiUser();
  if (user instanceof Response) return user;
  if (!hit(`invite:${user.id}:${clientIp(req)}`, 20, 3600_000)) return err("Too many invites, try later", 429);
  const parsed = body.safeParse(await req.json().catch(() => null));
  if (!parsed.success) return err("Enter a valid email and role");
  const email = normaliseEmail(parsed.data.email);
  if (email === user.email) return err("You can't invite yourself");
  const token = randomToken();
  const invite = await prisma.invite.create({
    data: { ownerId: user.id, email, role: parsed.data.role, tokenHash: sha256(token), expiresAt: new Date(Date.now() + INVITE_TTL_MS) },
  });
  const url = `${env.appUrl}/invite/${token}`;
  const roleText = parsed.data.role === "COHOST" ? "co-host (run games and edit boards)" : "scorekeeper (adjust scores during games)";
  const sent = await sendMail(
    email,
    `${user.name || user.email} invited you to help host trivia`,
    `${user.name || user.email} invited you to be a ${roleText}.\n\nAccept the invite:\n${url}\n\nThis link expires in 7 days.`,
  ).catch(() => false);
  return json({ id: invite.id, url, sent });
}
