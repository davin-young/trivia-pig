import { apiAuth } from "@/server/apiTokens";
import { boardApiResponse, readBoardBody, reviewBoard } from "@/server/boardApi";

/** POST /api/v1/boards/check — validate a board and list what to fix, without saving it. */
export async function POST(req: Request) {
  const auth = await apiAuth(req);
  if (auth instanceof Response) return auth;
  try {
    const { board } = await readBoardBody(req);
    return Response.json(reviewBoard(board));
  } catch (e) {
    return boardApiResponse(e);
  }
}
