/**
 * End-to-end check of the board API and the MCP server against a running local server.
 *   BASE_URL=http://localhost:3000 node scripts/api-smoke.mjs
 * It makes two throwaway users with one token each straight in the database, exercises every
 * route as both, and removes everything again. Tokens are never printed.
 */
import { createHash, randomBytes } from "node:crypto";
import { PrismaClient } from "@prisma/client";

const BASE = process.env.BASE_URL ?? "http://localhost:3000";
const prisma = new PrismaClient();
let failed = 0;
const check = (name, ok, extra = "") => {
  if (!ok) failed++;
  console.log(`${ok ? "ok  " : "FAIL"} ${name}${ok ? "" : ` ${extra}`}`);
};

async function makeUser(tag) {
  const user = await prisma.user.create({ data: { email: `smoke-${tag}-${Date.now()}@example.test`, name: `Smoke ${tag}` } });
  const token = "tp_" + randomBytes(30).toString("base64url");
  await prisma.apiToken.create({ data: { userId: user.id, name: "smoke", tokenHash: createHash("sha256").update(token).digest("hex"), hint: token.slice(-4) } });
  return { user, token };
}

const call = async (token, method, path, body) => {
  const r = await fetch(BASE + path, {
    method,
    headers: { ...(token ? { authorization: `Bearer ${token}` } : {}), ...(body ? { "content-type": "application/json" } : {}) },
    body: body ? JSON.stringify(body) : undefined,
  });
  const text = await r.text();
  let data = null;
  try {
    data = JSON.parse(text);
  } catch {}
  return { status: r.status, data };
};
const rpc = (token, method, params, id = 1) => call(token, "POST", "/mcp", { jsonrpc: "2.0", ...(id === null ? {} : { id }), method, params });
const tool = async (token, name, args = {}) => {
  const r = await rpc(token, "tools/call", { name, arguments: args });
  const res = r.data?.result;
  let parsed = null;
  try {
    parsed = JSON.parse(res?.content?.[0]?.text ?? "");
  } catch {}
  return { isError: !!res?.isError, text: res?.content?.[0]?.text ?? "", parsed, raw: r };
};

const board = {
  title: "Smoke board",
  tags: ["Test"],
  rounds: [{ categories: [{ name: "A", clues: [{ question: "Q1", answer: "A1" }, { question: "Q2", answer: "A2", dailyDouble: true }] }] }],
  final: { category: "F", question: "FQ", answer: "FA" },
};

const a = await makeUser("a");
const b = await makeUser("b");
try {
  // ---- auth
  check("schema is public", (await call(null, "GET", "/api/schema/board.json")).data?.type === "object");
  check("no token, no session: 401", (await call(null, "GET", "/api/v1/boards")).status === 401);
  check("wrong token: 401", (await call("tp_" + "x".repeat(40), "GET", "/api/v1/boards")).status === 401);
  check("not-a-token bearer: 401", (await call("hello", "GET", "/api/v1/boards")).status === 401);
  check("token cannot list tokens", (await call(a.token, "GET", "/api/me/tokens")).status === 401);
  check("token cannot reach the cookie board routes", (await call(a.token, "GET", "/api/boards")).status === 401);
  check("token cannot create a game", (await call(a.token, "POST", "/api/games", { boardId: "x" })).status === 401);

  // ---- REST
  const made = await call(a.token, "POST", "/api/v1/boards", board);
  check("create: 201 with id and review", made.status === 201 && !!made.data?.id && made.data?.review?.clues === 2, JSON.stringify(made));
  const id = made.data?.id;
  const got = await call(a.token, "GET", `/api/v1/boards/${id}`);
  check("read back in the simple format", got.data?.board?.rounds?.[0]?.categories?.[0]?.clues?.[1]?.dailyDouble === true && got.data?.board?.tags?.[0] === "test", JSON.stringify(got.data));
  check("list has it", (await call(a.token, "GET", "/api/v1/boards")).data?.boards?.some((x) => x.id === id));
  check("invalid board: 400 with a reason", ((await call(a.token, "POST", "/api/v1/boards", { title: "", rounds: [] })).data?.error ?? "").includes("title"));
  check("bad JSON: 400", (await fetch(BASE + "/api/v1/boards", { method: "POST", headers: { authorization: `Bearer ${a.token}` }, body: "{nope" })).status === 400);
  const edited = structuredClone(board);
  edited.rounds[0].categories[0].clues[0].question = "Q1 edited";
  const put = await call(a.token, "PUT", `/api/v1/boards/${id}`, { board: edited, baseRev: got.data?.rev });
  check("update with the right rev", put.status === 200 && put.data?.rev === got.data?.rev + 1, JSON.stringify(put));
  check("update with a stale rev: 409", (await call(a.token, "PUT", `/api/v1/boards/${id}`, { board: edited, baseRev: got.data?.rev })).status === 409);
  check("a version was kept", (await prisma.boardVersion.count({ where: { boardId: id } })) >= 1);
  check("check route", (await call(a.token, "POST", "/api/v1/boards/check", board)).data?.ok === true);

  // ---- isolation
  check("other user cannot read it: 404", (await call(b.token, "GET", `/api/v1/boards/${id}`)).status === 404);
  check("other user cannot change it: 404", (await call(b.token, "PUT", `/api/v1/boards/${id}`, board)).status === 404);
  check("other user's list is empty", (await call(b.token, "GET", "/api/v1/boards")).data?.boards?.length === 0);

  // ---- MCP
  check("mcp without a token: 401", (await rpc(null, "initialize", {})).status === 401);
  check("mcp GET: 405", (await call(a.token, "GET", "/mcp")).status === 405);
  const init = await rpc(a.token, "initialize", { protocolVersion: "2025-03-26", capabilities: {}, clientInfo: { name: "smoke", version: "0" } });
  check("mcp initialize echoes a supported version", init.data?.result?.protocolVersion === "2025-03-26" && !!init.data?.result?.capabilities?.tools, JSON.stringify(init.data));
  check("mcp notification: 202", (await rpc(a.token, "notifications/initialized", {}, null)).status === 202);
  const tools = await rpc(a.token, "tools/list", {});
  check("mcp lists six tools", tools.data?.result?.tools?.length === 6 && tools.data.result.tools.every((t) => t.inputSchema?.type === "object"));
  check("mcp unknown method: -32601", (await rpc(a.token, "resources/list", {})).data?.error?.code === -32601);
  check("mcp get_board_format has an example", !!(await tool(a.token, "get_board_format")).parsed?.example?.title);
  const created = await tool(a.token, "create_board", { board: { ...board, title: "From MCP" } });
  check("mcp create_board", !created.isError && !!created.parsed?.id && created.parsed?.editUrl?.includes("/boards/"), created.text);
  const read = await tool(a.token, "get_board", { id: created.parsed?.id });
  check("mcp get_board", read.parsed?.board?.title === "From MCP");
  const upd = await tool(a.token, "update_board", { id: created.parsed?.id, baseRev: read.parsed?.rev, board: { ...read.parsed?.board, title: "From MCP v2" } });
  check("mcp update_board", !upd.isError && upd.parsed?.rev === read.parsed?.rev + 1, upd.text);
  check("mcp list_boards shows both", (await tool(a.token, "list_boards")).parsed?.boards?.length === 2);
  const bad = await tool(a.token, "create_board", { board: { title: "x", rounds: [] } });
  check("mcp invalid board is a readable tool error", bad.isError && bad.text.includes("rounds"), bad.text);
  check("mcp other user's board: tool error, not found", (await tool(b.token, "get_board", { id })).text === "Board not found");
  const batch = await call(a.token, "POST", "/mcp", [{ jsonrpc: "2.0", id: 1, method: "ping" }, { jsonrpc: "2.0", method: "notifications/initialized" }]);
  check("mcp batch answers only the request", Array.isArray(batch.data) && batch.data.length === 1);

  // ---- revoke
  await prisma.apiToken.deleteMany({ where: { userId: a.user.id } });
  check("revoked token stops working", (await call(a.token, "GET", "/api/v1/boards")).status === 401);
} finally {
  await prisma.user.deleteMany({ where: { id: { in: [a.user.id, b.user.id] } } });
  await prisma.$disconnect();
}
console.log(failed ? `\n${failed} check(s) failed` : "\nall checks passed");
process.exit(failed ? 1 : 0);
