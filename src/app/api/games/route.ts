import { z } from "zod";
import { prisma } from "@/server/db";
import { apiUser, err, json } from "@/server/session";
import { createGame, userDefaults } from "@/server/games";
import { boardContentSchema } from "@/shared/board";
import { settingsSchema } from "@/engine/types";
import { hostRoleFor } from "@/server/access";
import { quickBoard } from "@/shared/quickBoard";

const body = z.object({ boardId: z.string().min(1), settings: settingsSchema.partial().optional(), quick: z.boolean().optional() });

/** Start a game from a board: snapshots the board and returns the join code. */
export async function POST(req: Request) {
  const user = await apiUser();
  if (user instanceof Response) return user;
  const parsed = body.safeParse(await req.json().catch(() => null));
  if (!parsed.success) return err("Pick a board");
  const board = await prisma.board.findUnique({ where: { id: parsed.data.boardId } });
  if (!board || board.status === "TRASHED") return err("Board not found", 404);
  const role = await hostRoleFor(user.id, board.ownerId);
  if (role !== "HOST" && role !== "COHOST") return err("You can't host this board", 403);
  const content = boardContentSchema.safeParse(board.content);
  if (!content.success) return err("This board has invalid content");
  const owner = board.ownerId === user.id ? user : await prisma.user.findUniqueOrThrow({ where: { id: board.ownerId } });
  const settings = { ...userDefaults(owner), ...(parsed.data.settings ?? {}) };
  const game = await createGame({ ownerId: board.ownerId, boardId: board.id, title: board.title, content: parsed.data.quick ? quickBoard(content.data) : content.data, settings });
  return json({ id: game.id, code: game.code });
}
