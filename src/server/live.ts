import type { Server, Socket } from "socket.io";
import type { HostRole, Prisma } from "@prisma/client";
import { nanoid } from "nanoid";
import { GameHistory } from "@/engine/history";
import { activePlayers, resolveDailyDoubles, type Cue } from "@/engine/reducer";
import { settingsSchema, type GameAction, type GameState, type LogEntry, type Settings, type Setup } from "@/engine/types";
import { buildView, type Audience, type GameView } from "@/engine/views";
import { boardContentSchema, findClue } from "@/shared/board";
import { BOT_NAMES, TEAM_COLORS, type HostIntent, type PresenceStatus, type PresenceView } from "@/shared/protocol";
import { computeAwards } from "@/engine/awards";
import { prisma } from "./db";
import { BUZZ_WINDOW_MS, orderBuzzes, type PendingBuzz } from "./buzzQueue";

export interface SocketData {
  role: "display" | "host" | "player";
  gameId: string;
  code: string;
  userId?: string;
  hostRole?: HostRole;
  playerId?: string | null;
}
export type GameSocket = Socket<Record<string, never>, Record<string, never>, Record<string, never>, SocketData>;

const RECONNECT_GRACE_MS = 20_000;
const BOT_GUESSES = ["What is... 42?", "Who is Beep Boop?", "What is electricity?", "I was told there would be no math", "What is a toaster?", "Who is my creator?"];
const NOBODY_RETURN_MS = 4_000;

/** Summary stored on the Game row for dashboards/history (full state is rebuilt from the log). */
export function summarize(s: GameState) {
  return {
    phase: s.phase,
    roundIndex: s.roundIndex,
    mode: s.settings.mode,
    scores: s.scores,
    players: s.playerOrder.map((id) => s.players[id]).filter((p) => !p.removed).map((p) => ({ id: p.id, name: p.name, teamId: p.teamId })),
    teams: s.teams,
    awards: s.phase === "finished" ? computeAwards(s) : [],
  };
}

export class LiveGame {
  sockets = new Map<string, GameSocket>();
  playerLastSeen = new Map<string, number>();
  private saveTimer: NodeJS.Timeout | null = null;
  private saving: Promise<void> = Promise.resolve();
  private timers = new Map<string, NodeJS.Timeout>();
  dirty = false;
  private saveFailures = 0;
  private pendingBuzzes: PendingBuzz<(ok: boolean) => void>[] = [];
  private buzzTimer: NodeJS.Timeout | null = null;

  constructor(
    public readonly id: string,
    public readonly code: string,
    public readonly ownerId: string,
    public readonly boardId: string | null,
    public title: string,
    public history: GameHistory,
    private manager: GameManager,
  ) {}

  get state() {
    return this.history.state;
  }

  // ------------------------------------------------------------- dispatching

  dispatch(action: GameAction, by: string, at = Date.now()): { ok: boolean; fx: Cue[] } {
    const res = this.history.dispatch(action, by, at);
    if (!res.ok) return { ok: false, fx: [] };
    this.afterChange(res.fx, action);
    return { ok: true, fx: res.fx };
  }

  /**
   * Buzz with latency compensation: while buzzers are open, the first buzz
   * waits a few milliseconds for competitors, then the earliest estimated
   * *press* wins. Outside that moment (early buzzes, someone already
   * answering) buzzes are applied immediately.
   */
  buzz(playerId: string, rttMs: number): Promise<boolean> {
    const now = Date.now();
    const c = this.state.clue;
    if (!this.state.settings.fairBuzz || !c || c.stage !== "open") {
      return Promise.resolve(this.dispatch({ type: "player/buzz", playerId }, `player:${playerId}`, now).ok);
    }
    return new Promise((resolve) => {
      this.pendingBuzzes.push({ playerId, arrivedAt: now, rttMs, order: this.pendingBuzzes.length, payload: resolve });
      this.buzzTimer ??= setTimeout(() => this.flushBuzzes(), BUZZ_WINDOW_MS);
    });
  }

  private flushBuzzes() {
    this.buzzTimer = null;
    const batch = this.pendingBuzzes;
    this.pendingBuzzes = [];
    // A press can't be dated before the action that opened the buzzers.
    const floor = this.history.log.at(-1)?.at ?? 0;
    for (const b of orderBuzzes(batch, floor)) {
      b.payload(this.dispatch({ type: "player/buzz", playerId: b.playerId }, `player:${b.playerId}`, b.at).ok);
    }
  }

  setUndone(seq: number, undone: boolean): boolean {
    if (!this.history.setUndone(seq, undone)) return false;
    this.afterChange([], null);
    return true;
  }

  undoLast(): boolean {
    if (!this.history.undoLast()) return false;
    this.afterChange([], null);
    return true;
  }

  private afterChange(fx: Cue[], action: GameAction | null) {
    this.scheduleSave();
    this.broadcast();
    for (const cue of fx) this.emitFx(cue);
    if (action) this.scheduleAutomation(action);
    this.syncTimers();
    if (action?.type === "player/kick" || action?.type === "player/ban") this.kickSockets(action.playerId, action.type);
  }

  /** Server-driven follow-ups: "nobody got it" returns to the board; Final closes when time's up. */
  private scheduleAutomation(action: GameAction) {
    if (action.type === "clue/nobody") {
      const clueId = this.state.clue?.id;
      this.later("nobody", NOBODY_RETURN_MS, () => {
        if (this.state.clue?.id === clueId && this.state.clue?.nobody) this.dispatch({ type: "clue/close" }, "system");
      });
    }
    if (action.type === "final/startTimer") this.scheduleFinalClose();
  }

  /**
   * Re-arm server-driven timers after the process restarted mid-game (the
   * timers lived in memory; the state they act on came back from the log).
   */
  restoreAutomation() {
    this.scheduleFinalClose();
    this.syncTimers();
    const c = this.state.clue;
    if (c?.nobody) {
      const clueId = c.id;
      this.later("nobody", NOBODY_RETURN_MS, () => {
        if (this.state.clue?.id === clueId && this.state.clue?.nobody) this.dispatch({ type: "clue/close" }, "system");
      });
    }
  }

  /**
   * Arm timers that follow from the current state (safe to call after every
   * change, undo, or restart; each callback re-checks the state when it fires).
   */
  private syncTimers() {
    const c = this.state.clue;
    if (c && c.stage === "reading" && c.autoUnlockAt && !c.allPlay && !c.dailyDouble && !this.state.paused) {
      const id = c.id;
      this.later("autoUnlock", Math.max(0, c.autoUnlockAt - Date.now()), () => {
        const cur = this.state.clue;
        if (cur?.id === id && cur.stage === "reading" && cur.autoUnlockAt && !this.state.paused) this.dispatch({ type: "buzzers/unlock" }, "system");
      });
    } else this.cancel("autoUnlock");
    if (c?.allPlay?.stage === "writing") {
      const id = c.id;
      this.later("allPlay", Math.max(0, c.allPlay.endsAt - Date.now() + 1600), () => {
        if (this.state.clue?.id === id && this.state.clue.allPlay?.stage === "writing") this.dispatch({ type: "allPlay/close" }, "system");
      });
    } else this.cancel("allPlay");
    this.driveBots();
  }

  private cancel(key: string) {
    const t = this.timers.get(key);
    if (t) clearTimeout(t);
    this.timers.delete(key);
  }

  // ------------------------------------------------------------------- bots

  /** Things each bot has already decided to do, so a state change never double-books them. */
  private botPlans = new Set<string>();

  private bots() {
    return activePlayers(this.state).filter((p) => p.bot);
  }

  addBots(count: number, by: string): number {
    let added = 0;
    const taken = new Set(activePlayers(this.state).map((p) => p.name));
    for (let i = 0; i < count; i++) {
      const name = BOT_NAMES.find((n) => !taken.has(n)) ?? `Bot ${nanoid(3)}`;
      taken.add(name);
      const playerId = `bot_${nanoid(8)}`;
      if (this.dispatch({ type: "player/join", playerId, name, signature: null, bot: true }, by).ok) added++;
    }
    return added;
  }

  removeBots(by: string): number {
    let n = 0;
    for (const b of this.bots()) if (this.dispatch({ type: "player/kick", playerId: b.id }, by).ok) n++;
    return n;
  }

  /** Practice bots: buzz with human-ish delays, write all-play and Final answers, place wagers. */
  private driveBots() {
    const s = this.state;
    const bots = this.bots();
    if (!bots.length || s.paused) return;
    const plan = (key: string, minMs: number, maxMs: number, fn: () => void) => {
      if (this.botPlans.has(key)) return;
      this.botPlans.add(key);
      if (this.botPlans.size > 5000) this.botPlans.clear();
      this.later(`bot:${key}`, minMs + Math.random() * (maxMs - minMs), fn);
    };
    const c = s.clue;
    if (c && !c.dailyDouble && !c.allPlay && c.stage === "open") {
      for (const b of bots) {
        // Each bot decides once per opening of the buzzers; about 2 in 3 go for it.
        plan(`buzz:${c.id}:${c.attempted.length}:${b.id}`, 450, 3200, () => {
          const cur = this.state.clue;
          if (cur?.id === c.id && cur.stage === "open" && Math.random() < 0.67) void this.buzz(b.id, 0);
        });
      }
    }
    if (c?.allPlay?.stage === "writing") {
      for (const b of bots) {
        plan(`allplay:${c.id}:${b.id}`, 2000, Math.max(2500, Math.min(9000, c.allPlay.endsAt - Date.now() - 500)), () => {
          this.dispatch({ type: "player/allPlayAnswer", playerId: b.id, drawing: null, typed: BOT_GUESSES[Math.floor(Math.random() * BOT_GUESSES.length)] }, `player:${b.id}`);
        });
      }
    }
    const f = s.final;
    if (f && ["category", "clue", "writing"].includes(f.stage)) {
      for (const b of bots) {
        const cid = s.settings.mode === "team" ? b.teamId : b.id;
        if (!cid || !f.eligible.includes(cid)) continue;
        if (f.wagers[cid] === undefined && s.settings.mode !== "team") {
          plan(`wager:${b.id}`, 1500, 5000, () => {
            const max = Math.max(0, this.state.scores[cid] ?? 0);
            this.dispatch({ type: "player/finalWager", playerId: b.id, amount: Math.round((Math.random() * max) / 50) * 50 }, `player:${b.id}`);
          });
        }
        if (f.stage === "writing" && s.settings.mode !== "team") {
          plan(`final:${b.id}`, 3000, 9000, () => {
            this.dispatch({ type: "player/finalAnswer", playerId: b.id, drawing: null, typed: BOT_GUESSES[Math.floor(Math.random() * BOT_GUESSES.length)] }, `player:${b.id}`);
          });
        }
      }
    }
  }

  scheduleFinalClose() {
    const f = this.state.final;
    if (!f || f.stage !== "writing" || f.endsAt === null) return;
    this.later("final", Math.max(0, f.endsAt - Date.now() + 1600), () => {
      if (this.state.final?.stage === "writing") this.dispatch({ type: "final/close" }, "system");
    });
  }

  private later(key: string, ms: number, fn: () => void) {
    const prev = this.timers.get(key);
    if (prev) clearTimeout(prev);
    this.timers.set(
      key,
      setTimeout(() => {
        this.timers.delete(key);
        fn();
      }, ms),
    );
  }

  /** Turn a validated host intent into a fully-resolved engine action. */
  resolveIntent(intent: HostIntent): GameAction | null {
    const s = this.state;
    switch (intent.type) {
      case "team/create":
        return {
          type: "team/create",
          teamId: `t_${nanoid(8)}`,
          name: intent.name,
          color: intent.color ?? TEAM_COLORS[s.teams.length % TEAM_COLORS.length],
        };
      case "team/autoBalance": {
        if (!s.teams.length) return null;
        const players = activePlayers(s).map((p) => p.id);
        for (let i = players.length - 1; i > 0; i--) {
          const j = Math.floor(Math.random() * (i + 1));
          [players[i], players[j]] = [players[j], players[i]];
        }
        const assignments: Record<string, string> = {};
        players.forEach((pid, i) => (assignments[pid] = s.teams[i % s.teams.length].id));
        return { type: "team/autoBalance", assignments };
      }
      case "game/start":
        return { type: "game/start", dailyDoubles: resolveDailyDoubles(s.board, s.settings) };
      case "clue/edit": {
        const { saveToBoard, ...rest } = intent;
        if (saveToBoard) void this.saveClueEditToBoard(rest.clueId, rest.text, rest.answer);
        return rest;
      }
      case "final/edit": {
        const { saveToBoard, ...rest } = intent;
        if (saveToBoard) void this.saveFinalEditToBoard(rest);
        return rest;
      }
      case "settings/update":
        return { type: "settings/update", settings: intent.settings as Partial<Settings> };
      default:
        return intent as GameAction;
    }
  }

  private async saveClueEditToBoard(clueId: string, text?: string, answer?: string) {
    if (!this.boardId) return;
    const board = await prisma.board.findUnique({ where: { id: this.boardId } });
    const parsed = board && boardContentSchema.safeParse(board.content);
    if (!parsed || !parsed.success) return;
    const found = findClue(parsed.data, clueId);
    if (!found) return;
    if (text !== undefined) found.clue.text = text;
    if (answer !== undefined) found.clue.answer = answer;
    await prisma.board.update({ where: { id: this.boardId }, data: { content: parsed.data as Prisma.InputJsonValue } });
  }

  private async saveFinalEditToBoard(edit: { category?: string; text?: string; answer?: string }) {
    if (!this.boardId) return;
    const board = await prisma.board.findUnique({ where: { id: this.boardId } });
    const parsed = board && boardContentSchema.safeParse(board.content);
    if (!parsed || !parsed.success || !parsed.data.final) return;
    Object.assign(parsed.data.final, Object.fromEntries(Object.entries(edit).filter(([, v]) => v !== undefined)));
    await prisma.board.update({ where: { id: this.boardId }, data: { content: parsed.data as Prisma.InputJsonValue } });
  }

  // ------------------------------------------------------------ broadcasting

  viewFor(audience: Audience, playerId?: string): GameView {
    return buildView(this.state, {
      audience,
      code: this.code,
      title: this.title,
      playerId,
      log: audience === "host" ? this.history.log : undefined,
    });
  }

  broadcast() {
    const cache = new Map<string, GameView>();
    for (const socket of this.sockets.values()) {
      const d = socket.data;
      const key = d.role === "player" ? `p:${d.playerId ?? ""}` : d.role;
      let view = cache.get(key);
      if (!view) {
        view = this.viewFor(d.role, d.playerId ?? undefined);
        cache.set(key, view);
      }
      (socket as Socket).emit("state", view);
    }
  }

  sendState(socket: GameSocket) {
    (socket as Socket).emit("state", this.viewFor(socket.data.role, socket.data.playerId ?? undefined));
  }

  emitFx(cue: Cue) {
    for (const socket of this.sockets.values()) {
      const d = socket.data;
      const playerCue = "playerId" in cue && d.role === "player" && d.playerId === cue.playerId;
      if (d.role === "display" || (d.role === "host" && cue.cue !== "earlyBuzz") || playerCue) (socket as Socket).emit("fx", cue);
    }
  }

  /** Ephemeral emoji reaction: shown on displays, never stored. */
  emitReaction(playerId: string, emoji: string) {
    for (const socket of this.sockets.values()) if (socket.data.role === "display") (socket as Socket).emit("fx", { cue: "react", id: emoji, playerId });
  }

  emitSound(id: string) {
    for (const socket of this.sockets.values()) if (socket.data.role === "display") (socket as Socket).emit("fx", { cue: "sfx", id });
  }

  private kickSockets(playerId: string, reason: string) {
    for (const socket of this.sockets.values()) {
      if (socket.data.role === "player" && socket.data.playerId === playerId) {
        (socket as Socket).emit("kicked", { reason: reason === "player/ban" ? "banned" : "kicked" });
        socket.disconnect(true);
      }
    }
  }

  redirectAll(newCode: string) {
    for (const socket of this.sockets.values()) (socket as Socket).emit("redirect", { code: newCode });
  }

  // ---------------------------------------------------------------- presence

  attach(socket: GameSocket) {
    this.sockets.set(socket.id, socket);
    if (socket.data.playerId) this.playerLastSeen.delete(socket.data.playerId);
    this.sendState(socket);
    this.broadcastPresence();
  }

  detach(socket: GameSocket) {
    this.sockets.delete(socket.id);
    const pid = socket.data.playerId;
    if (pid && ![...this.sockets.values()].some((s) => s.data.playerId === pid)) {
      this.playerLastSeen.set(pid, Date.now());
      this.later(`presence:${pid}`, RECONNECT_GRACE_MS + 100, () => this.broadcastPresence());
    }
    this.broadcastPresence();
    if (this.sockets.size === 0) this.manager.scheduleEvict(this);
  }

  /** A player socket just joined/rejoined: bind it to its player id. */
  bindPlayer(socket: GameSocket, playerId: string) {
    socket.data.playerId = playerId;
    this.playerLastSeen.delete(playerId);
    this.sendState(socket);
    this.broadcastPresence();
  }

  presence(): PresenceView {
    const now = Date.now();
    const sockets = [...this.sockets.values()];
    const displays = sockets.filter((s) => s.data.role === "display").length;
    const hostCounts = new Map<string, number>();
    for (const s of sockets) if (s.data.role === "host") hostCounts.set(s.data.hostRole ?? "HOST", (hostCounts.get(s.data.hostRole ?? "HOST") ?? 0) + 1);
    const online = new Set(sockets.filter((s) => s.data.role === "player" && s.data.playerId).map((s) => s.data.playerId!));
    const players: Record<string, PresenceStatus> = {};
    for (const id of this.state.playerOrder) {
      if (online.has(id) || this.state.players[id]?.bot) players[id] = "online";
      else {
        const last = this.playerLastSeen.get(id);
        players[id] = last && now - last < RECONNECT_GRACE_MS ? "reconnecting" : "offline";
      }
    }
    return {
      display: displays > 0 ? "online" : "offline",
      displays,
      hosts: [...hostCounts].map(([role, count]) => ({ role, count })),
      players,
    };
  }

  broadcastPresence() {
    const p = this.presence();
    for (const s of this.sockets.values()) if (s.data.role !== "player") (s as Socket).emit("presence", p);
  }

  // ------------------------------------------------------------- persistence

  scheduleSave(delayMs = 300) {
    this.dirty = true;
    if (this.saveTimer) return;
    this.saveTimer = setTimeout(() => {
      this.saveTimer = null;
      void this.flush();
    }, delayMs);
  }

  /** True while the latest state has not reached the database. */
  get unsaved() {
    return this.dirty || this.saveFailures > 0;
  }

  flush(): Promise<void> {
    if (this.saveTimer) {
      clearTimeout(this.saveTimer);
      this.saveTimer = null;
    }
    if (!this.dirty) return this.saving;
    this.dirty = false;
    const s = this.state;
    const status = s.phase === "lobby" ? "LOBBY" : s.phase === "finished" ? "FINISHED" : "ACTIVE";
    const data = {
      actions: this.history.log as unknown as Prisma.InputJsonValue,
      state: summarize(s) as unknown as Prisma.InputJsonValue,
      status,
      finishedAt: s.phase === "finished" ? new Date(s.finishedAt ?? Date.now()) : null,
    } as const;
    this.saving = this.saving
      .then(() => prisma.game.update({ where: { id: this.id }, data }))
      .then(() => {
        if (this.saveFailures) console.log(`[game ${this.code}] save recovered after ${this.saveFailures} failed attempt(s)`);
        this.saveFailures = 0;
      })
      .catch((err) => {
        // Database hiccup: keep the game running from memory and keep retrying
        // (1s, 2s, 4s ... capped at 15s) until the write lands.
        this.saveFailures++;
        console.error(`[game ${this.code}] save failed (attempt ${this.saveFailures})`, err instanceof Error ? err.message : err);
        this.dirty = true;
        if (!this.disposed) this.scheduleSave(Math.min(15_000, 1000 * 2 ** Math.min(this.saveFailures - 1, 4)));
      });
    return this.saving;
  }

  private disposed = false;

  dispose() {
    this.disposed = true;
    if (this.saveTimer) clearTimeout(this.saveTimer);
    if (this.buzzTimer) clearTimeout(this.buzzTimer);
    for (const t of this.timers.values()) clearTimeout(t);
    this.timers.clear();
  }
}

export class GameManager {
  private games = new Map<string, LiveGame>(); // by game id
  private loading = new Map<string, Promise<LiveGame | null>>();
  private evictTimers = new Map<string, NodeJS.Timeout>();
  io: Server | null = null;

  /** The newest non-finished game with this code, else the newest finished one. */
  async findByCode(code: string) {
    const c = code.toUpperCase();
    return (
      (await prisma.game.findFirst({ where: { code: c, status: { not: "FINISHED" } }, orderBy: { createdAt: "desc" } })) ??
      (await prisma.game.findFirst({ where: { code: c }, orderBy: { createdAt: "desc" } }))
    );
  }

  cached(gameId: string): LiveGame | undefined {
    return this.games.get(gameId);
  }

  async load(gameId: string): Promise<LiveGame | null> {
    const hit = this.games.get(gameId);
    if (hit) return hit;
    const pending = this.loading.get(gameId);
    if (pending) return pending;
    const p = (async () => {
      const row = await prisma.game.findUnique({ where: { id: gameId } });
      if (!row) return null;
      const setup = row.setup as unknown as Setup;
      setup.settings = settingsSchema.parse(setup.settings ?? {});
      const log = (row.actions as unknown as LogEntry[]) ?? [];
      const live = new LiveGame(row.id, row.code, row.ownerId, row.boardId, row.boardTitle, new GameHistory(setup, log), this);
      this.games.set(row.id, live);
      live.restoreAutomation();
      return live;
    })().finally(() => this.loading.delete(gameId));
    this.loading.set(gameId, p);
    return p;
  }

  scheduleEvict(game: LiveGame) {
    const prev = this.evictTimers.get(game.id);
    if (prev) clearTimeout(prev);
    this.evictTimers.set(
      game.id,
      setTimeout(
        async () => {
          this.evictTimers.delete(game.id);
          if (game.sockets.size > 0) return;
          await game.flush();
          // Never drop the only copy of a game the database hasn't accepted yet.
          if (game.unsaved) return this.scheduleEvict(game);
          game.dispose();
          this.games.delete(game.id);
        },
        10 * 60_000,
      ),
    );
  }

  cancelEvict(gameId: string) {
    const t = this.evictTimers.get(gameId);
    if (t) clearTimeout(t);
    this.evictTimers.delete(gameId);
  }

  async flushAll() {
    await Promise.all([...this.games.values()].map((g) => g.flush()));
  }

  stats() {
    const games = [...this.games.values()];
    return {
      games: games.length,
      sockets: games.reduce((n, g) => n + g.sockets.size, 0),
      unsaved: games.filter((g) => g.unsaved).length,
    };
  }
}

const g = globalThis as unknown as { __gameManager?: GameManager };
/** Shared between server.ts and Next route handlers (separate module graphs, same process). */
export function getManager(): GameManager {
  return (g.__gameManager ??= new GameManager());
}
