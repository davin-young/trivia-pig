import { findClue, isPlayable } from "@/shared/board";
import type { BoardContent } from "@/shared/board";
import {
  DEFAULT_SETTINGS,
  type ActiveClue,
  type GameState,
  type LogEntry,
  type ScoreEvent,
  type Settings,
  type Setup,
} from "./types";

/** Sound / animation cues produced while applying an action. */
export type Cue =
  | { cue: "join"; playerId: string }
  | { cue: "boardFill" }
  | { cue: "clueOpen" }
  | { cue: "dailyDouble" }
  | { cue: "buzz"; playerId: string }
  | { cue: "earlyBuzz"; playerId: string }
  | { cue: "correct" }
  | { cue: "incorrect" }
  | { cue: "reveal" }
  | { cue: "roundTransition" }
  | { cue: "finalStart" }
  | { cue: "think" }
  | { cue: "thinkStop" }
  | { cue: "finalReveal" }
  | { cue: "finalWager" }
  | { cue: "gameOver" }
  | { cue: "announce" };

export function initialState(setup: Setup): GameState {
  return {
    phase: "lobby",
    settings: { ...DEFAULT_SETTINGS, ...setup.settings },
    board: structuredClone(setup.board),
    roundIndex: 0,
    dailyDoubles: {},
    used: {},
    players: {},
    playerOrder: [],
    teams: [],
    scores: {},
    controlId: null,
    clue: null,
    final: null,
    timer: null,
    paused: false,
    screen: "none",
    announcement: null,
    showJoinQr: true,
    lobbyLocked: false,
    bannedNames: [],
    scoreEvents: [],
    startedAt: null,
    finishedAt: null,
    version: 0,
  };
}

// ---------------------------------------------------------------------------
// helpers
// ---------------------------------------------------------------------------

export function normName(name: string): string {
  return name.trim().toLowerCase().replace(/\s+/g, " ");
}

export function activePlayers(s: GameState) {
  return s.playerOrder.map((id) => s.players[id]).filter((p) => p && !p.removed);
}

/** The id that scores attach to: the player in solo mode, their team in team mode. */
export function contestantOf(s: GameState, playerId: string): string | null {
  const p = s.players[playerId];
  if (!p || p.removed) return null;
  if (s.settings.mode === "team") return p.teamId && s.teams.some((t) => t.id === p.teamId) ? p.teamId : null;
  return p.id;
}

export function contestantIds(s: GameState): string[] {
  if (s.settings.mode === "team") return s.teams.map((t) => t.id);
  return activePlayers(s).map((p) => p.id);
}

export function isContestant(s: GameState, id: string): boolean {
  return contestantIds(s).includes(id);
}

export function scoreOf(s: GameState, contestantId: string): number {
  return s.scores[contestantId] ?? 0;
}

export function roundMaxValue(board: BoardContent, roundIndex: number): number {
  const r = board.rounds[roundIndex];
  return r ? Math.max(0, ...r.values) : 0;
}

/** Max Daily Double wager: your score, or the round's top value if that's higher. */
export function maxDailyDoubleWager(s: GameState, contestantId: string): number {
  return Math.max(scoreOf(s, contestantId), roundMaxValue(s.board, s.roundIndex));
}

export function maxFinalWager(s: GameState, contestantId: string): number {
  return Math.max(0, scoreOf(s, contestantId));
}

function addScore(s: GameState, entry: LogEntry, contestantId: string, delta: number, kind: ScoreEvent["kind"], clueId: string | null) {
  s.scores[contestantId] = scoreOf(s, contestantId) + delta;
  s.scoreEvents.push({
    seq: entry.seq,
    contestantId,
    delta,
    clueId,
    round: clueId ? s.roundIndex : null,
    kind,
    at: entry.at,
  });
}

function clueInCurrentRound(s: GameState, clueId: string) {
  const found = findClue(s.board, clueId);
  if (!found || found.round !== s.roundIndex) return null;
  return found;
}

function lowestScorer(s: GameState): string | null {
  const ids = contestantIds(s);
  if (!ids.length) return null;
  return ids.reduce((lo, id) => (scoreOf(s, id) < scoreOf(s, lo) ? id : lo), ids[0]);
}

function closeClue(s: GameState) {
  if (s.clue) s.used[s.clue.id] = true;
  s.clue = null;
  s.timer = null;
  s.phase = "board";
}

function mergeSettings(cur: Settings, patch: Partial<Settings>): Settings {
  return { ...cur, ...patch, sound: { ...cur.sound, ...(patch.sound ?? {}) } };
}

// ---------------------------------------------------------------------------
// reducer: mutates `s` in place, returns false if the action was rejected/no-op
// ---------------------------------------------------------------------------

export function applyAction(s: GameState, entry: LogEntry, fx: Cue[] = []): boolean {
  const ok = reduce(s, entry, fx);
  if (ok) s.version++;
  return ok;
}

function reduce(s: GameState, entry: LogEntry, fx: Cue[]): boolean {
  const a = entry.action;
  const at = entry.at;

  switch (a.type) {
    // -------------------------------------------------------------- players
    case "player/join": {
      const existing = s.players[a.playerId];
      if (existing) {
        if (existing.banned) return false;
        existing.removed = false;
        if (a.name) existing.name = a.name;
        if (a.signature) existing.signature = a.signature;
        return true;
      }
      if (s.bannedNames.includes(normName(a.name))) return false;
      if (s.lobbyLocked) return false;
      if (s.phase !== "lobby" && !s.settings.allowLateJoin) return false;
      if (activePlayers(s).length >= s.settings.maxPlayers) return false;
      const teamId = a.teamId && s.teams.some((t) => t.id === a.teamId) ? a.teamId : null;
      s.players[a.playerId] = {
        id: a.playerId,
        name: a.name,
        signature: a.signature,
        signatureHidden: false,
        teamId,
        joinedAt: at,
        index: s.playerOrder.length,
        removed: false,
        banned: false,
      };
      s.playerOrder.push(a.playerId);
      if (s.scores[a.playerId] === undefined) s.scores[a.playerId] = 0;
      fx.push({ cue: "join", playerId: a.playerId });
      return true;
    }
    case "player/signature": {
      const p = s.players[a.playerId];
      if (!p || p.removed) return false;
      p.signature = a.signature;
      p.signatureHidden = false;
      return true;
    }
    case "player/buzz": {
      const c = s.clue;
      if (s.phase !== "clue" || !c || c.dailyDouble || s.paused) return false;
      const contestant = contestantOf(s, a.playerId);
      if (!contestant) return false;
      if (c.stage === "reading") {
        if (s.settings.earlyBuzzLockoutMs > 0) {
          c.lockouts[a.playerId] = at + s.settings.earlyBuzzLockoutMs;
          fx.push({ cue: "earlyBuzz", playerId: a.playerId });
          return true;
        }
        return false;
      }
      if (c.stage !== "open" && c.stage !== "answering") return false;
      if ((c.lockouts[a.playerId] ?? 0) > at) return false;
      if (!s.settings.allowRebuzz && c.attempted.includes(contestant)) return false;
      if (c.buzzes.some((b) => b.playerId === a.playerId)) return false;
      c.buzzes.push({ playerId: a.playerId, at });
      if (c.stage === "open") {
        c.stage = "answering";
        c.answering = a.playerId;
        s.timer =
          s.settings.answerTimerSec > 0
            ? { startedAt: at, endsAt: at + s.settings.answerTimerSec * 1000, label: "answer" }
            : null;
        fx.push({ cue: "buzz", playerId: a.playerId });
      }
      return true;
    }
    case "player/finalWager":
    case "final/hostWager": {
      const f = s.final;
      if (s.phase !== "final" || !f) return false;
      if (!["category", "clue", "writing"].includes(f.stage)) return false;
      const contestant = a.type === "player/finalWager" ? contestantOf(s, a.playerId) : a.contestantId;
      if (!contestant || !f.eligible.includes(contestant)) return false;
      if (!Number.isInteger(a.amount) || a.amount < 0 || a.amount > maxFinalWager(s, contestant)) return false;
      f.wagers[contestant] = a.amount;
      return true;
    }
    case "player/finalAnswer": {
      const f = s.final;
      if (s.phase !== "final" || !f) return false;
      if (f.stage !== "writing" && f.stage !== "clue") return false;
      // small grace window for network latency
      if (f.stage === "writing" && f.endsAt !== null && at > f.endsAt + 1500) return false;
      const contestant = contestantOf(s, a.playerId);
      if (!contestant || !f.eligible.includes(contestant)) return false;
      if (a.drawing) f.answers[contestant] = a.drawing;
      if (a.typed !== undefined) f.typed[contestant] = a.typed;
      return true;
    }

    // ------------------------------------------------------------ lobby/mgmt
    case "settings/update": {
      const patch = { ...a.settings };
      if (s.phase !== "lobby") delete patch.mode;
      s.settings = mergeSettings(s.settings, patch);
      return true;
    }
    case "lobby/lock":
      s.lobbyLocked = a.locked;
      return true;
    case "player/rename": {
      const p = s.players[a.playerId];
      if (!p || !a.name.trim()) return false;
      p.name = a.name.trim();
      return true;
    }
    case "player/resetSignature": {
      const p = s.players[a.playerId];
      if (!p) return false;
      p.signature = null;
      return true;
    }
    case "player/hideSignature": {
      const p = s.players[a.playerId];
      if (!p) return false;
      p.signatureHidden = a.hidden;
      return true;
    }
    case "player/kick":
    case "player/ban": {
      const p = s.players[a.playerId];
      if (!p) return false;
      p.removed = true;
      if (a.type === "player/ban") {
        p.banned = true;
        const n = normName(p.name);
        if (!s.bannedNames.includes(n)) s.bannedNames.push(n);
      }
      if (s.clue?.answering === a.playerId) {
        s.clue.answering = null;
        s.clue.stage = "open";
        s.timer = null;
      }
      if (s.controlId === a.playerId) s.controlId = null;
      return true;
    }
    case "player/restore": {
      const p = s.players[a.playerId];
      if (!p) return false;
      p.removed = false;
      p.banned = false;
      s.bannedNames = s.bannedNames.filter((n) => n !== normName(p.name));
      return true;
    }
    case "team/create": {
      if (s.teams.some((t) => t.id === a.teamId)) return false;
      if (s.teams.length >= s.settings.maxTeams) return false;
      s.teams.push({ id: a.teamId, name: a.name, color: a.color });
      if (s.scores[a.teamId] === undefined) s.scores[a.teamId] = 0;
      return true;
    }
    case "team/rename": {
      const t = s.teams.find((t) => t.id === a.teamId);
      if (!t || !a.name.trim()) return false;
      t.name = a.name.trim();
      return true;
    }
    case "team/delete": {
      if (!s.teams.some((t) => t.id === a.teamId)) return false;
      s.teams = s.teams.filter((t) => t.id !== a.teamId);
      for (const p of Object.values(s.players)) if (p.teamId === a.teamId) p.teamId = null;
      if (s.controlId === a.teamId) s.controlId = null;
      return true;
    }
    case "team/assign": {
      const p = s.players[a.playerId];
      if (!p) return false;
      if (a.teamId !== null && !s.teams.some((t) => t.id === a.teamId)) return false;
      p.teamId = a.teamId;
      return true;
    }
    case "team/autoBalance": {
      for (const [pid, tid] of Object.entries(a.assignments)) {
        const p = s.players[pid];
        if (p && s.teams.some((t) => t.id === tid)) p.teamId = tid;
      }
      return true;
    }
    case "game/start": {
      if (s.phase !== "lobby") return false;
      s.dailyDoubles = a.dailyDoubles;
      s.startedAt = at;
      if (s.board.rounds.length === 0) {
        return startFinal(s, fx);
      }
      s.phase = "board";
      s.roundIndex = 0;
      s.controlId = contestantIds(s)[0] ?? null;
      s.showJoinQr = false;
      fx.push({ cue: "boardFill" });
      return true;
    }

    // ------------------------------------------------------------ clue flow
    case "clue/open": {
      if (s.phase !== "board") return false;
      const found = clueInCurrentRound(s, a.clueId);
      if (!found || !isPlayable(found.clue)) return false;
      const isDD = (s.dailyDoubles[s.roundIndex] ?? []).includes(a.clueId);
      const clue: ActiveClue = {
        id: a.clueId,
        round: s.roundIndex,
        value: found.value,
        stage: "reading",
        buzzes: [],
        answering: null,
        attempted: [],
        lockouts: {},
        dailyDouble: isDD ? { contestantId: s.controlId ?? "", wager: null } : null,
        nobody: false,
      };
      s.clue = clue;
      s.used[a.clueId] = true;
      s.phase = "clue";
      s.timer = null;
      fx.push(isDD ? { cue: "dailyDouble" } : { cue: "clueOpen" });
      return true;
    }
    case "buzzers/unlock": {
      const c = s.clue;
      if (!c || c.dailyDouble || c.stage !== "reading") return false;
      c.stage = "open";
      c.buzzes = [];
      return true;
    }
    case "buzzers/lock": {
      const c = s.clue;
      if (!c || c.stage !== "open") return false;
      c.stage = "reading";
      return true;
    }
    case "dd/wager": {
      const c = s.clue;
      if (!c?.dailyDouble || c.stage === "revealed") return false;
      const contestant = a.contestantId ?? c.dailyDouble.contestantId;
      if (!contestant || !isContestant(s, contestant)) return false;
      if (!Number.isInteger(a.amount) || a.amount < 0 || a.amount > maxDailyDoubleWager(s, contestant)) return false;
      c.dailyDouble = { contestantId: contestant, wager: a.amount };
      return true;
    }
    case "clue/judge": {
      const c = s.clue;
      if (s.phase !== "clue" || !c || c.stage === "revealed") return false;
      if (c.dailyDouble) {
        const { contestantId, wager } = c.dailyDouble;
        if (wager === null || !contestantId) return false;
        addScore(s, entry, contestantId, a.correct ? wager : -wager, a.correct ? "dd-correct" : "dd-incorrect", c.id);
        c.stage = "revealed";
        s.controlId = contestantId;
        s.timer = null;
        fx.push({ cue: a.correct ? "correct" : "incorrect" });
        return true;
      }
      const playerId = a.playerId ?? c.answering;
      if (!playerId) return false;
      const contestant = contestantOf(s, playerId);
      if (!contestant) return false;
      if (a.correct) {
        addScore(s, entry, contestant, c.value, "correct", c.id);
        c.stage = "revealed";
        c.answering = null;
        s.controlId = contestant;
        s.timer = null;
        fx.push({ cue: "correct" });
      } else {
        addScore(s, entry, contestant, -c.value, "incorrect", c.id);
        if (!c.attempted.includes(contestant)) c.attempted.push(contestant);
        c.answering = null;
        c.stage = "open";
        c.buzzes = [];
        s.timer = null;
        fx.push({ cue: "incorrect" });
      }
      return true;
    }
    case "clue/reveal": {
      const c = s.clue;
      if (!c || c.stage === "revealed") return false;
      c.stage = "revealed";
      c.answering = null;
      s.timer = null;
      fx.push({ cue: "reveal" });
      return true;
    }
    case "clue/nobody": {
      const c = s.clue;
      if (!c) return false;
      c.stage = "revealed";
      c.answering = null;
      c.nobody = true;
      s.timer = null;
      fx.push({ cue: "reveal" });
      return true;
    }
    case "clue/close": {
      if (s.phase !== "clue") return false;
      closeClue(s);
      return true;
    }
    case "clue/skip": {
      if (!findClue(s.board, a.clueId)) return false;
      s.used[a.clueId] = true;
      if (s.clue?.id === a.clueId) closeClue(s);
      return true;
    }
    case "clue/setUsed": {
      if (!findClue(s.board, a.clueId)) return false;
      if (a.used) s.used[a.clueId] = true;
      else delete s.used[a.clueId];
      return true;
    }
    case "clue/edit": {
      const found = findClue(s.board, a.clueId);
      if (!found) return false;
      if (a.text !== undefined) found.clue.text = a.text;
      if (a.answer !== undefined) found.clue.answer = a.answer;
      return true;
    }
    case "final/edit": {
      if (!s.board.final) return false;
      if (a.category !== undefined) s.board.final.category = a.category;
      if (a.text !== undefined) s.board.final.text = a.text;
      if (a.answer !== undefined) s.board.final.answer = a.answer;
      return true;
    }
    case "control/set": {
      if (a.contestantId !== null && !isContestant(s, a.contestantId)) return false;
      s.controlId = a.contestantId;
      if (s.clue?.dailyDouble && s.clue.dailyDouble.wager === null && a.contestantId) {
        s.clue.dailyDouble.contestantId = a.contestantId;
      }
      return true;
    }
    case "score/adjust": {
      if (!Number.isFinite(a.delta) || a.delta === 0) return false;
      if (!isContestant(s, a.contestantId) && s.scores[a.contestantId] === undefined) return false;
      addScore(s, entry, a.contestantId, a.delta, "adjust", null);
      return true;
    }
    case "score/set": {
      if (!isContestant(s, a.contestantId) && s.scores[a.contestantId] === undefined) return false;
      const delta = a.score - scoreOf(s, a.contestantId);
      if (delta === 0) return false;
      addScore(s, entry, a.contestantId, delta, "adjust", null);
      return true;
    }

    // ---------------------------------------------------------- presentation
    case "game/pause":
      s.paused = a.paused;
      return true;
    case "screen/set":
      s.screen = a.screen;
      return true;
    case "announce":
      s.announcement = a.text ? { text: a.text, at } : null;
      if (a.text) fx.push({ cue: "announce" });
      return true;
    case "qr/show":
      s.showJoinQr = a.show;
      return true;
    case "timer/start":
      if (a.seconds <= 0) return false;
      s.timer = { startedAt: at, endsAt: at + a.seconds * 1000, label: a.label ?? "timer" };
      return true;
    case "timer/stop":
      if (!s.timer) return false;
      s.timer = null;
      return true;

    // ---------------------------------------------------------------- rounds
    case "round/set": {
      if (s.phase === "lobby") return false;
      if (a.index < 0 || a.index >= s.board.rounds.length) return false;
      const advancing = a.index > s.roundIndex || s.phase === "final" || s.phase === "finished";
      s.roundIndex = a.index;
      s.phase = "board";
      s.clue = null;
      s.final = null;
      s.timer = null;
      s.finishedAt = null;
      if (advancing && a.index > 0) s.controlId = lowestScorer(s);
      fx.push({ cue: "roundTransition" }, { cue: "boardFill" });
      return true;
    }
    case "final/start":
      if (s.phase === "lobby") return false;
      return startFinal(s, fx);
    case "final/showClue": {
      if (s.final?.stage !== "category") return false;
      s.final.stage = "clue";
      return true;
    }
    case "final/startTimer": {
      const f = s.final;
      if (!f || (f.stage !== "clue" && f.stage !== "category")) return false;
      f.stage = "writing";
      f.endsAt = at + s.settings.finalTimerSec * 1000;
      s.timer = { startedAt: at, endsAt: f.endsAt, label: "final" };
      fx.push({ cue: "think" });
      return true;
    }
    case "final/close": {
      const f = s.final;
      if (!f || (f.stage !== "writing" && f.stage !== "clue")) return false;
      f.stage = "closed";
      s.timer = null;
      f.order = [...f.eligible].sort((x, y) => scoreOf(s, x) - scoreOf(s, y));
      for (const id of f.eligible) f.revealed[id] = { answer: false, judged: null, wager: false };
      fx.push({ cue: "thinkStop" });
      return true;
    }
    case "final/reveal": {
      const f = s.final;
      if (!f || (f.stage !== "closed" && f.stage !== "reveal") || !f.eligible.includes(a.contestantId)) return false;
      f.stage = "reveal";
      f.current = a.contestantId;
      f.revealed[a.contestantId] = { ...(f.revealed[a.contestantId] ?? { judged: null, wager: false }), answer: true };
      fx.push({ cue: "finalReveal" });
      return true;
    }
    case "final/judge": {
      const f = s.final;
      const r = f?.revealed[a.contestantId];
      if (!f || f.stage !== "reveal" || !r?.answer || r.wager) return false;
      r.judged = a.correct;
      fx.push({ cue: a.correct ? "correct" : "incorrect" });
      return true;
    }
    case "final/showWager": {
      const f = s.final;
      const r = f?.revealed[a.contestantId];
      if (!f || f.stage !== "reveal" || !r || r.judged === null || r.wager) return false;
      const wager = f.wagers[a.contestantId] ?? 0;
      r.wager = true;
      addScore(s, entry, a.contestantId, r.judged ? wager : -wager, r.judged ? "final-correct" : "final-incorrect", null);
      fx.push({ cue: "finalWager" });
      if (f.eligible.every((id) => f.revealed[id]?.wager)) f.stage = "done";
      return true;
    }
    case "game/end": {
      if (s.phase === "finished") return false;
      s.phase = "finished";
      s.finishedAt = at;
      s.timer = null;
      s.clue = null;
      s.screen = "none";
      fx.push({ cue: "gameOver" });
      return true;
    }
    case "board/resetUsed":
      s.used = {};
      return true;
  }
  return false;
}

function startFinal(s: GameState, fx: Cue[]): boolean {
  if (!s.board.final) return false;
  const all = contestantIds(s);
  const positive = all.filter((id) => scoreOf(s, id) > 0);
  s.phase = "final";
  s.clue = null;
  s.timer = null;
  s.final = {
    stage: "category",
    eligible: positive.length ? positive : all,
    wagers: {},
    answers: {},
    typed: {},
    endsAt: null,
    order: [],
    revealed: {},
    current: null,
  };
  fx.push({ cue: "finalStart" });
  return true;
}

/** Replay a log from scratch (used on load and for undo of any step). */
export function replay(setup: Setup, log: LogEntry[]): GameState {
  const s = initialState(setup);
  for (const entry of log) if (!entry.undone) applyAction(s, entry);
  return s;
}

/** Is every playable clue in the current round used? */
export function roundComplete(s: GameState): boolean {
  const r = s.board.rounds[s.roundIndex];
  if (!r) return true;
  return r.categories.every((c) => c.clues.every((q) => !isPlayable(q) || s.used[q.id]));
}

/** Pick Daily Double locations for every round, resolved once at game start. */
export function resolveDailyDoubles(board: BoardContent, settings: Settings, rand: () => number = Math.random): Record<number, string[]> {
  const out: Record<number, string[]> = {};
  board.rounds.forEach((round, r) => {
    if (settings.dailyDoublePlacement === "author") {
      out[r] = round.categories.flatMap((c) => c.clues.filter((q) => q.dailyDouble && isPlayable(q)).map((q) => q.id));
      return;
    }
    const count = round.kind === "double" ? settings.dailyDoublesDouble : settings.dailyDoublesSingle;
    // Weight lower rows higher (like the show) and avoid two in one category.
    const candidates = round.categories.flatMap((c, ci) =>
      c.clues.map((q, row) => ({ id: q.id, ci, w: isPlayable(q) ? 1 + row : 0 })),
    );
    const picked: string[] = [];
    const usedCats = new Set<number>();
    for (let i = 0; i < count; i++) {
      let pool = candidates.filter((c) => c.w > 0 && !picked.includes(c.id) && !usedCats.has(c.ci));
      if (!pool.length) pool = candidates.filter((c) => c.w > 0 && !picked.includes(c.id));
      if (!pool.length) break;
      const total = pool.reduce((n, c) => n + c.w, 0);
      let x = rand() * total;
      let choice = pool[pool.length - 1];
      for (const c of pool) {
        x -= c.w;
        if (x <= 0) {
          choice = c;
          break;
        }
      }
      picked.push(choice.id);
      usedCats.add(choice.ci);
    }
    out[r] = picked;
  });
  return out;
}
