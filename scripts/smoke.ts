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

  const created = await api("/api/games", { method: "POST", cookie, body: JSON.stringify({ boardId: board.id, settings: { earlyBuzzLockoutMs: 300, startCountdownSec: 0 } }) });
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
  const created2 = await api("/api/games", { method: "POST", cookie, body: JSON.stringify({ boardId: board.id, settings: { autoUnlock: true, allPlayTimerSec: 5, startCountdownSec: 0 } }) });
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

  // ---- party features: VIP start, countdown, audience, avatars, family mode, seat reclaim, public results ----
  const created3 = await api("/api/games", { method: "POST", cookie, body: JSON.stringify({ boardId: board.id, settings: { startCountdownSec: 2, familyMode: true, vipStart: true } }) });
  const game3 = await created3.json();
  assert(created3.ok && game3.id, `third game created (${game3.code})`);
  const h3 = connect({ role: "host", code: game3.code }, cookie);
  const d3 = connect({ role: "display", code: game3.code });
  const pa = connect({ role: "player", code: game3.code });
  const pb = connect({ role: "player", code: game3.code });
  const pw = connect({ role: "player", code: game3.code });
  await d3.until((v) => v.phase === "lobby", "third lobby");
  const ink = { v: 1, w: 600, h: 240, strokes: [{ c: "#ffd23f", s: 10, p: [[10, 10, 0.5], [50, 60, 0.6], [90, 20, 0.5]] }] };
  const ja = await pa.emit("player:join", { name: "Vera", signature: ink, avatar: { ...ink, w: 300, h: 300 } });
  const jb = await pb.emit("player:join", { name: "Bram", signature: null });
  assert(ja.ok && jb.ok, "two players join the third game");
  const vipId = (ja.data as { playerId: string }).playerId;
  const bramId = (jb.data as { playerId: string }).playerId;
  let v3 = await d3.until((v) => v.players.length === 2, "display sees both players");
  assert(v3.vipId === vipId, "first player in is the VIP (when the host turned that on)");
  type Mini = { kind: string; round: { phase: string; kind: string } | null } | null;
  const miniIs = (ok: (m: Mini) => boolean) =>
    new Promise<Mini>((resolve) => {
      const on = (m: Mini) => ok(m) && (d3.s.off("mini", on), resolve(m));
      d3.s.on("mini", on);
    });
  const counting = miniIs((m) => m?.round?.phase === "countdown");
  assert((await pb.emit("player:tap", { n: 1 })).ok, "a player starts a lobby game");
  assert((await counting)?.round?.kind === "race", "the display is told the pig race is counting down");
  const swapped = miniIs((m) => m?.kind === "tug" && m.round?.phase === "countdown");
  assert((await h3.emit("host:minigame", { kind: "tug", restart: true })).ok, "the host switches the lobby game and restarts it");
  assert(!!(await swapped), "the display follows the host's choice of game");
  assert(!(await pb.emit("host:minigame", { stop: true })).ok, "a player cannot control the lobby games");
  const stopped = miniIs((m) => !!m && m.round === null);
  await h3.emit("host:minigame", { stop: true });
  assert(!!(await stopped), "the host can stop a lobby game");

  // A bigger lobby game, start to finish: Closest guess keeps the answer back until the round is over.
  type GuessMini = { kind: string; round: { phase: string; x?: { answer?: number; voted?: number; mine?: { value?: number }; values?: { id: string; value: number }[] } } | null } | null;
  const miniSeen = (sock: typeof d3.s, ok: (m: GuessMini) => boolean) =>
    new Promise<GuessMini>((resolve) => {
      const on = (m: GuessMini) => ok(m) && (sock.off("mini", on), resolve(m));
      sock.on("mini", on);
    });
  const guessing = miniSeen(d3.s, (m) => m?.kind === "guess" && m.round?.phase === "running");
  await h3.emit("host:minigame", { kind: "guess", restart: true });
  await pa.emit("player:tap", { n: 1 });
  await pb.emit("player:tap", { n: 1 });
  assert((await guessing)?.round?.x?.answer === undefined, "the big screen is not told the answer while people are guessing");
  const mine = miniSeen(pa.s, (m) => m?.round?.x?.mine?.value === 123);
  const notMine = miniSeen(pb.s, (m) => m?.round?.x?.voted === 1);
  assert((await pa.emit("player:tap", { pick: 123 })).ok, "a player sends a guess");
  assert(!!(await mine), "the player's own phone shows their guess");
  assert((await notMine)?.round?.x?.mine?.value === undefined, "another player's phone is not sent that guess");
  const over = miniSeen(d3.s, (m) => m?.round?.phase === "done");
  await pb.emit("player:tap", { pick: 7 });
  const result = await over;
  assert(typeof result?.round?.x?.answer === "number" && result.round.x.values?.length === 2, "the answer and everyone's guesses are shown when the round ends");
  const cleared = miniSeen(d3.s, (m) => !!m && m.round === null);
  await h3.emit("host:minigame", { stop: true });
  await cleared;
  assert(v3.players[0].signature === null && v3.players[0].avatar === null, "family mode keeps unapproved drawings off the display");
  const hv3 = await h3.until((v) => v.players.length === 2, "host sees both players");
  assert(!!hv3.players[0].signature && !!hv3.players[0].avatar && hv3.players[0].signatureHidden, "host can see the drawing and avatar awaiting approval");
  await h3.emit("host:action", { action: { type: "player/hideSignature", playerId: vipId, hidden: false } });
  v3 = await d3.until((v) => !!v.players[0].signature && !!v.players[0].avatar, "approved drawing and avatar reach the display");
  assert(true, "host approval puts the drawing and avatar on the display");

  const jw = await pw.emit("player:join", { name: "Wren", signature: null, audience: true });
  assert(jw.ok, "someone joins the audience");
  v3 = await d3.until((v) => v.crowd.count === 1, "display counts the audience");
  assert(v3.players.length === 2, "audience members are not contestants");
  assert((await pw.emit("player:cheer", { contestantId: bramId })).ok, "audience cheers for a player");
  await d3.until((v) => v.crowd.cheers[bramId] === 1, "display shows the cheer");
  assert(((await pw.emit("player:buzz", {})).data as { accepted: boolean }).accepted === false, "audience cannot buzz");
  assert(!(await pa.emit("player:cheer", { contestantId: bramId })).ok, "players cannot cast audience cheers");

  // Links for viewers carry a watch token, not the room code: watch and join the audience, nothing else.
  const token = (await h3.until((v) => !!v.watchToken, "host is given the watch token")).watchToken!;
  assert(!token.toUpperCase().includes(game3.code), "the watch token does not contain the room code");
  const viewer = connect({ role: "display", code: token.toUpperCase() });
  const seen = await viewer.until((v) => v.phase === "lobby", "watch-link viewer connected");
  assert(seen.code === "" && seen.watchToken === null && !JSON.stringify(seen).includes(game3.code), "a watch-link viewer is never sent the room code");
  const sneak = connect({ role: "player", code: token });
  const js = await sneak.emit("player:join", { name: "Sly", signature: null });
  assert(js.ok && (js.data as { playerId: string }).playerId.startsWith("a_"), "a watch token only gets into the audience");
  v3 = await d3.until((v) => v.crowd.count === 2, "display counts the second audience member");
  assert(v3.players.length === 2, "a watch token cannot add a contestant");
  assert((await sneak.until((v) => !!v.me, "audience member bound")).code === "", "an audience member from a watch link is not sent the room code either");
  const fakeHost = connect({ role: "host", code: token }, cookie);
  assert((await new Promise<string>((r) => fakeHost.s.on("connect_error", (e) => r(e.message)))).includes("Not authorized"), "a watch token cannot host, even signed in");
  const forged = connect({ role: "display", code: `${token.slice(0, -1)}${token.endsWith("0") ? "1" : "0"}` });
  assert((await new Promise<string>((r) => forged.s.on("connect_error", (e) => r(e.message)))) === "Game not found", "a changed watch token is refused");
  viewer.s.close();
  sneak.s.close();

  // Bram's phone dies; he takes his seat back from another device by name.
  const stolen = connect({ role: "player", code: game3.code });
  await stolen.until((v) => v.phase === "lobby", "new device connected");
  assert(!(await stolen.emit("player:reclaim", { playerId: bramId })).ok, "a seat that is in use cannot be taken");
  pb.s.close();
  await new Promise((r) => setTimeout(r, 400));
  // A phone that only just dropped keeps its seat for the reconnect grace (20 s).
  assert(((await stolen.emit("player:seats", {})).data as { seats: unknown[] }).seats.length === 0, "a seat that just dropped is not offered yet");
  assert(!(await stolen.emit("player:reclaim", { playerId: bramId })).ok, "a seat that just dropped cannot be taken");
  await new Promise((r) => setTimeout(r, 20_500));
  const seats = (await stolen.emit("player:seats", {})).data as { seats: { id: string; name: string }[] };
  assert(seats.seats.length === 1 && seats.seats[0].name === "Bram", "the empty seat is offered by name");
  const back = await stolen.emit("player:reclaim", { playerId: bramId });
  assert(back.ok && (back.data as { playerId: string }).playerId === bramId, "player reclaims their seat on a new device");
  await stolen.until((v) => v.me?.playerId === bramId, "reclaimed seat is bound");
  assert(((await stolen.emit("player:seats", {})).data as { seats: unknown[] }).seats.length === 0, "the seat is no longer offered");

  assert(!(await stolen.emit("player:start", {})).ok, "only the VIP can start from a phone");
  assert((await pa.emit("player:start", {})).ok, "VIP starts the game from their phone");
  v3 = await d3.until((v) => !!v.startingAt, "countdown shows on the display");
  assert(v3.phase === "lobby", "the room stays open during the countdown");
  await d3.until((v) => v.phase === "board", "game starts when the countdown ends", 6000);
  assert(true, "game starts by itself when the countdown ends");
  assert((await api(`/r/${game3.id}`)).status === 404, "results are not public while the game is running");
  await h3.emit("host:action", { action: { type: "game/end" } });
  const fin3 = await d3.until((v) => v.phase === "finished", "third game finished");
  assert(fin3.gameId === game3.id && (fin3.awards ?? []).some((a) => a.id === "crowd" && a.winnerId === bramId), "crowd favorite award goes to the most-cheered player");
  await new Promise((r) => setTimeout(r, 900)); // let the write-behind save land
  const pub = await api(`/r/${game3.id}`);
  const pubHtml = await pub.text();
  assert(pub.ok && pubHtml.includes("Final results") && pubHtml.includes("Crowd Favorite") && !pubHtml.includes("answer"), "public results page shows standings and awards without signing in");
  for (const c of [h3, d3, pa, pw, stolen]) c.s.close();

  // ---- boards: concurrent-edit protection, public gallery, leaderboard, guest builder ----
  const made = await (await api("/api/boards", { method: "POST", cookie, body: JSON.stringify({ title: `Smoke gallery ${game.code}`, template: "quick" }) })).json();
  const loaded = await (await api(`/api/boards/${made.id}`, { cookie })).json();
  const save1 = await api(`/api/boards/${made.id}`, { method: "PUT", cookie, body: JSON.stringify({ baseRev: loaded.rev, description: "first editor" }) });
  assert(save1.ok && (await save1.json()).rev === loaded.rev + 1, "saving with the current revision works and bumps it");
  const stale = await api(`/api/boards/${made.id}`, { method: "PUT", cookie, body: JSON.stringify({ baseRev: loaded.rev, description: "second editor, stale" }) });
  assert(stale.status === 409 && (await stale.json()).conflict === true, "a stale editor gets a conflict instead of overwriting");
  assert((await (await api(`/api/boards/${made.id}`, { cookie })).json()).description === "first editor", "the earlier save was not overwritten");

  const galleryBefore = await (await api("/gallery")).text();
  assert(!galleryBefore.includes(`Smoke gallery ${game.code}`), "unlisted boards are not in the gallery");
  const viewOnly = await (await api(`/api/boards/${made.id}/share`, { method: "POST", cookie, body: JSON.stringify({ mode: "VIEW", listed: true }) })).json();
  assert(viewOnly.listed === false, "view-only boards cannot be listed");
  const listed = await (await api(`/api/boards/${made.id}/share`, { method: "POST", cookie, body: JSON.stringify({ mode: "COPY", listed: true }) })).json();
  assert(listed.listed === true, "owner lists a board in the gallery");
  const galleryAfter = await api("/gallery");
  assert(galleryAfter.ok && (await galleryAfter.text()).includes(`Smoke gallery ${game.code}`), "listed board appears in the public gallery without signing in");
  await api(`/api/boards/${made.id}/share`, { method: "POST", cookie, body: JSON.stringify({ mode: "OFF" }) });
  assert(!(await (await api("/gallery")).text()).includes(`Smoke gallery ${game.code}`), "turning sharing off removes it from the gallery");
  await api(`/api/boards/${made.id}`, { method: "PATCH", cookie, body: JSON.stringify({ action: "trash" }) });

  const lb = await api("/dashboard/leaderboard?season=all", { cookie });
  assert(lb.ok && (await lb.text()).includes("Leaderboard"), "leaderboard page renders");
  assert((await api("/dashboard/leaderboard")).status !== 200, "leaderboard needs a sign-in");
  const tryPage = await api("/try");
  assert(tryPage.ok && (await tryPage.text()).includes("Sign in to save"), "guest board builder opens without an account");
  assert((await api("/api/boards", { method: "POST", body: JSON.stringify({ title: "x" }) })).status === 401, "guests cannot save boards on the server");
  const ai = await api("/api/boards/generate", { cookie });
  assert(ai.ok && typeof (await ai.json()).enabled === "boolean", "AI draft availability is reported");
  const health = await (await api("/readyz")).json();
  assert(health.ok === true && health.db === true, "readiness endpoint reports healthy");
  console.log("\nAll smoke checks passed.");
  process.exit(0);
}

main().catch((e) => {
  console.error(e);
  process.exit(1);
});
