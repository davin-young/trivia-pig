import { z } from "zod";
import { prisma } from "@/server/db";
import { apiUser, err, json } from "@/server/session";
import { createGame, rematchLog } from "@/server/games";
import { gameForUser, gameLog, gameSetup } from "@/server/gameAccess";
import { boardForUser, parseContent } from "@/server/boards";
import { getManager } from "@/server/live";

const body = z.object({ sameBoard: z.boolean().optional(), boardId: z.string().min(1).optional() });

/** Rematch: same players (and teams), fresh scores, same or different board. Phones follow automatically. */
export async function POST(req: Request, ctx: { params: Promise<{ id: string }> }) {
  const user = await apiUser();
  if (user instanceof Response) return user;
  const found = await gameForUser((await ctx.params).id, user, ["HOST", "COHOST"]);
  if (!found) return err("Game not found", 404);
  const { game } = found;
  const parsed = body.safeParse(await req.json().catch(() => ({})));
  if (!parsed.success) return err("Invalid rematch");

  // Use the live in-memory log if the game is loaded (it may not be flushed yet).
  const live = getManager().cached(game.id);
  if (live) await live.flush();
  const setup = live?.history.setup ?? gameSetup(game);
  const log = live?.history.log ?? gameLog(game);

  let content = setup.board;
  let title = game.boardTitle;
  let boardId = game.boardId;
  if (parsed.data.boardId && !parsed.data.sameBoard) {
    const board = await boardForUser(parsed.data.boardId, user, "view");
    if (!board || board.status === "TRASHED") return err("Board not found", 404);
    try {
      content = parseContent(board.content);
    } catch {
      return err("That board has invalid content");
    }
    title = board.title;
    boardId = board.id;
  } else if (parsed.data.sameBoard !== false && game.boardId) {
    // Pick up any typo fixes saved to the board since the game started.
    const board = await prisma.board.findUnique({ where: { id: game.boardId } });
    if (board && board.status !== "TRASHED") {
      try {
        content = parseContent(board.content);
        title = board.title;
      } catch {
        /* keep the snapshot */
      }
    }
  }

  const next = await createGame({
    ownerId: game.ownerId,
    boardId,
    title,
    content,
    settings: setup.settings,
    initialLog: rematchLog(setup, log),
  });
  await prisma.game.update({ where: { id: next.id }, data: { rematchOfId: game.id } });

  // Same reconnect tokens, so every phone slots straight into the new game.
  const players = await prisma.gamePlayer.findMany({ where: { gameId: game.id } });
  if (players.length) {
    await prisma.gamePlayer.createMany({
      data: players.map((p) => ({ gameId: next.id, playerId: p.playerId, tokenHash: p.tokenHash })),
      skipDuplicates: true,
    });
  }

  if (game.status !== "FINISHED") {
    if (live) live.dispatch({ type: "game/end" }, `host:${user.id}`);
    else await prisma.game.update({ where: { id: game.id }, data: { status: "FINISHED", finishedAt: new Date() } });
  }
  live?.redirectAll(next.code);
  return json({ id: next.id, code: next.code });
}
