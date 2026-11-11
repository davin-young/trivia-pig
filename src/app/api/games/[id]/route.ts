import { prisma } from "@/server/db";
import { apiUser, err, json } from "@/server/session";
import { getManager } from "@/server/live";

/** Delete a game and its history. Owner only; live games must be ended first. */
export async function DELETE(_req: Request, ctx: { params: Promise<{ id: string }> }) {
  const user = await apiUser();
  if (user instanceof Response) return user;
  const game = await prisma.game.findUnique({ where: { id: (await ctx.params).id } });
  if (!game || game.ownerId !== user.id) return err("Game not found", 404);
  const live = getManager().cached(game.id);
  if (game.status !== "FINISHED" || (live && live.state.phase !== "finished")) return err("End the game before deleting it");
  await prisma.game.delete({ where: { id: game.id } });
  return json({ ok: true });
}
