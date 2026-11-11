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
  const until = (pred: (v: GameView) => boolean, label: string, ms = 5000) =>
    new Promise<GameView>((resolve, reject) => {
      if (latest && pred(latest)) return resolve(latest);
      const t = setTimeout(() => reject(new Error(`timeout waiting for: ${label}`)), ms);
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

  const awarded = await display.until((v) => Array.isArray(v.awards), "awards on the winner screen");
  assert(Array.isArray(awarded.awards), "finished game carries awards");
  for (const c of [host, display, p1, p2]) c.s.close();

  // ---- second game: auto-open buzzers, practice bots, all-play clue, reactions ----
  const created2 = await api("/api/games", { method: "POST", cookie, body: JSON.stringify({ boardId: board.id, settings: { autoUnlock: true, allPlayTimerSec: 5 } }) });
  const game2 = await created2.json();
  assert(created2.ok, `second game created (${game2.code})`);
  const h2 = connect({ role: "host", code: game2.code }, cookie);
  const d2 = connect({ role: "display", code: game2.code });
  const q1 = connect({ role: "player", code: game2.code });
  await h2.until((v) => v.phase === "lobby", "lobby 2");
  assert((await q1.emit("player:join", { name: "Cara", signature: null })).ok, "player joins second game");
  const botsAdded = await h2.emit("host:action", { action: { type: "bots/add", count: 2 } });
  assert(botsAdded.ok, "host adds practice bots");
  const withBots = await d2.until((v) => v.players.filter((p) => p.bot).length === 2, "bots in lobby");
  assert(withBots.players.length === 3, "lobby has 1 human and 2 bots");
  assert(!(await q1.emit("host:action", { action: { type: "bots/add", count: 1 } })).ok, "players cannot add bots");

  await h2.emit("host:action", { action: { type: "game/start" } });
  const hb = await h2.until((v) => v.phase === "board", "board 2");
  const cl = hb.host!.fullBoard.rounds[0].categories[0].clues;
  await h2.emit("host:action", { action: { type: "clue/open", clueId: cl[0].id } });
  const reading = await d2.until((v) => v.phase === "clue", "clue 2 open");
  assert(reading.clue?.stage === "reading" && !!reading.clue.autoUnlockAt, "display knows when the buzzers will open");
  const autoOpened = await d2.until((v) => v.clue?.stage === "open" || v.clue?.stage === "answering", "buzzers opened by themselves", 17000);
  assert(!!autoOpened, "buzzers open automatically after the reading time");
  await h2.emit("host:action", { action: { type: "clue/reveal" } });
  await h2.emit("host:action", { action: { type: "clue/close" } });

  const reacted = new Promise<{ cue: string; id?: string }>((resolve) => d2.s.on("fx", (fx: { cue: string; id?: string }) => fx.cue === "react" && resolve(fx)));
  assert((await q1.emit("player:react", { emoji: "🔥" })).ok, "player sends a reaction");
  assert((await reacted).id === "🔥", "display receives the reaction");
  assert(!(await q1.emit("player:react", { emoji: "<script>" })).ok, "unknown reactions are rejected");

  await h2.emit("host:action", { action: { type: "clue/open", clueId: cl[1].id, allPlay: true } });
  await q1.until((v) => v.clue?.allPlay?.stage === "writing", "all-play writing on phone");
  assert((await q1.emit("player:allPlayAnswer", { drawing: null, typed: "my guess" })).ok, "player submits an all-play answer");
  const allIn = await d2.until((v) => Object.keys(v.clue?.allPlay?.hasAnswer ?? {}).length === 3, "bots answer the all-play too", 9000);
  assert(Object.keys(allIn.clue!.allPlay!.typed).length === 0 && !JSON.stringify(allIn).includes("my guess"), "display cannot see all-play answers before judging");
  const judging = await h2.until((v) => v.clue?.allPlay?.stage === "judging", "all-play closes when the timer ends", 9000);
  const cara = judging.players.find((p) => p.name === "Cara")!.id;
  assert(judging.clue!.allPlay!.typed[cara] === "my guess", "host sees every all-play answer");
  await h2.emit("host:action", { action: { type: "allPlay/judge", contestantId: cara, correct: true } });
  const shown = await d2.until((v) => v.clue?.allPlay?.judged[cara] === true, "ruling shown on display");
  assert(shown.clue!.allPlay!.typed[cara] === "my guess" && shown.scores[cara] === 200, "judged answer is shown and scored");
  assert(shown.clue!.answer === null, "correct answer still hidden until revealed");
  for (const c of [h2, d2, q1]) c.s.close();
  console.log("\nAll smoke checks passed.");
  process.exit(0);
}

main().catch((e) => {
  console.error(e);
  process.exit(1);
});
