import { apiAuth } from "@/server/apiTokens";
import { boardApiResponse, shareBoard } from "@/server/boardApi";

/**
 * POST /api/v1/boards/:id/share — `{ "mode": "off" | "view" | "copy", "listed": true }`.
 * Turns the board's share link on or off; `listed` (with mode "copy") puts it in the gallery.
 */
export async function POST(req: Request, ctx: { params: Promise<{ id: string }> }) {
  const auth = await apiAuth(req);
  if (auth instanceof Response) return auth;
  try {
    const body = (await req.json().catch(() => null)) as { mode?: unknown; listed?: unknown } | null;
    return Response.json(await shareBoard(auth.user.id, (await ctx.params).id, body?.mode, body?.listed));
  } catch (e) {
    return boardApiResponse(e);
  }
}
