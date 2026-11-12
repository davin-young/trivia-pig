import { apiAuth } from "@/server/apiTokens";
import { OAUTH_CORS, wwwAuthenticate } from "@/server/oauth";
import { BoardApiError, createBoard, getBoard, listBoards, reviewBoard, updateBoard } from "@/server/boardApi";
import { APP_NAME } from "@/shared/app";
import { EXAMPLE_BOARD, boardJsonSchema } from "@/shared/simpleBoard";

/**
 * A Model Context Protocol server over streamable HTTP, so an AI assistant can make and edit
 * the caller's boards. Stateless: every POST is one JSON-RPC message (or a batch) answered
 * with plain JSON, and there are no sessions or server-sent events.
 *
 * Connect with the URL alone and sign in when the app asks (OAuth, see src/server/oauth.ts),
 * or with a personal token from the AI page:
 *   Authorization: Bearer tp_...
 *
 * It exposes boards only. Games in progress, their answers, other hosts' boards and the
 * account itself are not reachable from here.
 */
export const dynamic = "force-dynamic";

const PROTOCOLS = ["2025-06-18", "2025-03-26", "2024-11-05"];

const { $schema: _drop, ...BOARD_SCHEMA } = boardJsonSchema() as Record<string, unknown>;
void _drop;

const idArg = { type: "string", description: "Board id, from list_boards or create_board." };

const TOOLS = [
  {
    name: "get_board_format",
    description: "How to write a board: the JSON format, a complete example, and the rules for good clues. Read this before create_board or update_board.",
    inputSchema: { type: "object", properties: {} },
  },
  {
    name: "list_boards",
    description: "List the user's own trivia boards (id, title, size, last change).",
    inputSchema: { type: "object", properties: {} },
  },
  {
    name: "get_board",
    description: "Read one board in full: every category, clue and answer, plus its revision number.",
    inputSchema: { type: "object", properties: { id: idArg }, required: ["id"] },
  },
  {
    name: "check_board",
    description: "Validate a board without saving it. Returns problems (must fix) and warnings (worth a look), such as blank clues or missing answers.",
    inputSchema: { type: "object", properties: { board: BOARD_SCHEMA }, required: ["board"] },
  },
  {
    name: "create_board",
    description: "Save a new board to the user's account. Returns its id, a link to open it in the editor, and a review of anything worth fixing. Text only: pictures and sound are added in the editor.",
    inputSchema: { type: "object", properties: { board: BOARD_SCHEMA }, required: ["board"] },
  },
  {
    name: "update_board",
    description:
      "Replace the text of an existing board with a full new version (read it with get_board first and send the whole board back, changed). The previous version is kept in the editor's version history. Pass baseRev from get_board to avoid overwriting someone's newer edit.",
    inputSchema: {
      type: "object",
      properties: { id: idArg, board: BOARD_SCHEMA, baseRev: { type: "integer", description: "The rev returned by get_board." } },
      required: ["id", "board"],
    },
  },
];

const FORMAT_HELP = {
  format: BOARD_SCHEMA,
  example: EXAMPLE_BOARD,
  rules: [
    "A usual board is 1 or 2 rounds of 6 categories with 5 clues each, plus a final clue.",
    "Order each category's clues from easiest to hardest. Leave out values to get the usual points.",
    "A clue is one short sentence that can be read aloud; its answer is a few words.",
    "Only use facts you are sure of, each with one clearly correct response.",
    "Mark one clue per round as dailyDouble. No clue should give away another clue's answer.",
    "Tell the user to read every clue before game night: they are the host and the judge.",
  ],
};

type Rpc = { jsonrpc?: string; id?: string | number | null; method?: string; params?: Record<string, unknown> };

const rpcError = (id: Rpc["id"], code: number, message: string) => ({ jsonrpc: "2.0", id: id ?? null, error: { code, message } });
const toolText = (data: unknown, isError = false) => ({ content: [{ type: "text", text: typeof data === "string" ? data : JSON.stringify(data, null, 2) }], ...(isError ? { isError: true } : {}) });

async function callTool(userId: string, name: string, args: Record<string, unknown>) {
  try {
    switch (name) {
      case "get_board_format":
        return toolText(FORMAT_HELP);
      case "list_boards":
        return toolText({ boards: await listBoards(userId) });
      case "get_board":
        return toolText(await getBoard(userId, String(args.id ?? "")));
      case "check_board":
        return toolText(reviewBoard(args.board));
      case "create_board":
        return toolText(await createBoard(userId, args.board));
      case "update_board":
        return toolText(await updateBoard(userId, String(args.id ?? ""), args.board, Number.isInteger(args.baseRev) ? (args.baseRev as number) : undefined));
      default:
        return null;
    }
  } catch (e) {
    // Tool failures go back to the model as a result it can read and fix, not as a protocol error.
    if (e instanceof BoardApiError) return toolText(e.message, true);
    console.error("[mcp]", e);
    return toolText("Something went wrong on the server.", true);
  }
}

async function handle(userId: string, msg: Rpc): Promise<object | null> {
  if (!msg || msg.jsonrpc !== "2.0" || typeof msg.method !== "string") return rpcError(msg?.id, -32600, "Invalid request");
  const isNotification = msg.id === undefined;
  const ok = (result: unknown) => (isNotification ? null : { jsonrpc: "2.0", id: msg.id, result });
  switch (msg.method) {
    case "initialize": {
      const asked = String(msg.params?.protocolVersion ?? "");
      return ok({
        protocolVersion: PROTOCOLS.includes(asked) ? asked : PROTOCOLS[0],
        capabilities: { tools: {} },
        serverInfo: { name: "trivia-pig", title: APP_NAME, version: "1.0.0" },
        instructions: `Make and edit trivia boards for ${APP_NAME}. Call get_board_format first. After creating or updating a board, give the user its editUrl and remind them to read every clue before hosting.`,
      });
    }
    case "ping":
      return ok({});
    case "tools/list":
      return ok({ tools: TOOLS });
    case "tools/call": {
      const name = String(msg.params?.name ?? "");
      const args = (msg.params?.arguments ?? {}) as Record<string, unknown>;
      const result = await callTool(userId, name, args && typeof args === "object" ? args : {});
      return result ? ok(result) : isNotification ? null : rpcError(msg.id, -32602, `Unknown tool: ${name}`);
    }
    default:
      // Notifications (for example notifications/initialized) need no answer.
      return isNotification ? null : rpcError(msg.id, -32601, `Method not found: ${msg.method}`);
  }
}

/**
 * Any site may call this: it only ever answers a request that carries a token in the
 * Authorization header, and never looks at cookies, so there is nothing to borrow.
 */
function withCors(res: Response): Response {
  const headers = new Headers(res.headers);
  for (const [k, v] of Object.entries(OAUTH_CORS)) headers.set(k, v);
  headers.set("access-control-allow-methods", "POST, OPTIONS");
  headers.set("access-control-expose-headers", "www-authenticate");
  return new Response(res.body, { status: res.status, headers });
}

export async function POST(req: Request) {
  return withCors(await post(req));
}
export function OPTIONS() {
  return withCors(new Response(null, { status: 204 }));
}

async function post(req: Request): Promise<Response> {
  // A token is required for everything, including the handshake: there is nothing public here,
  // and a browser session is deliberately not accepted. The 401 tells an app where to sign in.
  if (!req.headers.get("authorization")) {
    return new Response(JSON.stringify(rpcError(null, -32001, "Sign in, or send a token as: Authorization: Bearer tp_...")), {
      status: 401,
      headers: { "content-type": "application/json", "www-authenticate": wwwAuthenticate() },
    });
  }
  const auth = await apiAuth(req);
  if (auth instanceof Response) return auth;

  const text = await req.text();
  if (text.length > 2_000_000) return Response.json(rpcError(null, -32600, "Request too large"), { status: 413 });
  let body: unknown;
  try {
    body = JSON.parse(text);
  } catch {
    return Response.json(rpcError(null, -32700, "Parse error"), { status: 400 });
  }

  if (Array.isArray(body)) {
    if (body.length === 0 || body.length > 20) return Response.json(rpcError(null, -32600, "Invalid batch"), { status: 400 });
    const out = [];
    for (const m of body) {
      const r = await handle(auth.user.id, m as Rpc);
      if (r) out.push(r);
    }
    return out.length ? Response.json(out) : new Response(null, { status: 202 });
  }
  const res = await handle(auth.user.id, body as Rpc);
  return res ? Response.json(res) : new Response(null, { status: 202 });
}

/** No server-initiated stream and no sessions to end. */
const notAllowed = () => withCors(new Response(null, { status: 405, headers: { allow: "POST" } }));
export const GET = notAllowed;
export const DELETE = notAllowed;
