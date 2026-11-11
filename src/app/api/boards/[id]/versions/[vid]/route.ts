import type { Prisma } from "@prisma/client";
import { prisma } from "@/server/db";
import { apiUser, err, json } from "@/server/session";
import { boardForUser, maybeSnapshot } from "@/server/boards";

type Ctx = { params: Promise<{ id: string; vid: string }> };

export async function GET(_req: Request, ctx: Ctx) {
  const user = await apiUser();
  if (user instanceof Response) return user;
  const { id, vid } = await ctx.params;
  const board = await boardForUser(id, user, "view");
  const v = board && (await prisma.boardVersion.findFirst({ where: { id: vid, boardId: board.id } }));
  if (!v) return err("Version not found", 404);
  return json(v);
}

/** Restore a version. The current state is snapshotted first so the restore can itself be undone. */
export async function POST(_req: Request, ctx: Ctx) {
  const user = await apiUser();
  if (user instanceof Response) return user;
  const { id, vid } = await ctx.params;
  const board = await boardForUser(id, user, "edit");
  const v = board && (await prisma.boardVersion.findFirst({ where: { id: vid, boardId: board.id } }));
  if (!board || !v) return err("Version not found", 404);
  await maybeSnapshot(board, true, "Before restore");
  await prisma.board.update({ where: { id: board.id }, data: { title: v.title, content: v.content as Prisma.InputJsonValue } });
  return json({ ok: true });
}
