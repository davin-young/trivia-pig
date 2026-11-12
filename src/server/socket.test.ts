import { afterEach, describe, expect, it } from "vitest";
import { GameHistory } from "@/engine/history";
import { DEFAULT_SETTINGS, type Settings } from "@/engine/types";
import { makeRound } from "@/shared/board";
import { hostIntentSchema, type Ack } from "@/shared/protocol";
import { LiveGame, MAX_PROFILE_CHANGES, type GameManager, type GameSocket } from "./live";
import { playerHandlers, socketIp } from "./socket";

const ink = { v: 1 as const, w: 600, h: 240, strokes: [{ c: "#fff", s: 8, p: [[1, 1, 0.5], [9, 9, 0.5]] as [number, number, number][] }] };
const GRACE_MS = 20_000;

let games: LiveGame[] = [];
afterEach(() => {
  for (const g of games) g.dispose(); // stops the save timer before it reaches for a database
  games = [];
});

function live(settings: Partial<Settings> = {}) {
  const history = new GameHistory({ board: { rounds: [makeRound("single", 2, [100, 200])], final: null }, settings: { ...DEFAULT_SETTINGS, ...settings } });
  const game = new LiveGame("g1", "ABCDE", "owner", null, "Test", history, { scheduleEvict() {} } as unknown as GameManager);
  games.push(game);
  return game;
}

let n = 0;
function fakeSocket(game: LiveGame, data: Partial<GameSocket["data"]> = {}) {
  const sent: string[] = [];
  const socket = {
    id: `s${++n}`,
    data: { role: "player", gameId: game.id, code: game.code, playerId: null, ...data },
    emit: (event: string) => sent.push(event),
    disconnect: () => sent.push("disconnect"),
  } as unknown as GameSocket;
  game.attach(socket);
  return { socket, sent };
}

function seat(game: LiveGame, id: string, name: string) {
  expect(game.dispatch({ type: "player/join", playerId: id, name, signature: null }, `player:${id}`).ok).toBe(true);
}

const call = (event: keyof typeof playerHandlers, game: LiveGame, socket: GameSocket, payload: unknown) => playerHandlers[event]!(game, socket, payload as never) as Promise<Ack> | Ack;

describe("client address for socket limits", () => {
  const prev = process.env.TRUST_PROXY;
  afterEach(() => {
    if (prev === undefined) delete process.env.TRUST_PROXY;
    else process.env.TRUST_PROXY = prev;
  });

  it("ignores forwarding headers unless a proxy is trusted", () => {
    delete process.env.TRUST_PROXY;
    expect(socketIp({ "cf-connecting-ip": "203.0.113.9", "x-forwarded-for": "203.0.113.9" }, "10.0.0.5")).toBe("10.0.0.5");
    expect(socketIp({}, undefined)).toBe("unknown");
  });

  it("behind a trusted proxy takes Cloudflare's header, else the hop the proxy added", () => {
    process.env.TRUST_PROXY = "true";
    expect(socketIp({ "cf-connecting-ip": "203.0.113.9", "x-forwarded-for": "1.1.1.1" }, "10.0.0.5")).toBe("203.0.113.9");
    expect(socketIp({ "x-forwarded-for": "6.6.6.6, 198.51.100.7" }, "10.0.0.5")).toBe("198.51.100.7");
    expect(socketIp({}, "10.0.0.5")).toBe("10.0.0.5");
  });
});

describe("ids in host actions", () => {
  it("refuses the names that reach Object.prototype", () => {
    for (const bad of ["__proto__", "constructor", "prototype"]) {
      expect(hostIntentSchema.safeParse({ type: "player/rename", playerId: bad, name: "x" }).success).toBe(false);
      expect(hostIntentSchema.safeParse({ type: "score/set", contestantId: bad, score: 5 }).success).toBe(false);
    }
    expect(hostIntentSchema.safeParse({ type: "player/rename", playerId: "p_abc", name: "x" }).success).toBe(true);
  });
});

describe("rejoining with an existing token", () => {
  it("writes nothing to the log when nothing changed", async () => {
    const game = live();
    seat(game, "a", "Ann");
    const { socket } = fakeSocket(game, { playerId: "a" });
    const before = game.history.log.length;
    expect(await call("player:join", game, socket, { name: "Ann", signature: null })).toMatchObject({ ok: true, data: { playerId: "a" } });
    expect(game.history.log.length).toBe(before);
  });

  it("throttles drawings sent through a rejoin, and stops counting them at the per-game limit", async () => {
    const game = live();
    seat(game, "a", "Ann");
    const first = fakeSocket(game, { playerId: "a" }).socket;
    expect(await call("player:join", game, first, { name: "Ann", signature: ink })).toMatchObject({ ok: true });
    expect(await call("player:join", game, first, { name: "Ann", signature: ink })).toEqual({ ok: false, error: "Slow down" });
    // More sockets get round the per-socket throttle, but not the per-player limit.
    for (let i = 0; i < MAX_PROFILE_CHANGES + 5; i++) await call("player:join", game, fakeSocket(game, { playerId: "a" }).socket, { name: "Ann", signature: ink });
    expect(game.history.log.length).toBe(MAX_PROFILE_CHANGES);
    const fresh = fakeSocket(game, { playerId: "a" }).socket;
    expect(await call("player:signature", game, fresh, { signature: ink })).toMatchObject({ ok: false });
    expect(game.history.log.length).toBe(MAX_PROFILE_CHANGES);
  });

  it("does not undo a kick or a ban", async () => {
    const game = live();
    seat(game, "a", "Ann");
    seat(game, "b", "Bob");
    game.dispatch({ type: "player/kick", playerId: "a" }, "host:u");
    game.dispatch({ type: "player/ban", playerId: "b" }, "host:u");
    game.dispatch({ type: "lobby/lock", locked: true }, "host:u");
    // Kicked: treated as a newcomer, so a locked lobby keeps them out and the old seat stays removed.
    expect(await call("player:join", game, fakeSocket(game, { playerId: "a" }).socket, { name: "Ann", signature: null })).toEqual({ ok: false, error: "The lobby is locked" });
    expect(game.state.players.a.removed).toBe(true);
    expect(await call("player:join", game, fakeSocket(game, { playerId: "b" }).socket, { name: "Bob", signature: null })).toEqual({ ok: false, error: "You can't rejoin this game" });
    expect(game.state.players.b.removed).toBe(true);
  });
});

describe("taking a seat back", () => {
  it("offers a seat only once its phone has been gone longer than the reconnect grace", () => {
    const game = live();
    seat(game, "a", "Ann");
    seat(game, "b", "Bob");
    const ann = fakeSocket(game, { playerId: "a" }).socket;
    const bob = fakeSocket(game, { playerId: "b" }).socket;
    const t0 = Date.now() + 60_000; // well after the game was loaded
    expect(game.emptySeats(t0)).toEqual([]);
    game.detach(ann);
    const dropped = game.playerLastSeen.get("a")!;
    expect(game.emptySeats(dropped + GRACE_MS - 1)).toEqual([]);
    expect(game.emptySeats(dropped + GRACE_MS)).toEqual([{ id: "a", name: "Ann" }]);
    void bob;
  });

  it("treats everyone as only just gone right after the server loads a game", () => {
    const game = live();
    seat(game, "a", "Ann");
    expect(game.emptySeats()).toEqual([]);
  });

  it("refuses a seat that only just dropped, and callers who already have a seat or were removed", async () => {
    const game = live();
    seat(game, "a", "Ann");
    seat(game, "b", "Bob");
    seat(game, "c", "Cy");
    game.dispatch({ type: "player/kick", playerId: "c" }, "host:u");
    const ann = fakeSocket(game, { playerId: "a" }).socket;
    game.detach(ann);
    const stranger = fakeSocket(game).socket;
    expect(await call("player:reclaim", game, stranger, { playerId: "a" })).toMatchObject({ ok: false, error: expect.stringContaining("in use") });
    expect(stranger.data.playerId).toBeNull();
    for (const bound of ["b", "c"]) {
      const s = fakeSocket(game, { playerId: bound }).socket;
      expect(await call("player:reclaim", game, s, { playerId: "a" })).toEqual({ ok: false, error: "You already have a seat in this game." });
      expect(s.data.playerId).toBe(bound);
    }
  });
});

describe("turning spectators off", () => {
  it("disconnects the watch link and overlays, and leaves the big screen and players alone", () => {
    const game = live();
    const watcher = fakeSocket(game, { role: "display", spectator: true });
    const screen = fakeSocket(game, { role: "display", spectator: false });
    const player = fakeSocket(game);
    game.dispatch({ type: "settings/update", settings: { spectators: false } }, "host:u");
    expect(watcher.sent.at(-1)).toBe("disconnect");
    expect(watcher.sent).toContain("state"); // the last state tells the page why
    expect(screen.sent).not.toContain("disconnect");
    expect(player.sent).not.toContain("disconnect");
  });
});

describe("watch-link connections", () => {
  function capture(game: LiveGame, data: Partial<GameSocket["data"]>) {
    const states: { code: string; watchToken: string | null; showJoinQr: boolean; settings: Settings }[] = [];
    const redirects: string[] = [];
    const socket = {
      id: `s${++n}`,
      data: { role: "display", gameId: game.id, code: game.code, playerId: null, ...data },
      emit: (event: string, payload: never) => {
        if (event === "state") states.push(payload);
        if (event === "redirect") redirects.push((payload as { code: string }).code);
      },
      disconnect: () => {},
    } as unknown as GameSocket;
    game.attach(socket);
    return { socket, states, redirects };
  }

  it("never sends the room code to someone who came in through a watch link", () => {
    const game = live();
    const viewer = capture(game, { spectator: true, viaWatch: true });
    const screen = capture(game, {});
    const host = capture(game, { role: "host", userId: "owner", hostRole: "HOST" });
    seat(game, "a", "Ann"); // a broadcast
    game.sendState(viewer.socket);
    expect(viewer.states.length).toBeGreaterThan(1);
    for (const s of viewer.states) {
      expect(JSON.stringify(s)).not.toContain("ABCDE");
      expect(s.settings.hideCode).toBe(true);
      expect(s.showJoinQr).toBe(false);
      expect(s.watchToken).toBeNull();
    }
    expect(screen.states.at(-1)).toMatchObject({ code: "ABCDE", watchToken: null });
    expect(screen.states.at(-1)!.settings.hideCode).toBe(false);
    // Only the host is given the token, to build the links from.
    expect(host.states.at(-1)!.watchToken).toMatch(/^g1[0-9a-f]{20}$/);
  });

  it("sends watch-link viewers to the next game by its watch token, everyone else by its code", () => {
    const game = live();
    const viewer = capture(game, { spectator: true, viaWatch: true });
    const screen = capture(game, {});
    game.redirectAll("NEXTC", "g2");
    expect(screen.redirects).toEqual(["NEXTC"]);
    expect(viewer.redirects).toHaveLength(1);
    expect(viewer.redirects[0]).toMatch(/^g2[0-9a-f]{20}$/);
  });

  it("cannot be used to take a player's seat", async () => {
    const game = live();
    seat(game, "a", "Ann");
    const ann = fakeSocket(game, { playerId: "a" }).socket;
    game.detach(ann);
    const viewer = fakeSocket(game, { viaWatch: true }).socket;
    expect(await call("player:seats", game, viewer, {})).toEqual({ ok: true, data: { seats: [] } });
    expect(await call("player:reclaim", game, viewer, { playerId: "a" })).toMatchObject({ ok: false, error: expect.stringContaining("watching") });
  });
});
