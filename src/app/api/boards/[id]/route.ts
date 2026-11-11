import { z } from "zod";
import type { Prisma } from "@prisma/client";
import { prisma } from "@/server/db";
import { apiUser, err, json } from "@/server/session";
import { boardForUser, boardSummary, maybeSnapshot, parseContent } from "@/server/boards";

type Ctx = { params: Promise<{ id: string }> };

export async function GET(_req: Request, ctx: Ctx) {
  const user = await apiUser();
  if (user instanceof Response) return user;
  const board = await boardForUser((await ctx.params).id, user, "view");
  if (!board) return err("Board not found", 404);
  return json({ ...boardSummary(board), content: board.content });
}

const putBody = z.object({
  title: z.string().trim().min(1).max(120).optional(),
  description: z.string().max(1000).optional(),
  tags: z.array(z.string().trim().max(30)).max(20).optional(),
  folder: z.string().trim().max(80).optional(),
  content: z.unknown().optional(),
});

/** Autosave target. Snapshots a version at most every 10 minutes. */
export async function PUT(req: Request, ctx: Ctx) {
  const user = await apiUser();
  if (user instanceof Response) return user;
  const board = await boardForUser((await ctx.params).id, user, "edit");
  if (!board) return err("Board not found", 404);
  const body = await req.text();
  if (body.length > 2_000_000) return err("Board is too large", 413);
  let raw: unknown;
  try {
    raw = JSON.parse(body || "{}");
  } catch {
    return err("Invalid JSON");
  }
  const parsed = putBody.safeParse(raw);
  if (!parsed.success) return err("Invalid update");
  let content;
  if (parsed.data.content !== undefined) {
    try {
      content = parseContent(parsed.data.content);
    } catch (e) {
      return err(`Board content is invalid: ${(e as Error).message.slice(0, 200)}`);
    }
  }
  await maybeSnapshot(board);
  const updated = await prisma.board.update({
    where: { id: board.id },
    data: {
      title: parsed.data.title,
      description: parsed.data.description,
      folder: parsed.data.folder,
      tags: parsed.data.tags?.map((t) => t.toLowerCase()).filter(Boolean),
      content: content as unknown as Prisma.InputJsonValue | undefined,
    },
  });
  return json({ ok: true, updatedAt: updated.updatedAt });
}

const patchBody = z.object({ action: z.enum(["archive", "unarchive", "trash", "restore"]) });

export async function PATCH(req: Request, ctx: Ctx) {
  const user = await apiUser();
  if (user instanceof Response) return user;
  const board = await boardForUser((await ctx.params).id, user, "edit");
  if (!board) return err("Board not found", 404);
  const parsed = patchBody.safeParse(await req.json().catch(() => null));
  if (!parsed.success) return err("Invalid action");
  const a = parsed.data.action;
  await prisma.board.update({
    where: { id: board.id },
    data:
      a === "archive"
        ? { status: "ARCHIVED" }
        : a === "trash"
          ? { status: "TRASHED", trashedAt: new Date() }
          : { status: "ACTIVE", trashedAt: null },
  });
  return json({ ok: true });
}

/** Permanent delete: only from the trash, and only by the owner. */
export async function DELETE(_req: Request, ctx: Ctx) {
  const user = await apiUser();
  if (user instanceof Response) return user;
  const board = await prisma.board.findUnique({ where: { id: (await ctx.params).id } });
  if (!board || board.ownerId !== user.id) return err("Board not found", 404);
  if (board.status !== "TRASHED") return err("Move the board to the trash first");
  await prisma.board.delete({ where: { id: board.id } });
  return json({ ok: true });
}
