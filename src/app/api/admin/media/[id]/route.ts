import { prisma } from "@/server/db";
import { apiUser, err, json } from "@/server/session";
import { deleteObject } from "@/server/storage";

/** Super-admin: delete an uploaded file (from storage and the media table). */
export async function DELETE(_req: Request, ctx: { params: Promise<{ id: string }> }) {
  const user = await apiUser();
  if (user instanceof Response) return user;
  if (!user.isAdmin) return err("Not found", 404);
  const media = await prisma.media.findUnique({ where: { id: (await ctx.params).id } });
  if (!media) return err("Not found", 404);
  await deleteObject(media.key);
  await prisma.media.delete({ where: { id: media.id } });
  return json({ ok: true });
}
