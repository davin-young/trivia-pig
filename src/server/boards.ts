import type { Board, Prisma, User } from "@prisma/client";
import { boardContentSchema, newId, normalizeRound, type BoardContent } from "@/shared/board";
import { prisma } from "./db";
import { canEditBoard, hostRoleFor } from "./access";

export async function boardForUser(id: string, user: User, mode: "view" | "edit"): Promise<Board | null> {
  const board = await prisma.board.findUnique({ where: { id } });
  if (!board) return null;
  if (mode === "edit") return (await canEditBoard(user.id, board.ownerId)) ? board : null;
  return (await hostRoleFor(user.id, board.ownerId)) ? board : null;
}

export function parseContent(raw: unknown): BoardContent {
  const parsed = boardContentSchema.parse(raw);
  return { ...parsed, rounds: parsed.rounds.map(normalizeRound) };
}

/** Fresh ids everywhere: used when copying so two boards never share clue ids. */
export function reId(content: BoardContent): BoardContent {
  return {
    ...content,
    rounds: content.rounds.map((r) => ({
      ...r,
      id: newId("r"),
      categories: r.categories.map((c) => ({ ...c, id: newId("k"), clues: c.clues.map((q) => ({ ...q, id: newId("q") })) })),
    })),
  };
}

const VERSION_INTERVAL_MS = 10 * 60_000;

/** Save a version snapshot at most every 10 minutes during autosave (and always when forced). */
export async function maybeSnapshot(board: Board, force = false, label = "") {
  if (!force) {
    const last = await prisma.boardVersion.findFirst({ where: { boardId: board.id }, orderBy: { createdAt: "desc" } });
    if (last && Date.now() - last.createdAt.getTime() < VERSION_INTERVAL_MS) return;
  }
  await prisma.boardVersion.create({ data: { boardId: board.id, title: board.title, content: board.content as Prisma.InputJsonValue, label } });
  const old = await prisma.boardVersion.findMany({ where: { boardId: board.id }, orderBy: { createdAt: "desc" }, skip: 100, select: { id: true } });
  if (old.length) await prisma.boardVersion.deleteMany({ where: { id: { in: old.map((o) => o.id) } } });
}

export function boardSummary(b: Board & { owner?: { name: string; email: string } }) {
  const content = b.content as unknown as BoardContent;
  return {
    id: b.id,
    title: b.title,
    description: b.description,
    tags: b.tags,
    folder: b.folder,
    status: b.status,
    ownerId: b.ownerId,
    ownerName: b.owner?.name,
    updatedAt: b.updatedAt,
    createdAt: b.createdAt,
    trashedAt: b.trashedAt,
    shareToken: b.shareToken,
    shareMode: b.shareMode,
    rounds: content?.rounds?.map((r) => `${r.categories.length}×${r.values.length}`) ?? [],
    hasFinal: !!content?.final,
  };
}
export type BoardSummary = ReturnType<typeof boardSummary>;
