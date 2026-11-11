/**
 * End-to-end smoke test against a running server (npm run dev / docker compose).
 *   BASE_URL=http://localhost:3000 npx tsx scripts/smoke.ts
 * Signs in as the seeded demo user, starts a game from the demo board, connects
 * a display, the host, and two players, and plays one clue plus Final Jeopardy.
 */
import { io, type Socket } from "socket.io-client";
import type { GameView } from "../src/engine/views";

const BASE = process.env.BASE_URL ?? "http://localhost:3000";
const EMAIL = process.env.SEED_EMAIL ?? "demo@example.com";
const PASSWORD = process.env.SEED_PASSWORD ?? "demo1234";

function assert(cond: unknown, msg: string): asserts cond {
  if (!cond) throw new Error(`FAIL: ${msg}`);
  console.log(`  ✓ ${msg}`);
}

async function api(path: string, init: RequestInit & { cookie?: string } = {}) {
  const res = await fetch(BASE + path, {
    ...init,
    headers: { "content-type": "application/json", ...(init.cookie ? { cookie: init.cookie } : {}) },
    redirect: "manual",
  });
  return res;
}

function connect(auth: Record<string, unknown>, cookie?: string) {
  const s = io(BASE, { path: "/socket.io", transports: ["websocket"], auth, extraHeaders: cookie ? { cookie } : undefined });
  let latest: GameView | null = null;
  const waiters: [(v: GameView) => boolean, (v: GameView) => void][] = [];
  s.on("state", (v: GameView) => {
    latest = v;
    for (let i = waiters.length - 1; i >= 0; i--) if (waiters[i][0](v)) waiters.splice(i, 1)[0][1](v);
  });
  const until = (pred: (v: GameView) => boolean, label: string) =>
    new Promise<GameView>((resolve, reject) => {
      if (latest && pred(latest)) return resolve(latest);
      const t = setTimeout(() => reject(new Error(`timeout waiting for: ${label}`)), 5000);
      waiters.push([pred, (v) => (clearTimeout(t), resolve(v))]);
    });
  const emit = (ev: string, payload: unknown) =>
    new Promise<{ ok: boolean; error?: string; data?: unknown }>((resolve) => s.emit(ev, payload, resolve));
  return { s, until, emit, get view() { return latest; } };
}

async function main() {
  console.log(`Smoke test against ${BASE}`);
  const login = await api("/api/auth/login", { method: "POST", body: JSON.stringify({ email: EMAIL, password: PASSWORD }) });
  assert(login.ok, "host can sign in");
  const cookie = (login.headers.get("set-cookie") ?? "").split(";")[0];

  const boards = await (await api("/api/boards", { cookie })).json();
  const board = boards.boards.find((b: { title: string }) => b.title === "Kava & Kratom");
  assert(board, "demo board exists");

  const created = await api("/api/games", { method: "POST", cookie, body: JSON.stringify({ boardId: board.id, settings: { earlyBuzzLockoutMs: 300 } }) });
  const game = await created.json();
  assert(created.ok && /^[A-Z0-9]{5}$/.test(game.code), `game created with code ${game.code}`);

  const intruder = connect({ role: "host", code: game.code });
  const rejected = await new Promise<string>((r) => intruder.s.on("connect_error", (e) => r(e.message)));
  assert(/not authorized/i.test(rejected), "host socket without a session is rejected");
  intruder.s.close();

  const host = connect({ role: "host", code: game.code }, cookie);
  const display = connect({ role: "display", code: game.code });
  const p1 = connect({ role: "player", code: game.code });
  const p2 = connect({ role: "player", code: game.code });
  await host.until((v) => v.phase === "lobby", "host lobby");
  await display.until((v) => v.phase === "lobby", "display lobby");

  const j1 = await p1.emit("player:join", { name: "Alice", signature: { v: 1, w: 600, h: 240, strokes: [{ c: "#ffd23f", s: 10, p: [[10, 10, 0.5], [50, 60, 0.6], [90, 20, 0.5]] }] } });
  const j2 = await p2.emit("player:join", { name: "Bob", signature: null });
  assert(j1.ok && j2.ok, "two players join");
  const bad = await connect({ role: "player", code: game.code }).emit("player:join", { name: "fuck", signature: null });
  assert(!bad.ok, "profane name rejected");
  const forbidden = await p1.emit("host:action", { action: { type: "game/start" } });
  assert(!forbidden.ok, "players can't send host actions");

  const d = await display.until((v) => v.players.length === 2, "display sees 2 players");
  assert(d.players[0].signature?.strokes.length === 1, "display receives handwritten signature");

  assert((await host.emit("host:action", { action: { type: "game/start" } })).ok, "host starts game");
  const hv = await host.until((v) => v.phase === "board", "board");
  const clueId = hv.host!.fullBoard.rounds[0].categories[0].clues[0].id;
  const dv = await display.until((v) => v.phase === "board", "display board");
  assert(!JSON.stringify(dv).includes("coffee family"), "display board has no answers");

  await host.emit("host:action", { action: { type: "clue/open", clueId } });
  const opened = await display.until((v) => v.phase === "clue", "clue open on display");
  assert(opened.clue?.answer === null, "display doesn't get the answer while the clue is up");
  const p2v = await p2.until((v) => v.phase === "clue", "player sees clue");
  assert(p2v.clue?.answer === null && !JSON.stringify(p2v).includes("coffee family?"), "player doesn't get the answer");

  const early = await p2.emit("player:buzz", {});
  assert((early.data as { locked: boolean }).locked, "early buzz gets locked out");
  await host.emit("host:action", { action: { type: "buzzers/unlock" } });
  await p1.until((v) => !!v.me?.canBuzz, "p1 can buzz");
  const b1 = await p1.emit("player:buzz", {});
  const b2 = await p2.emit("player:buzz", {});
  assert((b1.data as { first: boolean }).first, "first buzz wins");
  assert(!(b2.data as { first: boolean }).first, "second buzz doesn't");
  await host.emit("host:action", { action: { type: "clue/judge", correct: true } });
  const after = await display.until((v) => v.clue?.stage === "revealed", "revealed");
  assert(after.clue?.answer === "What is the coffee family?", "answer revealed to display after judging");
  const alice = after.players.find((p) => p.name === "Alice")!.id;
  assert(after.scores[alice] === 100, "Alice scored 100");

  // undo any step
  const seq = (await host.until((v) => !!v.host?.history.find((h) => h.label.startsWith("Marked correct")), "history")).host!.history.find((h) => h.label.startsWith("Marked correct"))!.seq;
  await host.emit("host:undo", { seq, undone: true });
  await display.until((v) => v.scores[alice] === 0, "undo removes points");
  await host.emit("host:undo", { seq, undone: false });
  await display.until((v) => v.scores[alice] === 100, "redo restores points");
  console.log("  ✓ undo/redo of a specific step");

  await host.emit("host:action", { action: { type: "clue/close" } });
  await host.emit("host:action", { action: { type: "final/start" } });
  await p1.until((v) => v.phase === "final", "final");
  assert((await p1.emit("player:finalWager", { amount: 999 })).ok === false, "over-wager rejected");
  assert((await p1.emit("player:finalWager", { amount: 50 })).ok, "valid wager accepted");
  await host.emit("host:action", { action: { type: "final/showClue" } });
  await host.emit("host:action", { action: { type: "final/startTimer" } });
  await p1.until((v) => v.final?.stage === "writing", "writing");
  assert((await p1.emit("player:finalAnswer", { drawing: { v: 1, w: 800, h: 450, strokes: [{ c: "#ffffff", s: 8, p: [[1, 1, 0.5], [100, 100, 0.5]] }] } })).ok, "final answer submitted");
  const dfinal = await display.until((v) => v.final?.hasAnswer[alice] === true, "display sees answered flag");
  assert(Object.keys(dfinal.final!.answers).length === 0, "display can't see answer drawings before reveal");
  await host.emit("host:action", { action: { type: "final/close" } });
  await host.emit("host:action", { action: { type: "final/reveal", contestantId: alice } });
  await display.until((v) => !!v.final?.answers[alice], "display gets revealed drawing");
  await host.emit("host:action", { action: { type: "final/judge", contestantId: alice, correct: true } });
  await host.emit("host:action", { action: { type: "final/showWager", contestantId: alice } });
  await display.until((v) => v.scores[alice] === 150, "final wager applied");
  console.log("  ✓ Final Jeopardy reveal flow");
  await host.emit("host:action", { action: { type: "game/end" } });
  await display.until((v) => v.phase === "finished", "finished");
  console.log("  ✓ game finished");

  for (const c of [host, display, p1, p2]) c.s.close();
  console.log("\nAll smoke checks passed.");
  process.exit(0);
}

main().catch((e) => {
  console.error(e);
  process.exit(1);
});
