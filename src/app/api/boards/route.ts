import { z } from "zod";
import type { Prisma } from "@prisma/client";
import { prisma } from "@/server/db";
import { apiUser, err, json } from "@/server/session";
import { visibleOwnerIds } from "@/server/access";
import { boardSummary, parseContent } from "@/server/boards";
import { TEMPLATES } from "@/shared/board";

export async function GET(req: Request) {
  const user = await apiUser();
  if (user instanceof Response) return user;
  const url = new URL(req.url);
  const status = (url.searchParams.get("status") ?? "ACTIVE").toUpperCase();
  const q = url.searchParams.get("q")?.trim();
  const owners = (await visibleOwnerIds(user.id)).filter((o) => o.role !== "SCOREKEEPER").map((o) => o.ownerId);
  const boards = await prisma.board.findMany({
    where: {
      ownerId: { in: owners },
      status: status === "ARCHIVED" || status === "TRASHED" ? status : "ACTIVE",
      ...(q
        ? { OR: [{ title: { contains: q, mode: "insensitive" } }, { tags: { has: q.toLowerCase() } }, { folder: { contains: q, mode: "insensitive" } }] }
        : {}),
    },
    include: { owner: { select: { name: true, email: true } } },
    orderBy: { updatedAt: "desc" },
    take: 500,
  });
  return json({ boards: boards.map(boardSummary) });
}

const createBody = z.object({
  title: z.string().trim().min(1).max(120).default("Untitled board"),
  template: z.string().optional(),
  content: z.unknown().optional(),
  folder: z.string().max(80).optional(),
  tags: z.array(z.string().max(30)).max(20).optional(),
});

export async function POST(req: Request) {
  const user = await apiUser();
  if (user instanceof Response) return user;
  const parsed = createBody.safeParse(await req.json().catch(() => ({})));
  if (!parsed.success) return err("Invalid board");
  const tpl = TEMPLATES.find((t) => t.id === (parsed.data.template ?? "classic")) ?? TEMPLATES[0];
  let content;
  try {
    content = parsed.data.content ? parseContent(parsed.data.content) : tpl.build();
  } catch {
    return err("Board content is invalid");
  }
  const board = await prisma.board.create({
    data: {
      ownerId: user.id,
      title: parsed.data.title,
      folder: parsed.data.folder ?? "",
      tags: (parsed.data.tags ?? []).map((t) => t.toLowerCase()),
      content: content as unknown as Prisma.InputJsonValue,
    },
  });
  return json({ id: board.id });
}
