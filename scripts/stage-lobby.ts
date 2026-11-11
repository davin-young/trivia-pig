/**
 * Fill a lobby with players so the room screen can be looked at on a TV or in a browser.
 *   BASE_URL=http://localhost:3000 PLAYERS=8 npx tsx scripts/stage-lobby.ts
 * Prints the display URL and keeps the players connected until you press Ctrl+C.
 */
import { io } from "socket.io-client";

const BASE = process.env.BASE_URL ?? "http://localhost:3000";
const EMAIL = process.env.SEED_EMAIL ?? "demo@example.com";
const PASSWORD = process.env.SEED_PASSWORD ?? "demo1234";
const COUNT = Number(process.env.PLAYERS ?? 8);
const HOLD_MS = Number(process.env.HOLD_SEC ?? 600) * 1000;

const NAMES = ["Maya", "Jonas", "Priya", "Theo", "Lucia", "Sam", "Imani", "Kenji", "Rosa", "Dev", "Nora", "Felix", "Zoe", "Omar", "Ada", "Hugo"];
const COLORS = ["#ffd23f", "#ff5d73", "#4ff0b1", "#7bdff2", "#c792ff", "#ff8c42", "#b8f35d", "#ff7ad9"];

/** A loopy scribble that reads as a hand-drawn signature. */
function scribble(seed: number) {
  let s = seed * 9301 + 49297;
  const rnd = () => ((s = (s * 9301 + 49297) % 233280) / 233280);
  const strokes = [];
  const letters = 3 + Math.floor(rnd() * 3);
  const step = 520 / letters;
  for (let l = 0; l < letters; l++) {
    const cx = 40 + step * l + step / 2;
    const r = step * (0.3 + rnd() * 0.12);
    const turns = 1 + rnd() * 0.8;
    const p: [number, number, number][] = [];
    for (let i = 0; i <= 26; i++) {
      const a = (i / 26) * Math.PI * 2 * turns + rnd() * 0.15;
      p.push([Math.round(cx + Math.cos(a) * r * (0.6 + i / 60)), Math.round(120 + Math.sin(a) * (55 + rnd() * 12) - i * 0.8), 0.4 + rnd() * 0.4]);
    }
    strokes.push({ c: COLORS[(seed + (seed % 3 === 0 ? l : 0)) % COLORS.length], s: 9 + (seed % 3) * 3, p });
  }
  strokes.push({ c: COLORS[(seed + 3) % COLORS.length], s: 6, p: [[50, 205, 0.5], [300, 215 - (seed % 4) * 4, 0.6], [550, 200, 0.4]] as [number, number, number][] });
  return { v: 1, w: 600, h: 240, strokes };
}

async function main() {
  const headers = { "content-type": "application/json" };
  const login = await fetch(`${BASE}/api/auth/login`, { method: "POST", headers, body: JSON.stringify({ email: EMAIL, password: PASSWORD }), redirect: "manual" });
  if (!login.ok) throw new Error(`Sign-in failed (${login.status})`);
  const cookie = (login.headers.get("set-cookie") ?? "").split(";")[0];
  const boards = await (await fetch(`${BASE}/api/boards`, { headers: { cookie } })).json();
  const board = boards.boards[0];
  if (!board) throw new Error("No boards for this account (run the seed first)");
  const game = await (await fetch(`${BASE}/api/games`, { method: "POST", headers: { ...headers, cookie }, body: JSON.stringify({ boardId: board.id }) })).json();
  console.log(`Display: ${BASE}/display/${game.code}`);
  console.log(`Host:    ${BASE}/host/${game.code}`);

  for (let i = 0; i < COUNT; i++) {
    const s = io(BASE, { path: "/socket.io", transports: ["websocket"], auth: { role: "player", code: game.code } });
    await new Promise<void>((resolve, reject) => {
      s.on("connect_error", reject);
      s.on("connect", () =>
        s.emit("player:join", { name: NAMES[i % NAMES.length] + (i >= NAMES.length ? ` ${Math.floor(i / NAMES.length) + 1}` : ""), signature: i % 5 === 4 ? null : scribble(i + 1), avatar: i % 3 === 0 ? { ...scribble(i + 7), w: 600, h: 600 } : null }, (r: { ok: boolean; error?: string }) =>
          r.ok ? resolve() : reject(new Error(r.error)),
        ),
      );
    });
    console.log(`  joined ${NAMES[i % NAMES.length]}`);
    await new Promise((r) => setTimeout(r, Number(process.env.JOIN_GAP_MS ?? 700)));
  }
  console.log(`STAGED ${game.code}. Holding ${HOLD_MS / 1000}s (Ctrl+C to stop).`);
  setTimeout(() => process.exit(0), HOLD_MS);
}

main().catch((err) => {
  console.error(err);
  process.exit(1);
});
