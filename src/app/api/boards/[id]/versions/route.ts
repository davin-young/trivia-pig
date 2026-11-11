import { z } from "zod";
import { prisma } from "@/server/db";
import { apiUser, err, json } from "@/server/session";
import { boardForUser, maybeSnapshot } from "@/server/boards";

type Ctx = { params: Promise<{ id: string }> };

export async function GET(_req: Request, ctx: Ctx) {
  const user = await apiUser();
  if (user instanceof Response) return user;
  const board = await boardForUser((await ctx.params).id, user, "view");
  if (!board) return err("Board not found", 404);
  const versions = await prisma.boardVersion.findMany({
    where: { boardId: board.id },
    orderBy: { createdAt: "desc" },
    select: { id: true, title: true, label: true, createdAt: true },
  });
  return json({ versions });
}

/** Save a named version now. */
export async function POST(req: Request, ctx: Ctx) {
  const user = await apiUser();
  if (user instanceof Response) return user;
  const board = await boardForUser((await ctx.params).id, user, "edit");
  if (!board) return err("Board not found", 404);
  const body = z.object({ label: z.string().max(80).default("") }).safeParse(await req.json().catch(() => ({})));
  await maybeSnapshot(board, true, body.success ? body.data.label : "");
  return json({ ok: true });
}
