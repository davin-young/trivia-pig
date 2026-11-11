import { apiUser, err } from "@/server/session";
import { boardForUser } from "@/server/boards";

export async function GET(_req: Request, ctx: { params: Promise<{ id: string }> }) {
  const user = await apiUser();
  if (user instanceof Response) return user;
  const board = await boardForUser((await ctx.params).id, user, "view");
  if (!board) return err("Board not found", 404);
  const data = { format: "jeppidy-board", version: 1, title: board.title, description: board.description, tags: board.tags, content: board.content };
  const safe = board.title.replace(/[^a-z0-9-_ ]/gi, "").trim().replace(/\s+/g, "-") || "board";
  return new Response(JSON.stringify(data, null, 2), {
    headers: { "content-type": "application/json", "content-disposition": `attachment; filename="${safe}.json"` },
  });
}
