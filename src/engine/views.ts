import { findClue, isPlayable, type BoardContent, type Media } from "@/shared/board";
import type { Drawing } from "@/shared/strokes";
import { describeAction } from "./history";
import { contestantOf, maxDailyDoubleWager, maxFinalWager, roundComplete } from "./reducer";
import { PLAYER_ACTIONS, type FinalStage, type GameState, type LogEntry, type Settings, type Team, type Timer, type Screen, type ClueStage } from "./types";

/**
 * What each audience is allowed to see. Display and player views never
 * contain clue answers (or unopened clue text) until they are revealed.
 */
export type Audience = "host" | "display" | "player";

export interface BoardCellView {
  id: string;
  value: number;
  used: boolean;
  playable: boolean;
  /** host only */
  text?: string;
  answer?: string;
  dailyDouble?: boolean;
  media?: Media | null;
}

export interface PlayerView {
  id: string;
  name: string;
  signature: Drawing | null;
  signatureHidden: boolean;
  teamId: string | null;
  index: number;
  removed: boolean;
  banned: boolean;
}

export interface ClueView {
  id: string;
  value: number;
  category: string;
  stage: ClueStage;
  /** null while a Daily Double wager is pending (display/player). */
  text: string | null;
  media: Media | null;
  answer: string | null;
  answerMedia: Media | null;
  answering: string | null;
  buzzes: { playerId: string; at: number }[];
  attempted: string[];
  dailyDouble: null | { contestantId: string; wager: number | null; max: number };
  nobody: boolean;
}

export interface FinalView {
  stage: FinalStage;
  category: string;
  text: string | null;
  media: Media | null;
  answer: string | null;
  answerMedia: Media | null;
  eligible: string[];
  order: string[];
  current: string | null;
  revealed: Record<string, { answer: boolean; judged: boolean | null; wager: boolean }>;
  /** who has locked in a wager / an answer (no values) */
  hasWager: Record<string, boolean>;
  hasAnswer: Record<string, boolean>;
  /** values: everything for host; only revealed entries for others */
  answers: Record<string, Drawing>;
  typed: Record<string, string>;
  wagers: Record<string, number>;
  endsAt: number | null;
}

export interface HistoryItemView {
  seq: number;
  at: number;
  label: string;
  by: string;
  undone: boolean;
  player: boolean;
}

export interface GameView {
  audience: Audience;
  code: string;
  title: string;
  phase: GameState["phase"];
  settings: Settings;
  rounds: { name: string; kind: "single" | "double" }[];
  roundIndex: number;
  roundComplete: boolean;
  hasFinal: boolean;
  board: { values: number[]; categories: { id: string; name: string; clues: BoardCellView[] }[] } | null;
  players: PlayerView[];
  teams: Team[];
  scores: Record<string, number>;
  controlId: string | null;
  clue: ClueView | null;
  final: FinalView | null;
  timer: Timer | null;
  paused: boolean;
  screen: Screen;
  announcement: { text: string; at: number } | null;
  showJoinQr: boolean;
  lobbyLocked: boolean;
  version: number;
  serverNow: number;
  /** player audience only */
  me?: {
    playerId: string;
    contestantId: string | null;
    lockedUntil: number;
    canBuzz: boolean;
    finalEligible: boolean;
    finalMaxWager: number;
    finalWager: number | null;
    finalAnswer: Drawing | null;
    finalTyped: string | null;
  };
  /** host audience only */
  host?: {
    history: HistoryItemView[];
    dailyDoubles: Record<number, string[]>;
    bannedNames: string[];
    fullBoard: BoardContent;
  };
}

export function buildView(
  s: GameState,
  ctx: { audience: Audience; code: string; title: string; playerId?: string; log?: LogEntry[]; now?: number },
): GameView {
  const isHost = ctx.audience === "host";
  const round = s.board.rounds[s.roundIndex];
  const dd = new Set(s.dailyDoubles[s.roundIndex] ?? []);

  const board =
    s.phase === "lobby" && !isHost
      ? null
      : round
        ? {
            values: round.values,
            categories: round.categories.map((cat) => ({
              id: cat.id,
              name: cat.name,
              clues: cat.clues.map((q, row) => {
                const cell: BoardCellView = {
                  id: q.id,
                  value: round.values[row] ?? 0,
                  used: !!s.used[q.id],
                  playable: isPlayable(q),
                };
                if (isHost) {
                  cell.text = q.text;
                  cell.answer = q.answer;
                  cell.dailyDouble = dd.has(q.id);
                  cell.media = q.media ?? null;
                }
                return cell;
              }),
            })),
          }
        : null;

  let clue: ClueView | null = null;
  if (s.clue) {
    const c = s.clue;
    const found = findClue(s.board, c.id);
    const revealed = c.stage === "revealed";
    const ddPending = !!c.dailyDouble && c.dailyDouble.wager === null;
    const showText = isHost || !ddPending;
    clue = {
      id: c.id,
      value: c.value,
      category: found?.category.name ?? "",
      stage: c.stage,
      text: showText ? (found?.clue.text ?? "") : null,
      media: showText ? (found?.clue.media ?? null) : null,
      answer: isHost || revealed ? (found?.clue.answer ?? "") : null,
      answerMedia: isHost || revealed ? (found?.clue.answerMedia ?? null) : null,
      answering: c.answering,
      buzzes: c.buzzes,
      attempted: c.attempted,
      dailyDouble: c.dailyDouble
        ? { ...c.dailyDouble, max: c.dailyDouble.contestantId ? maxDailyDoubleWager(s, c.dailyDouble.contestantId) : 0 }
        : null,
      nobody: c.nobody,
    };
  }

  let final: FinalView | null = null;
  if (s.final && s.board.final) {
    const f = s.final;
    const fc = s.board.final;
    const textVisible = isHost || f.stage !== "category";
    const anyCorrectShown = Object.values(f.revealed).some((r) => r.judged === true);
    const answerVisible = isHost || f.stage === "done" || anyCorrectShown;
    const answers: Record<string, Drawing> = {};
    const typed: Record<string, string> = {};
    const wagers: Record<string, number> = {};
    for (const id of f.eligible) {
      const r = f.revealed[id];
      if (isHost || r?.answer) {
        if (f.answers[id]) answers[id] = f.answers[id];
        if (f.typed[id] !== undefined) typed[id] = f.typed[id];
      }
      if ((isHost || r?.wager) && f.wagers[id] !== undefined) wagers[id] = f.wagers[id];
    }
    final = {
      stage: f.stage,
      category: fc.category,
      text: textVisible ? fc.text : null,
      media: textVisible ? (fc.media ?? null) : null,
      answer: answerVisible ? fc.answer : null,
      answerMedia: answerVisible ? (fc.answerMedia ?? null) : null,
      eligible: f.eligible,
      order: f.order,
      current: f.current,
      revealed: f.revealed,
      hasWager: Object.fromEntries(f.eligible.map((id) => [id, f.wagers[id] !== undefined])),
      hasAnswer: Object.fromEntries(f.eligible.map((id) => [id, !!f.answers[id] || !!f.typed[id]])),
      answers,
      typed,
      wagers,
      endsAt: f.endsAt,
    };
  }

  const players: PlayerView[] = s.playerOrder
    .map((id) => s.players[id])
    .filter((p) => p && (isHost || !p.removed))
    .map((p) => ({
      id: p.id,
      name: p.name,
      signature: p.signatureHidden && !isHost ? null : p.signature,
      signatureHidden: p.signatureHidden,
      teamId: p.teamId,
      index: p.index,
      removed: p.removed,
      banned: p.banned,
    }));

  const view: GameView = {
    audience: ctx.audience,
    code: ctx.code,
    title: ctx.title,
    phase: s.phase,
    settings: s.settings,
    rounds: s.board.rounds.map((r) => ({ name: r.name, kind: r.kind })),
    roundIndex: s.roundIndex,
    roundComplete: roundComplete(s),
    hasFinal: !!s.board.final,
    board,
    players,
    teams: s.teams,
    scores: s.scores,
    controlId: s.controlId,
    clue,
    final,
    timer: s.timer,
    paused: s.paused,
    screen: s.screen,
    announcement: s.announcement,
    showJoinQr: s.showJoinQr,
    lobbyLocked: s.lobbyLocked,
    version: s.version,
    serverNow: ctx.now ?? Date.now(),
  };

  if (ctx.audience === "player" && ctx.playerId) {
    const pid = ctx.playerId;
    const contestantId = contestantOf(s, pid);
    const c = s.clue;
    const lockedUntil = c?.lockouts[pid] ?? 0;
    const canBuzz =
      !!c &&
      !!contestantId &&
      !c.dailyDouble &&
      c.stage === "open" &&
      !s.paused &&
      (s.settings.allowRebuzz || !c.attempted.includes(contestantId)) &&
      !c.buzzes.some((b) => b.playerId === pid);
    const f = s.final;
    view.me = {
      playerId: pid,
      contestantId,
      lockedUntil,
      canBuzz,
      finalEligible: !!f && !!contestantId && f.eligible.includes(contestantId),
      finalMaxWager: contestantId ? maxFinalWager(s, contestantId) : 0,
      finalWager: f && contestantId ? (f.wagers[contestantId] ?? null) : null,
      finalAnswer: f && contestantId ? (f.answers[contestantId] ?? null) : null,
      finalTyped: f && contestantId ? (f.typed[contestantId] ?? null) : null,
    };
  }

  if (isHost) {
    view.host = {
      history: (ctx.log ?? []).slice(-300).map((e) => ({
        seq: e.seq,
        at: e.at,
        label: describeAction(e.action, s),
        by: e.by,
        undone: !!e.undone,
        player: PLAYER_ACTIONS.has(e.action.type),
      })),
      dailyDoubles: s.dailyDoubles,
      bannedNames: s.bannedNames,
      fullBoard: s.board,
    };
  }

  return view;
}
