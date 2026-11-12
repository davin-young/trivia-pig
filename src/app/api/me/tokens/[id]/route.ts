import { prisma } from "@/server/db";
import { apiUser, err, json } from "@/server/session";

export async function DELETE(_req: Request, ctx: { params: Promise<{ id: string }> }) {
  const user = await apiUser();
  if (user instanceof Response) return user;
  const res = await prisma.apiToken.deleteMany({ where: { id: (await ctx.params).id, userId: user.id } });
  return res.count ? json({ ok: true }) : err("Token not found", 404);
}
