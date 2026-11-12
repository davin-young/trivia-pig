/**
 * Crash-recovery test. Starts the production server itself, plays part of a game,
 * hard-kills the process (like a power cut or OOM kill), starts it again, and checks
 * that every device reconnects on its own and the game continues where it stopped.
 *
 *   npm run build && npx tsx scripts/crash-test.ts
 *
 * Needs DATABASE_URL (migrated + seeded) and uses port CRASH_PORT (default 3100).
 */
import { spawn, type ChildProcess } from "node:child_process";
import { io } from "socket.io-client";
import type { GameView } from "../src/engine/views";

const PORT = Number(process.env.CRASH_PORT ?? 3100);
const BASE = `http://127.0.0.1:${PORT}`;

function assert(cond: unknown, msg: string): asserts cond {
  if (!cond) throw new Error(`FAIL: ${msg}`);
  console.log(`  ✓ ${msg}`);
}
const sleep = (ms: number) => new Promise((r) => setTimeout(r, ms));

function startServer(): ChildProcess {
  const child = spawn(process.execPath, ["dist/server.js"], {
    env: { ...process.env, NODE_ENV: "production", PORT: String(PORT), APP_URL: BASE, AUTH_SECRET: process.env.AUTH_SECRET ?? "crash-test-secret" },
    stdio: ["ignore", "pipe", "pipe"],
  });
  child.stdout?.on("data", (d) => process.env.VERBOSE && process.stdout.write(`    [server] ${d}`));
  child.stderr?.on("data", (d) => process.stderr.write(`    [server] ${d}`));
  return child;
}

async function waitHealthy(label: string) {
  for (let i = 0; i < 120; i++) {
    try {
      const r = await fetch(`${BASE}/readyz`);
      if (r.ok) return (await r.json()) as { ok: boolean; db: boolean; games: number };
    } catch {}
    await sleep(500);
  }
  throw new Error(`server did not become ready (${label})`);
}

function connect(auth: Record<string, unknown>, cookie?: string) {
  const s = io(BASE, {
    path: "/socket.io",
    transports: ["websocket"],
    auth: (cb) => cb(typeof auth.get === "function" ? (auth.get as () => object)() : auth),
    extraHeaders: cookie ? { cookie } : undefined,
    reconnectionDelay: 300,
    reconnectionDelayMax: 1000,
  });
  s.on("rtt", (ack?: () => void) => ack?.());
  let latest: GameView | null = null;
  let connects = 0;
  s.on("connect", () => connects++);
  const waiters: [(v: GameView) => boolean, (v: GameView) => void][] = [];
  s.on("state", (v: GameView) => {
    latest = v;
    for (let i = waiters.length - 1; i >= 0; i--) if (waiters[i][0](v)) waiters.splice(i, 1)[0][1](v);
  });
  const until = (pred: (v: GameView) => boolean, label: string, ms = 8000) =>
    new Promise<GameView>((resolve, reject) => {
      if (latest && pred(latest)) return resolve(latest);
      const t = setTimeout(() => reject(new Error(`timeout waiting for: ${label}`)), ms);
      waiters.push([pred, (v) => (clearTimeout(t), resolve(v))]);
    });
  const emit = (ev: string, payload: unknown) =>
    new Promise<{ ok: boolean; error?: string; data?: unknown }>((resolve) => s.emit(ev, payload, resolve));
  const reconnected = async (n: number, label: string) => {
    for (let i = 0; i < 150 && connects < n; i++) await sleep(200);
    if (connects < n) throw new Error(`${label} did not reconnect`);
  };
  return { s, until, emit, reconnected, clear: () => (latest = null) };
}

async function main() {
  console.log(`Crash-recovery test on ${BASE}`);
  let server = startServer();
  try {
    await waitHealthy("first boot");
    const login = await fetch(`${BASE}/api/auth/login`, {
      method: "POST",
      headers: { "content-type": "application/json" },
      body: JSON.stringify({ email: process.env.SEED_EMAIL ?? "demo@example.com", password: process.env.SEED_PASSWORD ?? "demo1234" }),
    });
    assert(login.ok, "host signs in");
    const cookie = (login.headers.get("set-cookie") ?? "").split(";")[0];
    const boards = await (await fetch(`${BASE}/api/boards`, { headers: { cookie } })).json();
    const board = boards.boards.find((b: { title: string }) => b.title === "Kava & Kratom");
    const created = await fetch(`${BASE}/api/games`, {
      method: "POST",
      headers: { "content-type": "application/json", cookie },
      body: JSON.stringify({ boardId: board.id, settings: { earlyBuzzLockoutMs: 0, startCountdownSec: 0 } }),
    });
    const game = await created.json();
    assert(created.ok, `game ${game.code} created`);

    const host = connect({ role: "host", code: game.code }, cookie);
    const display = connect({ role: "display", code: game.code });
    let token: string | undefined;
    const player = connect({ get: () => ({ role: "player", code: game.code, playerToken: token }) });
    await host.until((v) => v.phase === "lobby", "lobby");
    const joined = await player.emit("player:join", { name: "Alice", signature: null });
    assert(joined.ok, "player joins");
    token = (joined.data as { playerToken: string }).playerToken;

    await host.emit("host:action", { action: { type: "game/start" } });
    const hv = await host.until((v) => v.phase === "board", "board");
    const clues = hv.host!.fullBoard.rounds[0].categories[0].clues;
    await host.emit("host:action", { action: { type: "clue/open", clueId: clues[0].id } });
    await host.emit("host:action", { action: { type: "buzzers/unlock" } });
    await player.until((v) => !!v.me?.canBuzz, "can buzz");
    await player.emit("player:buzz", {});
    await host.emit("host:action", { action: { type: "clue/judge", correct: true } });
    const scored = await display.until((v) => v.clue?.stage === "revealed", "revealed");
    const alice = scored.players[0].id;
    const before = scored.scores[alice];
    assert(before > 0, `Alice has ${before} before the crash`);
    await host.emit("host:action", { action: { type: "clue/close" } });
    // Open a second clue and leave it mid-question when the server dies.
    await host.emit("host:action", { action: { type: "clue/open", clueId: clues[1].id } });
    await display.until((v) => v.phase === "clue" && v.clue?.id === clues[1].id, "second clue open");
    await sleep(700); // let the write-behind save land (debounced 300 ms)

    console.log("  … killing the server (SIGKILL, no chance to save)");
    server.kill("SIGKILL");
    await new Promise((r) => server.once("exit", r));
    for (const c of [host, display, player]) c.clear();
    await sleep(1500);
    server = startServer();
    const ready = await waitHealthy("after crash");
    assert(ready.db, "server is back and the database answers");

    await Promise.all([host.reconnected(2, "host"), display.reconnected(2, "display"), player.reconnected(2, "player")]);
    console.log("  ✓ host, display and player reconnected on their own");
    const dv = await display.until((v) => v.phase === "clue" && v.clue?.id === clues[1].id, "display back on the open clue");
    assert(dv.scores[alice] === before, "score survived the crash");
    assert(dv.clue?.answer === null, "display still has no answer for the open clue");
    const pv = await player.until((v) => v.phase === "clue", "player back in the game");
    assert(pv.me?.playerId === alice, "player kept their seat (same player id)");
    const hv2 = await host.until((v) => v.phase === "clue", "host back");
    assert(hv2.host!.history.length >= 6, "host still has the full step history for undo");

    await host.emit("host:action", { action: { type: "buzzers/unlock" } });
    await player.until((v) => !!v.me?.canBuzz, "can buzz after restart");
    const buzz = await player.emit("player:buzz", {});
    assert((buzz.data as { first: boolean }).first, "buzzer works after the restart");
    await host.emit("host:action", { action: { type: "clue/judge", correct: true } });
    await display.until((v) => v.scores[alice] > before, "game continues and scores add up");
    console.log("  ✓ game continued after the crash");

    for (const c of [host, display, player]) c.s.close();
    console.log("\nCrash-recovery test passed ✔");
  } finally {
    server.kill("SIGKILL");
  }
}

main().then(
  () => process.exit(0),
  (err) => {
    console.error(err);
    process.exit(1);
  },
);
