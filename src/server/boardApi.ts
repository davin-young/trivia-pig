import "server-only";
import type { Prisma } from "@prisma/client";
import { prisma } from "./db";
import { env } from "./env";
import { maybeSnapshot } from "./boards";
import { hit } from "./rateLimit";
import { randomToken } from "./crypto";
import { checkBoard } from "@/shared/boardCheck";
import type { BoardContent } from "@/shared/board";
import { contentToSimple, describeBoardError, simpleBoardSchema, simpleToContent, type SimpleBoard } from "@/shared/simpleBoard";

/**
 * The board operations behind /api/v1/boards and the MCP server. Everything here works on
 * the caller's OWN boards only (never a team mate's, never a game), in the simple format.
 */
export class BoardApiError extends Error {
  constructor(
    message: string,
    readonly status = 400,
  ) {
    super(message);
  }
}

const CREATES_PER_HOUR = 60;
const MAX_BOARDS = 2000;

const editUrl = (id: string) => `${env.appUrl}/boards/${id}/edit`;

function parseSimple(raw: unknown): SimpleBoard {
  const parsed = simpleBoardSchema.safeParse(raw);
  if (!parsed.success) throw new BoardApiError(`The board is not valid: ${describeBoardError(parsed.error)}`);
  return parsed.data;
}

/** What a careful host would want to know before game night. Never throws on a valid board. */
export function reviewBoard(raw: unknown) {
  const simple = parseSimple(raw);
  const content = simpleToContent(simple);
  const issues = checkBoard(content);
  const clues = content.rounds.reduce((n, r) => n + r.categories.reduce((m, c) => m + c.clues.filter((q) => q.text.trim()).length, 0), 0);
  return {
    ok: !issues.some((i) => i.level === "error"),
    rounds: content.rounds.map((r) => `${r.categories.length} categories x ${r.values.length} clues`),
    clues,
    hasFinal: !!content.final,
    problems: issues.filter((i) => i.level === "error").map((i) => i.message),
    warnings: issues.filter((i) => i.level === "warn").map((i) => i.message),
  };
}

export async function listBoards(userId: string) {
  const boards = await prisma.board.findMany({
    where: { ownerId: userId, status: "ACTIVE" },
    orderBy: { updatedAt: "desc" },
    take: 200,
    select: { id: true, title: true, description: true, tags: true, updatedAt: true, content: true },
  });
  return boards.map((b) => {
    const content = b.content as unknown as BoardContent;
    return {
      id: b.id,
      title: b.title,
      description: b.description,
      tags: b.tags,
      updatedAt: b.updatedAt,
      rounds: content?.rounds?.map((r) => `${r.categories.length}x${r.values.length}`) ?? [],
      hasFinal: !!content?.final,
      editUrl: editUrl(b.id),
    };
  });
}

async function ownBoard(userId: string, id: string) {
  const board = await prisma.board.findUnique({ where: { id } });
  // The same answer for "not yours" and "does not exist", so ids cannot be probed.
  if (!board || board.ownerId !== userId || board.status === "TRASHED") throw new BoardApiError("Board not found", 404);
  return board;
}

export async function getBoard(userId: string, id: string) {
  const b = await ownBoard(userId, id);
  return {
    id: b.id,
    rev: b.rev,
    updatedAt: b.updatedAt,
    editUrl: editUrl(b.id),
    board: contentToSimple(b.content as unknown as BoardContent, { title: b.title, description: b.description, tags: b.tags }),
  };
}

export async function createBoard(userId: string, raw: unknown) {
  const simple = parseSimple(raw);
  if (!hit(`boardapi:create:${userId}`, CREATES_PER_HOUR, 60 * 60_000)) throw new BoardApiError(`Limit reached: ${CREATES_PER_HOUR} new boards an hour.`, 429);
  if ((await prisma.board.count({ where: { ownerId: userId } })) >= MAX_BOARDS) throw new BoardApiError("This account has too many boards. Delete some first.", 409);
  const content = simpleToContent(simple);
  const board = await prisma.board.create({
    data: {
      ownerId: userId,
      title: simple.title,
      description: simple.description ?? "",
      tags: (simple.tags ?? []).map((t) => t.toLowerCase()),
      content: content as unknown as Prisma.InputJsonValue,
    },
  });
  return { id: board.id, editUrl: editUrl(board.id), review: reviewBoard(simple) };
}

/**
 * Replace a board's text. The previous version is saved first (Versions in the editor),
 * and pictures and the board's look are kept for cells that did not move.
 */
export async function updateBoard(userId: string, id: string, raw: unknown, baseRev?: number) {
  const simple = parseSimple(raw);
  const board = await ownBoard(userId, id);
  const content = simpleToContent(simple, board.content as unknown as BoardContent);
  await maybeSnapshot(board, true, "Before an update through the API");
  const res = await prisma.board.updateMany({
    where: { id: board.id, ...(baseRev !== undefined ? { rev: baseRev } : {}) },
    data: {
      title: simple.title,
      description: simple.description ?? board.description,
      tags: simple.tags ? simple.tags.map((t) => t.toLowerCase()) : board.tags,
      content: content as unknown as Prisma.InputJsonValue,
      rev: { increment: 1 },
    },
  });
  if (res.count === 0) throw new BoardApiError("The board changed since you read it. Read it again and retry.", 409);
  return { id: board.id, rev: board.rev + 1, editUrl: editUrl(board.id), review: reviewBoard(simple) };
}

export type ShareMode = "off" | "view" | "copy";

/**
 * Turn a board's share link on or off, and list it in the public gallery. The same rules as the
 * Share dialog in the editor: the gallery only lists boards that people can copy.
 */
export async function shareBoard(userId: string, id: string, mode: unknown, listed: unknown) {
  if (mode !== "off" && mode !== "view" && mode !== "copy") throw new BoardApiError('mode must be "off", "view" or "copy".');
  if (listed !== undefined && typeof listed !== "boolean") throw new BoardApiError("listed must be true or false.");
  if (listed && mode !== "copy") throw new BoardApiError('Only a board shared with mode "copy" can be listed in the gallery.');
  const board = await ownBoard(userId, id);
  if (mode === "off") {
    await prisma.board.update({ where: { id: board.id }, data: { shareToken: null, listed: false, listedAt: null } });
    return { id: board.id, mode, listed: false, shareUrl: null };
  }
  const token = board.shareToken ?? randomToken(12);
  const list = mode === "copy" && (listed ?? board.listed);
  await prisma.board.update({
    where: { id: board.id },
    data: { shareToken: token, shareMode: mode === "copy" ? "COPY" : "VIEW", listed: list, listedAt: list ? (board.listedAt ?? new Date()) : null },
  });
  return { id: board.id, mode, listed: list, shareUrl: `${env.appUrl}/share/${token}`, ...(list ? { galleryUrl: `${env.appUrl}/gallery` } : {}) };
}

/** Read a request body that is either a board, or `{ board, baseRev }`. */
export async function readBoardBody(req: Request): Promise<{ board: unknown; baseRev?: number }> {
  const text = await req.text();
  if (text.length > 2_000_000) throw new BoardApiError("The board is too large (2 MB at most).", 413);
  let raw: unknown;
  try {
    raw = JSON.parse(text);
  } catch {
    throw new BoardApiError("The request body is not valid JSON.");
  }
  if (raw && typeof raw === "object" && "board" in raw) {
    const { board, baseRev } = raw as { board: unknown; baseRev?: unknown };
    return { board, baseRev: Number.isInteger(baseRev) ? (baseRev as number) : undefined };
  }
  return { board: raw };
}

/** Turn a thrown error into an HTTP response. */
export function boardApiResponse(e: unknown): Response {
  if (e instanceof BoardApiError) return Response.json({ error: e.message }, { status: e.status });
  console.error("[board api]", e);
  return Response.json({ error: "Something went wrong" }, { status: 500 });
}
