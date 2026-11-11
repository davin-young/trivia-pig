import { z } from "zod";
import { prisma } from "@/server/db";
import { apiUser, err, json } from "@/server/session";
import { sha256 } from "@/server/crypto";

const body = z.object({ token: z.string().min(10).max(200) });

/** Accept an invite as the signed-in user. */
export async function POST(req: Request) {
  const user = await apiUser();
  if (user instanceof Response) return user;
  const parsed = body.safeParse(await req.json().catch(() => null));
  if (!parsed.success) return err("Invalid invite");
  const invite = await prisma.invite.findUnique({ where: { tokenHash: sha256(parsed.data.token) } });
  if (!invite || invite.acceptedAt || invite.expiresAt < new Date()) return err("This invite is invalid or has expired", 404);
  if (invite.ownerId === user.id) return err("You can't accept your own invite");
  await prisma.$transaction([
    prisma.membership.upsert({
      where: { ownerId_memberId: { ownerId: invite.ownerId, memberId: user.id } },
      create: { ownerId: invite.ownerId, memberId: user.id, role: invite.role },
      update: { role: invite.role },
    }),
    prisma.invite.update({ where: { id: invite.id }, data: { acceptedAt: new Date() } }),
  ]);
  return json({ ok: true });
}
