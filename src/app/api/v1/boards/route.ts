import { apiAuth } from "@/server/apiTokens";
import { boardApiResponse, createBoard, listBoards, readBoardBody } from "@/server/boardApi";

/**
 * Board API, version 1. Sign in with `Authorization: Bearer <token>` (a token from
 * Dashboard > Connect your AI) or a browser session. Own boards only.
 *
 *   GET  /api/v1/boards          list your boards
 *   POST /api/v1/boards          create a board from the published format (/api/schema/board.json)
 */
export async function GET(req: Request) {
  const auth = await apiAuth(req);
  if (auth instanceof Response) return auth;
  return Response.json({ boards: await listBoards(auth.user.id) });
}

export async function POST(req: Request) {
  const auth = await apiAuth(req);
  if (auth instanceof Response) return auth;
  try {
    const { board } = await readBoardBody(req);
    return Response.json(await createBoard(auth.user.id, board), { status: 201 });
  } catch (e) {
    return boardApiResponse(e);
  }
}
