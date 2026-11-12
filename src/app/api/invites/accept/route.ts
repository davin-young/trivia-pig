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
  // Claim the invite and add the membership together; only one request can claim it.
  const accepted = await prisma.$transaction(async (tx) => {
    const claimed = await tx.invite.updateMany({ where: { id: invite.id, acceptedAt: null }, data: { acceptedAt: new Date() } });
    if (claimed.count !== 1) return false;
    await tx.membership.upsert({
      where: { ownerId_memberId: { ownerId: invite.ownerId, memberId: user.id } },
      create: { ownerId: invite.ownerId, memberId: user.id, role: invite.role },
      update: { role: invite.role },
    });
    return true;
  });
  if (!accepted) return err("This invite is invalid or has expired", 404);
  return json({ ok: true });
}
