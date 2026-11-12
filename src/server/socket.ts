import { gameNow } from "@/shared/clock";
import type { Server, Socket } from "socket.io";
import { nanoid } from "nanoid";
import { clientEvents, hostIntentSchema, SCOREKEEPER_INTENTS, type Ack, type ClientEvent } from "@/shared/protocol";
import { containsProfanity, cleanName } from "./profanity";
import { TokenBucket, hit } from "./rateLimit";
import { RttTracker } from "./buzzQueue";
import { authorizeSocket, SocketAuthError, type SocketAuthDeps } from "./socketAuth";
import { getManager, type GameSocket, type LiveGame } from "./live";
import { prisma } from "./db";
import { randomToken, sha256 } from "./crypto";
import { gameIdFromWatchToken } from "./watchToken";
import { userFromSessionToken } from "./auth";
import { hostRoleFor } from "./access";
import { pairing } from "./pairingStore";
import { compactDrawing } from "@/shared/strokes";
import { own, vipOf } from "@/engine/reducer";

export const prismaSocketAuthDeps: SocketAuthDeps = {
  async findGame(code) {
    const g = await getManager().findByCode(code);
    return g ? { id: g.id, code: g.code, ownerId: g.ownerId } : null;
  },
  async findGameByWatchToken(token) {
    const id = gameIdFromWatchToken(token);
    const g = id ? await prisma.game.findUnique({ where: { id }, select: { id: true, code: true, ownerId: true } }) : null;
    return g;
  },
  async userIdFromSession(token) {
    return (await userFromSessionToken(token))?.id ?? null;
  },
  hostRoleFor,
  async verifyGrant(token, gameId) {
    const g = await pairing.verifyGrant(token, gameId);
    return g ? { userId: g.userId, role: g.role } : null;
  },
  async playerIdForToken(gameId, tokenHash) {
    const p = await prisma.gamePlayer.findFirst({ where: { gameId, tokenHash } });
    return p?.playerId ?? null;
  },
  async spectatorsAllowed(gameId) {
    const manager = getManager();
    const game = await manager.load(gameId);
    if (!game) return true; // the connection handler reports the missing game
    // Loaded only to answer this: let it go again if nobody ends up connecting.
    if (game.sockets.size === 0) manager.scheduleEvict(game);
    return game.state.settings.spectators;
  },
};

/** Most sockets one address may hold at once. Generous, because a whole venue often shares one public address. */
export const MAX_SOCKETS_PER_IP = 250;
/** Handshakes one address may start per minute: room for a full venue reconnecting more than once after a restart. */
export const HANDSHAKES_PER_MIN = 600;
const socketsByIp = new Map<string, number>();

/**
 * Client address for per-address limits. Forwarding headers count only behind a trusted proxy
 * (TRUST_PROXY=true): Cloudflare's header first, else the right-most X-Forwarded-For hop (the one
 * our proxy added). Otherwise it is the address the connection came from.
 */
export function socketIp(headers: Record<string, string | string[] | undefined>, address: string | undefined): string {
  if (process.env.TRUST_PROXY === "true") {
    const header = (name: string) => [headers[name]].flat().join(",");
    const forwarded = header("cf-connecting-ip").trim() || header("x-forwarded-for").split(",").pop()?.trim();
    if (forwarded) return forwarded;
  }
  return address || "unknown";
}

type Handler = (game: LiveGame, socket: GameSocket, payload: never) => Promise<Ack> | Ack;

/** Per-event extra cost on the socket's token bucket (drawings are expensive). */
const COST: Partial<Record<ClientEvent, number>> = {
  "player:join": 5,
  "player:signature": 8,
  "player:finalAnswer": 8,
  "player:allPlayAnswer": 8,
  "player:react": 2,
  "player:seats": 2,
  "player:reclaim": 6,
};

export function attachSocketServer(io: Server, deps: SocketAuthDeps = prismaSocketAuthDeps) {
  const manager = getManager();
  manager.io = io;

  io.use(async (socket, next) => {
    const ip = socketIp(socket.handshake.headers, socket.handshake.address);
    if (!hit(`ws:${ip}`, HANDSHAKES_PER_MIN, 60_000) || (socketsByIp.get(ip) ?? 0) >= MAX_SOCKETS_PER_IP) {
      return next(new Error("Too many connections from this network. Try again in a minute."));
    }
    try {
      const id = await authorizeSocket(socket.handshake.auth, socket.handshake.headers.cookie, deps);
      socket.data = {
        role: id.role,
        gameId: id.game.id,
        code: id.game.code,
        userId: id.role === "host" ? id.userId : undefined,
        hostRole: id.role === "host" ? id.hostRole : undefined,
        playerId: id.role === "player" ? id.playerId : undefined,
        spectator: id.role === "display" ? id.spectator : undefined,
        viaWatch: id.role !== "host" && id.viaWatch ? true : undefined,
      };
      next();
    } catch (err) {
      next(new Error(err instanceof SocketAuthError ? err.message : "Connection failed"));
      if (!(err instanceof SocketAuthError)) console.error("[socket auth]", err);
    }
  });

  io.on("connection", (raw: Socket) => {
    const socket = raw as unknown as GameSocket;
    const ip = socketIp(raw.handshake.headers, raw.handshake.address);
    socketsByIp.set(ip, (socketsByIp.get(ip) ?? 0) + 1);
    // Register listeners synchronously so messages sent immediately after
    // connecting aren't dropped while the game loads from the database.
    const gameP = manager
      .load(socket.data.gameId)
      .catch((err) => {
        console.error("[socket] could not load game %s", socket.data.code, err);
        return null;
      })
      .then((game) => {
      if (!game) {
        raw.emit("error", { message: "Game not found" });
        raw.disconnect(true);
        return null;
      }
      manager.cancelEvict(game.id);
      if (raw.connected) game.attach(socket);
      return game;
    });

    const bucket = new TokenBucket(20, 10);
    const handlers = handlersFor(socket.data.role);

    // Players: measure round-trip time from the server side (clients can't fake it)
    // so buzzes can be ordered by when the button was pressed.
    let rttTimer: NodeJS.Timeout | null = null;
    if (socket.data.role === "player") {
      const tracker = new RttTracker();
      rtts.set(socket, tracker);
      const probe = () => {
        const sent = gameNow();
        raw.timeout(3000).emit("rtt", (err: Error | null) => {
          if (!err) tracker.add(gameNow() - sent);
        });
      };
      probe();
      setTimeout(probe, 500);
      rttTimer = setInterval(probe, 4000);
    }

    for (const event of Object.keys(clientEvents) as ClientEvent[]) {
      raw.on(event, async (payload: unknown, ack?: (a: Ack) => void) => {
        const reply = typeof ack === "function" ? ack : () => {};
        if (!bucket.take(COST[event] ?? 1)) return reply({ ok: false, error: "Slow down" });
        const handler = handlers[event];
        if (!handler) return reply({ ok: false, error: "Not allowed" });
        const parsed = clientEvents[event].safeParse(payload ?? {});
        if (!parsed.success) {
          const field = String(parsed.error.issues[0]?.path[0] ?? "");
          console.warn("[socket %s] rejected: %s", event, parsed.error.issues.slice(0, 3).map((i) => `${i.path.join(".")}: ${i.message}`).join("; "));
          const drawn = field === "signature" || field === "avatar" || field === "drawing";
          return reply({ ok: false, error: drawn ? "That drawing couldn't be sent. Clear it and draw it again." : field === "name" ? "Enter a name of 1 to 24 characters." : "Invalid message" });
        }
        const game = await gameP;
        if (!game) return reply({ ok: false, error: "Game not found" });
        try {
          reply(await handler(game, socket, parsed.data as never));
        } catch (err) {
          console.error("[socket %s]", event, err);
          reply({ ok: false, error: "Server error" });
        }
      });
    }

    raw.on("disconnect", () => {
      const left = (socketsByIp.get(ip) ?? 1) - 1;
      if (left > 0) socketsByIp.set(ip, left);
      else socketsByIp.delete(ip);
      if (rttTimer) clearInterval(rttTimer);
      void gameP.then((game) => game?.detach(socket));
    });
  });
}

const rtts = new WeakMap<object, RttTracker>();

function handlersFor(role: "display" | "host" | "player"): Partial<Record<ClientEvent, Handler>> {
  const common: Partial<Record<ClientEvent, Handler>> = {
    "presence:ping": () => ({ ok: true }),
  };
  if (role === "host") return { ...common, ...hostHandlers };
  if (role === "player") return { ...common, ...playerHandlers };
  return common;
}

const hostHandlers: Partial<Record<ClientEvent, Handler>> = {
  "host:action": (game, socket, payload: { action: unknown }) => {
    const intent = hostIntentSchema.parse(payload.action);
    if (socket.data.hostRole === "SCOREKEEPER" && !SCOREKEEPER_INTENTS.has(intent.type)) {
      return { ok: false, error: "Scorekeepers can only adjust scores" };
    }
    if (intent.type === "bots/add") {
      const added = game.addBots(intent.count, `host:${socket.data.userId}`);
      return added > 0 ? { ok: true, data: { added } } : { ok: false, error: "No room for more players" };
    }
    if (intent.type === "game/start") {
      return game.requestStart(`host:${socket.data.userId}`, !!intent.now) ? { ok: true } : { ok: false, error: "The game has already started" };
    }
    if (intent.type === "game/cancelStart") {
      return game.dispatch({ type: "game/countdownCancel" }, `host:${socket.data.userId}`).ok ? { ok: true } : { ok: false, error: "No countdown is running" };
    }
    if (intent.type === "bots/remove") {
      return game.removeBots(`host:${socket.data.userId}`) > 0 ? { ok: true } : { ok: false, error: "No bots in this game" };
    }
    const action = game.resolveIntent(intent);
    if (!action) return { ok: false, error: "Nothing to do" };
    const res = game.dispatch(action, `host:${socket.data.userId}`);
    return res.ok ? { ok: true } : { ok: false, error: "That action isn't valid right now" };
  },
  "host:undo": (game, socket, payload: { seq: number; undone: boolean }) => {
    if (socket.data.hostRole === "SCOREKEEPER") return { ok: false, error: "Not allowed" };
    return game.setUndone(payload.seq, payload.undone) ? { ok: true } : { ok: false, error: "Can't change that step" };
  },
  "host:undoLast": (game, socket) => {
    if (socket.data.hostRole === "SCOREKEEPER") return { ok: false, error: "Not allowed" };
    return game.undoLast() ? { ok: true } : { ok: false, error: "Nothing to undo" };
  },
  "host:backToLobby": (game, socket) => {
    if (socket.data.hostRole === "SCOREKEEPER") return { ok: false, error: "Not allowed" };
    return game.backToLobby() ? { ok: true } : { ok: false, error: "The game is already under way. Use History to undo steps." };
  },
  "host:minigame": (game, _socket, payload: { kind?: import("@/shared/minigames").LobbyGameKind; mix?: boolean; restart?: boolean; stop?: boolean }) => {
    return game.miniControl(payload) ? { ok: true } : { ok: false, error: "Lobby games are off, or the game has started" };
  },
  "host:sound": (game, socket, payload: { id: string }) => {
    if (socket.data.hostRole === "SCOREKEEPER") return { ok: false, error: "Not allowed" };
    game.emitSound(payload.id);
    return { ok: true };
  },
};

const lastDrawingAt = new WeakMap<object, number>();
function drawingThrottle(socket: GameSocket): boolean {
  const now = gameNow();
  const last = lastDrawingAt.get(socket) ?? 0;
  if (now - last < 2000) return false;
  lastDrawingAt.set(socket, now);
  return true;
}

const TOO_MANY_CHANGES = "You've changed your name or drawing too many times in this game";

/** Exported for tests. */
export const playerHandlers: Partial<Record<ClientEvent, Handler>> = {
  "player:join": async (
    game,
    socket,
    payload: { name: string; signature: import("@/shared/strokes").Drawing | null; teamId?: string | null; avatar?: import("@/shared/strokes").Drawing | null; audience?: boolean },
  ) => {
    const name = cleanName(payload.name);
    if (!name) return { ok: false, error: "Enter a name" };
    if (containsProfanity(name)) return { ok: false, error: "Please choose a different name" };
    const signature = payload.signature ? compactDrawing(payload.signature) : null;
    const avatar = payload.avatar && game.state.settings.avatars ? compactDrawing(payload.avatar) : null;

    // Rejoin with an existing token keeps the same seat and score.
    const existing = socket.data.playerId;
    const seat = existing ? own(game.state.players, existing) : undefined;
    if (seat?.banned) return { ok: false, error: "You can't rejoin this game" };
    // A removed player's old token does not undo the removal: they come back as a new player
    // (below), if the lobby still lets people in. The host can restore the old seat.
    if (existing && seat && !seat.removed) {
      // Only a real change goes in the log, and it is rationed like any other redraw.
      if (name !== seat.name || signature || avatar) {
        if (!game.canChangeProfile(existing)) return { ok: false, error: TOO_MANY_CHANGES };
        if (!drawingThrottle(socket)) return { ok: false, error: "Slow down" };
        const res = game.dispatch({ type: "player/join", playerId: existing, name, signature, avatar }, `player:${existing}`);
        if (!res.ok) return { ok: false, error: "You can't rejoin this game" };
      }
      game.bindPlayer(socket, existing);
      return { ok: true, data: { playerId: existing } };
    }

    // A watch token only ever lets someone into the audience.
    const audience = !!payload.audience || !!socket.data.viaWatch;
    const playerId = `${audience ? "a" : "p"}_${nanoid(10)}`;
    const res = game.dispatch(
      audience ? { type: "player/join", playerId, name, signature: null, audience: true } : { type: "player/join", playerId, name, signature, avatar, teamId: payload.teamId ?? null },
      `player:${playerId}`,
    );
    if (!res.ok) {
      const s = game.state;
      const reason = audience
        ? s.settings.audience ? "The audience is full" : "This game isn't taking an audience"
        : s.lobbyLocked
        ? "The lobby is locked"
        : s.phase !== "lobby" && !s.settings.allowLateJoin
          ? "This game has already started"
          : "Couldn't join (game full or name not allowed)";
      return { ok: false, error: reason };
    }
    const token = randomToken();
    await prisma.gamePlayer.create({ data: { gameId: game.id, playerId, tokenHash: sha256(token) } });
    game.bindPlayer(socket, playerId);
    return { ok: true, data: { playerId, playerToken: token } };
  },
  "player:signature": (game, socket, payload: { signature: import("@/shared/strokes").Drawing | null; avatar?: import("@/shared/strokes").Drawing | null }) => {
    const pid = socket.data.playerId;
    if (!pid) return { ok: false, error: "Join first" };
    if (!game.canChangeProfile(pid)) return { ok: false, error: TOO_MANY_CHANGES };
    if (!drawingThrottle(socket)) return { ok: false, error: "Slow down" };
    const avatar = payload.avatar === undefined || !game.state.settings.avatars ? undefined : payload.avatar ? compactDrawing(payload.avatar) : null;
    const res = game.dispatch(
      { type: "player/signature", playerId: pid, signature: payload.signature ? compactDrawing(payload.signature) : null, ...(avatar !== undefined ? { avatar } : {}) },
      `player:${pid}`,
    );
    return res.ok ? { ok: true } : { ok: false, error: "Couldn't update" };
  },
  "player:start": (game, socket, payload: { cancel?: boolean }) => {
    const pid = socket.data.playerId;
    if (!pid || vipOf(game.state) !== pid) return { ok: false, error: "Only the first player in can start the game" };
    if (payload.cancel) return game.dispatch({ type: "game/countdownCancel" }, `player:${pid}`).ok ? { ok: true } : { ok: false, error: "No countdown is running" };
    return game.requestStart(`player:${pid}`, false) ? { ok: true } : { ok: false, error: "The game has already started" };
  },
  "player:cheer": (game, socket, payload: { contestantId: string | null }) => {
    const pid = socket.data.playerId;
    if (!pid) return { ok: false, error: "Join first" };
    const now = gameNow();
    if (now - (lastCheerAt.get(socket) ?? 0) < 800) return { ok: false, error: "Slow down" };
    lastCheerAt.set(socket, now);
    return game.dispatch({ type: "player/cheer", playerId: pid, contestantId: payload.contestantId }, `player:${pid}`).ok ? { ok: true } : { ok: false, error: "Couldn't change your pick" };
  },
  "player:seats": (game, socket) => ({ ok: true, data: { seats: game.state.settings.reclaimSeats && !socket.data.viaWatch ? game.emptySeats() : [] } }),
  "player:reclaim": async (game, socket, payload: { playerId: string }) => {
    if (!game.state.settings.reclaimSeats) return { ok: false, error: "The host turned this off. Ask them to let you back in." };
    if (socket.data.viaWatch) return { ok: false, error: "This link is for watching. Ask the host for the room code to play." };
    // A phone that already has a seat, or was removed or banned from one, cannot take another.
    const bound = socket.data.playerId;
    if (bound && own(game.state.players, bound)) return { ok: false, error: "You already have a seat in this game." };
    // Only a seat whose phone has been gone a while can be taken, so a live player (or one
    // whose connection only just blipped) can never be bumped.
    if (!game.emptySeats().some((seat) => seat.id === payload.playerId)) return { ok: false, error: "That seat is in use. Pick another or join as a new player." };
    const token = randomToken();
    const where = { gameId_playerId: { gameId: game.id, playerId: payload.playerId } };
    await prisma.gamePlayer.upsert({ where, update: { tokenHash: sha256(token) }, create: { gameId: game.id, playerId: payload.playerId, tokenHash: sha256(token) } });
    game.bindPlayer(socket, payload.playerId);
    return { ok: true, data: { playerId: payload.playerId, playerToken: token } };
  },
  "player:buzz": async (game, socket) => {
    const pid = socket.data.playerId;
    if (!pid) return { ok: false, error: "Join first" };
    const at = gameNow();
    const accepted = await game.buzz(pid, rtts.get(socket)?.value ?? 0);
    const c = game.state.clue;
    const first = c?.answering === pid;
    const locked = (c?.lockouts[pid] ?? 0) > at;
    return { ok: true, data: { accepted, first, locked } };
  },
  "player:finalWager": (game, socket, payload: { amount: number }) => {
    const pid = socket.data.playerId;
    if (!pid) return { ok: false, error: "Join first" };
    const res = game.dispatch({ type: "player/finalWager", playerId: pid, amount: payload.amount }, `player:${pid}`);
    return res.ok ? { ok: true } : { ok: false, error: "Wager must be between 0 and your score" };
  },
  "player:finalAnswer": (game, socket, payload: { drawing: import("@/shared/strokes").Drawing | null; typed?: string }) => {
    const pid = socket.data.playerId;
    if (!pid) return { ok: false, error: "Join first" };
    if (!drawingThrottle(socket)) return { ok: false, error: "Slow down" };
    if (!game.canSubmitAnswer(pid)) return { ok: false, error: "Too many answers" };
    const res = game.dispatch(
      { type: "player/finalAnswer", playerId: pid, drawing: payload.drawing ? compactDrawing(payload.drawing) : null, typed: payload.typed },
      `player:${pid}`,
    );
    return res.ok ? { ok: true } : { ok: false, error: "Answers are closed" };
  },
  "player:allPlayAnswer": (game, socket, payload: { drawing: import("@/shared/strokes").Drawing | null; typed?: string }) => {
    const pid = socket.data.playerId;
    if (!pid) return { ok: false, error: "Join first" };
    if (!drawingThrottle(socket)) return { ok: false, error: "Slow down" };
    if (!game.canSubmitAnswer(pid)) return { ok: false, error: "Too many answers" };
    const res = game.dispatch(
      { type: "player/allPlayAnswer", playerId: pid, drawing: payload.drawing ? compactDrawing(payload.drawing) : null, typed: payload.typed },
      `player:${pid}`,
    );
    return res.ok ? { ok: true } : { ok: false, error: "Answers are closed" };
  },
  "player:tap": (game, socket, payload: { n?: number; pick?: number }) => {
    const pid = socket.data.playerId;
    const p = pid ? game.state.players[pid] : undefined;
    if (!pid || !p || p.removed || p.audience) return { ok: false, error: "Join first" };
    const data = game.miniTap(pid, payload);
    return data ? { ok: true, data } : { ok: false, error: "No lobby game right now" };
  },
  "player:react": (game, socket, payload: { emoji: string }) => {
    const pid = socket.data.playerId;
    if (!pid || !game.state.players[pid] || game.state.players[pid].removed) return { ok: false, error: "Join first" };
    if (!game.state.settings.reactions) return { ok: false, error: "Reactions are off" };
    const now = gameNow();
    if (now - (lastReactAt.get(socket) ?? 0) < 600) return { ok: false, error: "Slow down" };
    lastReactAt.set(socket, now);
    game.emitReaction(pid, payload.emoji);
    return { ok: true };
  },
};

const lastReactAt = new WeakMap<object, number>();
const lastCheerAt = new WeakMap<object, number>();
