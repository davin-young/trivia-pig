import type { Server, Socket } from "socket.io";
import { nanoid } from "nanoid";
import { clientEvents, hostIntentSchema, SCOREKEEPER_INTENTS, type Ack, type ClientEvent } from "@/shared/protocol";
import { containsProfanity, cleanName } from "./profanity";
import { TokenBucket } from "./rateLimit";
import { RttTracker } from "./buzzQueue";
import { authorizeSocket, SocketAuthError, type SocketAuthDeps } from "./socketAuth";
import { getManager, type GameSocket, type LiveGame } from "./live";
import { prisma } from "./db";
import { randomToken, sha256 } from "./crypto";
import { userFromSessionToken } from "./auth";
import { hostRoleFor } from "./access";
import { pairing } from "./pairingStore";
import { compactDrawing } from "@/shared/strokes";

export const prismaSocketAuthDeps: SocketAuthDeps = {
  async findGame(code) {
    const g = await getManager().findByCode(code);
    return g ? { id: g.id, code: g.code, ownerId: g.ownerId } : null;
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
};

type Handler = (game: LiveGame, socket: GameSocket, payload: never) => Promise<Ack> | Ack;

/** Per-event extra cost on the socket's token bucket (drawings are expensive). */
const COST: Partial<Record<ClientEvent, number>> = {
  "player:join": 5,
  "player:signature": 8,
  "player:finalAnswer": 8,
};

export function attachSocketServer(io: Server, deps: SocketAuthDeps = prismaSocketAuthDeps) {
  const manager = getManager();
  manager.io = io;

  io.use(async (socket, next) => {
    try {
      const id = await authorizeSocket(socket.handshake.auth, socket.handshake.headers.cookie, deps);
      socket.data = {
        role: id.role,
        gameId: id.game.id,
        code: id.game.code,
        userId: id.role === "host" ? id.userId : undefined,
        hostRole: id.role === "host" ? id.hostRole : undefined,
        playerId: id.role === "player" ? id.playerId : undefined,
      };
      next();
    } catch (err) {
      next(new Error(err instanceof SocketAuthError ? err.message : "Connection failed"));
      if (!(err instanceof SocketAuthError)) console.error("[socket auth]", err);
    }
  });

  io.on("connection", (raw: Socket) => {
    const socket = raw as unknown as GameSocket;
    // Register listeners synchronously so messages sent immediately after
    // connecting aren't dropped while the game loads from the database.
    const gameP = manager.load(socket.data.gameId).then((game) => {
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
        const sent = Date.now();
        raw.timeout(3000).emit("rtt", (err: Error | null) => {
          if (!err) tracker.add(Date.now() - sent);
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
        if (!parsed.success) return reply({ ok: false, error: "Invalid message" });
        const game = await gameP;
        if (!game) return reply({ ok: false, error: "Game not found" });
        try {
          reply(await handler(game, socket, parsed.data as never));
        } catch (err) {
          console.error(`[socket ${event}]`, err);
          reply({ ok: false, error: "Server error" });
        }
      });
    }

    raw.on("disconnect", () => {
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
  "host:sound": (game, socket, payload: { id: string }) => {
    if (socket.data.hostRole === "SCOREKEEPER") return { ok: false, error: "Not allowed" };
    game.emitSound(payload.id);
    return { ok: true };
  },
};

const lastDrawingAt = new WeakMap<object, number>();
function drawingThrottle(socket: GameSocket): boolean {
  const now = Date.now();
  const last = lastDrawingAt.get(socket) ?? 0;
  if (now - last < 2000) return false;
  lastDrawingAt.set(socket, now);
  return true;
}

const playerHandlers: Partial<Record<ClientEvent, Handler>> = {
  "player:join": async (game, socket, payload: { name: string; signature: import("@/shared/strokes").Drawing | null; teamId?: string | null }) => {
    const name = cleanName(payload.name);
    if (!name) return { ok: false, error: "Enter a name" };
    if (containsProfanity(name)) return { ok: false, error: "Please choose a different name" };
    const signature = payload.signature ? compactDrawing(payload.signature) : null;

    // Rejoin with an existing token keeps the same seat and score.
    const existing = socket.data.playerId;
    if (existing && game.state.players[existing]) {
      const res = game.dispatch({ type: "player/join", playerId: existing, name, signature }, `player:${existing}`);
      if (!res.ok) return { ok: false, error: "You can't rejoin this game" };
      game.bindPlayer(socket, existing);
      return { ok: true, data: { playerId: existing } };
    }

    const playerId = `p_${nanoid(10)}`;
    const res = game.dispatch({ type: "player/join", playerId, name, signature, teamId: payload.teamId ?? null }, `player:${playerId}`);
    if (!res.ok) {
      const s = game.state;
      const reason = s.lobbyLocked
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
  "player:signature": (game, socket, payload: { signature: import("@/shared/strokes").Drawing | null }) => {
    const pid = socket.data.playerId;
    if (!pid) return { ok: false, error: "Join first" };
    if (!drawingThrottle(socket)) return { ok: false, error: "Slow down" };
    const res = game.dispatch({ type: "player/signature", playerId: pid, signature: payload.signature ? compactDrawing(payload.signature) : null }, `player:${pid}`);
    return res.ok ? { ok: true } : { ok: false, error: "Couldn't update" };
  },
  "player:buzz": async (game, socket) => {
    const pid = socket.data.playerId;
    if (!pid) return { ok: false, error: "Join first" };
    const at = Date.now();
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
    const res = game.dispatch(
      { type: "player/finalAnswer", playerId: pid, drawing: payload.drawing ? compactDrawing(payload.drawing) : null, typed: payload.typed },
      `player:${pid}`,
    );
    return res.ok ? { ok: true } : { ok: false, error: "Answers are closed" };
  },
};
