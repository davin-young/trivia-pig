import type { Prisma } from "@prisma/client";
import { prisma } from "@/server/db";
import { apiUser, err, json } from "@/server/session";
import { parseContent, reId } from "@/server/boards";

/** "Make a copy" from a share link. */
export async function POST(_req: Request, ctx: { params: Promise<{ token: string }> }) {
  const user = await apiUser();
  if (user instanceof Response) return user;
  const board = await prisma.board.findUnique({ where: { shareToken: (await ctx.params).token } });
  if (!board || board.shareMode !== "COPY" || board.status === "TRASHED") return err("This board can't be copied", 404);
  const copy = await prisma.board.create({
    data: {
      ownerId: user.id,
      title: board.title,
      description: board.description,
      tags: board.tags,
      content: reId(parseContent(board.content)) as unknown as Prisma.InputJsonValue,
    },
  });
  return json({ id: copy.id });
}
