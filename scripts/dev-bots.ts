// Dev helper: creates a game from your first board and joins 3 bot players that stay connected.
// Usage: npx tsx scripts/dev-bots.ts   (needs the seeded demo user)
import { io } from "socket.io-client";
const BASE = process.env.BASE_URL ?? "http://localhost:3000";
const login = await fetch(BASE + "/api/auth/login", { method: "POST", headers: { "content-type": "application/json" }, body: JSON.stringify({ email: "demo@example.com", password: "demo1234" }) });
const cookie = (login.headers.get("set-cookie") ?? "").split(";")[0];
const boards = await (await fetch(BASE + "/api/boards", { headers: { cookie } })).json();
const board = boards.boards[0];
const g = await (await fetch(BASE + "/api/games", { method: "POST", headers: { "content-type": "application/json", cookie }, body: JSON.stringify({ boardId: board.id }) })).json();
console.log("CODE", g.code, "COOKIE", cookie);
function sig(seed: number, color: string) {
  const pts: [number, number, number][] = [];
  for (let i = 0; i < 60; i++) {
    const x = 60 + i * 8;
    const y = 120 + Math.sin(i / 3 + seed) * 50 * Math.cos(i / 9);
    pts.push([x, y, 0.5]);
  }
  return { v: 1, w: 600, h: 240, strokes: [{ c: color, s: 12, p: pts }, { c: "rainbow", s: 8, p: pts.map(([x, y]) => [x, y + 40, 0.5]) }] };
}
const names = [["Alice", "#ffd23f"], ["Bob", "#4ff0b1"], ["Cy", "#ff7ad9"]];
for (const [i, [n, c]] of names.entries()) {
  const s = io(BASE, { transports: ["websocket"], auth: { role: "player", code: g.code } });
  s.on("connect", () => s.emit("player:join", { name: n, signature: i === 2 ? null : sig(i, c) }, (a: unknown) => console.log(n, JSON.stringify(a).slice(0, 60))));
}
setInterval(() => {}, 1 << 30);
