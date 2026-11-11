import { prisma } from "@/server/db";
import { apiUser, err, json } from "@/server/session";

/** Remove a co-host/scorekeeper (as the owner), or leave someone's team (as the member). */
export async function DELETE(_req: Request, ctx: { params: Promise<{ id: string }> }) {
  const user = await apiUser();
  if (user instanceof Response) return user;
  const r = await prisma.membership.deleteMany({
    where: { id: (await ctx.params).id, OR: [{ ownerId: user.id }, { memberId: user.id }] },
  });
  return r.count ? json({ ok: true }) : err("Not found", 404);
}
