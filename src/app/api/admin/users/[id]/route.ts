import { z } from "zod";
import { prisma } from "@/server/db";
import { apiUser, err, json } from "@/server/session";
import { deleteObject } from "@/server/storage";

type Ctx = { params: Promise<{ id: string }> };

async function admin() {
  const user = await apiUser();
  if (user instanceof Response) return user;
  return user.isAdmin ? user : err("Not found", 404);
}

const patchBody = z.object({ isAdmin: z.boolean() });

export async function PATCH(req: Request, ctx: Ctx) {
  const me = await admin();
  if (me instanceof Response) return me;
  const id = (await ctx.params).id;
  const parsed = patchBody.safeParse(await req.json().catch(() => null));
  if (!parsed.success) return err("Invalid update");
  if (id === me.id && !parsed.data.isAdmin) return err("You can't remove your own admin access");
  await prisma.user.update({ where: { id }, data: { isAdmin: parsed.data.isAdmin } });
  return json({ ok: true });
}

/** Delete a user with all their boards, games and media. */
export async function DELETE(_req: Request, ctx: Ctx) {
  const me = await admin();
  if (me instanceof Response) return me;
  const id = (await ctx.params).id;
  if (id === me.id) return err("You can't delete yourself");
  const media = await prisma.media.findMany({ where: { ownerId: id }, select: { key: true } });
  await prisma.user.delete({ where: { id } });
  await Promise.allSettled(media.map((m) => deleteObject(m.key)));
  return json({ ok: true, mediaDeleted: media.length });
}
