import { z } from "zod";
import { prisma } from "@/server/db";
import { apiUser, err, json } from "@/server/session";
import { boardForUser } from "@/server/boards";
import { randomToken } from "@/server/crypto";
import { env } from "@/server/env";

const body = z.object({ mode: z.enum(["VIEW", "COPY", "OFF"]) });

export async function POST(req: Request, ctx: { params: Promise<{ id: string }> }) {
  const user = await apiUser();
  if (user instanceof Response) return user;
  const board = await boardForUser((await ctx.params).id, user, "edit");
  if (!board) return err("Board not found", 404);
  const parsed = body.safeParse(await req.json().catch(() => null));
  if (!parsed.success) return err("Invalid share mode");
  if (parsed.data.mode === "OFF") {
    await prisma.board.update({ where: { id: board.id }, data: { shareToken: null } });
    return json({ url: null });
  }
  const token = board.shareToken ?? randomToken(12);
  await prisma.board.update({ where: { id: board.id }, data: { shareToken: token, shareMode: parsed.data.mode } });
  return json({ url: `${env.appUrl}/share/${token}`, mode: parsed.data.mode });
}
