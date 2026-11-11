import { prisma } from "@/server/db";
import { apiUser, err, json } from "@/server/session";

/** Revoke a pending invite (owner only). */
export async function DELETE(_req: Request, ctx: { params: Promise<{ id: string }> }) {
  const user = await apiUser();
  if (user instanceof Response) return user;
  const r = await prisma.invite.deleteMany({ where: { id: (await ctx.params).id, ownerId: user.id } });
  return r.count ? json({ ok: true }) : err("Invite not found", 404);
}
