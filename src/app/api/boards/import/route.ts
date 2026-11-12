import type { Prisma } from "@prisma/client";
import { prisma } from "@/server/db";
import { apiUser, err, json } from "@/server/session";
import { reId } from "@/server/boards";
import { boardFromCsv, boardFromJson } from "@/shared/importBoard";
import { describeBoardError } from "@/shared/simpleBoard";

/**
 * Import a board as a NEW board. Accepts either a multipart upload (`file`)
 * or JSON `{ format: "csv" | "json", text, title? }`.
 */
export async function POST(req: Request) {
  const user = await apiUser();
  if (user instanceof Response) return user;

  let text = "";
  let filename = "";
  let title: string | undefined;
  const ctype = req.headers.get("content-type") ?? "";
  try {
    if (ctype.includes("multipart/form-data")) {
      const form = await req.formData();
      const file = form.get("file");
      if (!(file instanceof File)) return err("No file");
      if (file.size > 2_000_000) return err("File too large (max 2 MB)", 413);
      text = await file.text();
      filename = file.name;
      title = (form.get("title") as string | null) || undefined;
    } else {
      const body = (await req.json()) as { text?: string; format?: string; title?: string };
      text = body.text ?? "";
      filename = body.format === "csv" ? "x.csv" : "x.json";
      title = body.title;
    }
  } catch {
    return err("Couldn't read the upload");
  }
  // A board written by an AI assistant often arrives inside a ```json fence.
  const fenced = /^\s*```(?:json)?\s*([\s\S]*?)```\s*$/i.exec(text);
  if (fenced) text = fenced[1];
  if (!text.trim()) return err("The file is empty");
  if (text.length > 2_000_000) return err("File too large", 413);

  const looksJson = /\.json$/i.test(filename) || /^\s*[[{]/.test(text);
  let content;
  let meta: { title?: string; description?: string; tags?: string[] } = {};
  try {
    if (looksJson) {
      const parsed = boardFromJson(JSON.parse(text));
      content = parsed.content;
      meta = parsed;
    } else {
      content = boardFromCsv(text);
    }
  } catch (e) {
    return err(`Couldn't import: ${describeBoardError(e)}`);
  }

  const board = await prisma.board.create({
    data: {
      ownerId: user.id,
      title: (title || meta.title || filename.replace(/\.(csv|json|tsv|txt)$/i, "") || "Imported board").slice(0, 120),
      description: (meta.description ?? "").slice(0, 1000),
      tags: (meta.tags ?? []).slice(0, 20).map((t) => t.toLowerCase().slice(0, 30)),
      content: reId(content) as unknown as Prisma.InputJsonValue,
    },
  });
  return json({ id: board.id });
}
