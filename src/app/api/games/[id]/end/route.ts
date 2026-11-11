import { prisma } from "@/server/db";
import { apiUser, err, json } from "@/server/session";
import { gameForUser } from "@/server/gameAccess";
import { getManager } from "@/server/live";

/** End a game from the dashboard (works whether or not anyone is connected). */
export async function POST(_req: Request, ctx: { params: Promise<{ id: string }> }) {
  const user = await apiUser();
  if (user instanceof Response) return user;
  const found = await gameForUser((await ctx.params).id, user, ["HOST", "COHOST"]);
  if (!found) return err("Game not found", 404);
  const { game } = found;
  if (game.status === "FINISHED") return json({ ok: true });
  const live = await getManager().load(game.id);
  if (live) {
    if (live.state.phase !== "finished") live.dispatch({ type: "game/end" }, `host:${user.id}`);
    await live.flush();
  }
  // Lobby games that never started still get closed so their code frees up.
  await prisma.game.update({ where: { id: game.id }, data: { status: "FINISHED", finishedAt: game.finishedAt ?? new Date() } });
  return json({ ok: true });
}
