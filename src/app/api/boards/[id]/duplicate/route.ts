import type { Prisma } from "@prisma/client";
import { prisma } from "@/server/db";
import { apiUser, err, json } from "@/server/session";
import { boardForUser, parseContent, reId } from "@/server/boards";

export async function POST(_req: Request, ctx: { params: Promise<{ id: string }> }) {
  const user = await apiUser();
  if (user instanceof Response) return user;
  const board = await boardForUser((await ctx.params).id, user, "view");
  if (!board) return err("Board not found", 404);
  const copy = await prisma.board.create({
    data: {
      ownerId: user.id,
      title: `${board.title} (copy)`,
      description: board.description,
      tags: board.tags,
      folder: board.folder,
      content: reId(parseContent(board.content)) as unknown as Prisma.InputJsonValue,
    },
  });
  return json({ id: copy.id });
}
