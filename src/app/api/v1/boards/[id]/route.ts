import { apiAuth } from "@/server/apiTokens";
import { boardApiResponse, getBoard, readBoardBody, updateBoard } from "@/server/boardApi";

type Ctx = { params: Promise<{ id: string }> };

/** GET /api/v1/boards/:id — one of your boards, in the published format. */
export async function GET(req: Request, ctx: Ctx) {
  const auth = await apiAuth(req);
  if (auth instanceof Response) return auth;
  try {
    return Response.json(await getBoard(auth.user.id, (await ctx.params).id));
  } catch (e) {
    return boardApiResponse(e);
  }
}

/**
 * PUT /api/v1/boards/:id — replace the board's text. Send the board itself, or
 * `{ "board": {...}, "baseRev": 3 }` to fail instead of overwriting a newer edit.
 */
export async function PUT(req: Request, ctx: Ctx) {
  const auth = await apiAuth(req);
  if (auth instanceof Response) return auth;
  try {
    const { board, baseRev } = await readBoardBody(req);
    return Response.json(await updateBoard(auth.user.id, (await ctx.params).id, board, baseRev));
  } catch (e) {
    return boardApiResponse(e);
  }
}
