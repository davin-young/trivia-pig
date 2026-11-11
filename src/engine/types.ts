import { z } from "zod";
import type { BoardContent } from "@/shared/board";
import type { Drawing } from "@/shared/strokes";

export const settingsSchema = z.object({
  mode: z.enum(["solo", "team"]).default("solo"),
  maxPlayers: z.number().int().min(1).max(50).default(12),
  maxTeams: z.number().int().min(2).max(10).default(4),
  allowLateJoin: z.boolean().default(true),
  /** Seconds a buzzed-in player has to answer (0 = no timer). */
  answerTimerSec: z.number().int().min(0).max(120).default(8),
  /** Penalty for buzzing before buzzers unlock (0 = off). */
  earlyBuzzLockoutMs: z.number().int().min(0).max(5000).default(250),
  /** Can a player/team that answered wrong buzz again on the same clue? */
  allowRebuzz: z.boolean().default(false),
  dailyDoublePlacement: z.enum(["author", "random"]).default("author"),
  /** Random placement: how many Daily Doubles per round, by round kind. */
  dailyDoublesSingle: z.number().int().min(0).max(5).default(1),
  dailyDoublesDouble: z.number().int().min(0).max(5).default(2),
  finalTimerSec: z.number().int().min(10).max(300).default(30),
  multiColor: z.boolean().default(true),
  sound: z
    .object({
      master: z.number().min(0).max(1).default(0.8),
      muted: z.boolean().default(false),
      music: z.boolean().default(true),
      sfx: z.boolean().default(true),
      playerBuzzSound: z.boolean().default(true),
    })
    .default({ master: 0.8, muted: false, music: true, sfx: true, playerBuzzSound: true }),
});
export type Settings = z.infer<typeof settingsSchema>;
export const DEFAULT_SETTINGS: Settings = settingsSchema.parse({});

export interface Setup {
  board: BoardContent;
  settings: Settings;
}

export interface Player {
  id: string;
  name: string;
  signature: Drawing | null;
  signatureHidden: boolean;
  teamId: string | null;
  joinedAt: number;
  /** 0-based join index, used for per-player buzz tones and colors. */
  index: number;
  removed: boolean;
  banned: boolean;
}

export interface Team {
  id: string;
  name: string;
  color: string;
}

export interface ScoreEvent {
  seq: number;
  contestantId: string;
  delta: number;
  clueId: string | null;
  round: number | null;
  kind: "correct" | "incorrect" | "dd-correct" | "dd-incorrect" | "final-correct" | "final-incorrect" | "adjust";
  at: number;
}

export interface Timer {
  startedAt: number;
  endsAt: number;
  label: string;
}

export type ClueStage = "reading" | "open" | "answering" | "revealed";

export interface ActiveClue {
  id: string;
  round: number;
  value: number;
  stage: ClueStage;
  /** Every buzz while the clue is live, in server-arrival order. */
  buzzes: { playerId: string; at: number }[];
  /** The player currently answering. */
  answering: string | null;
  /** Contestants (players or teams) who already answered wrong. */
  attempted: string[];
  /** playerId -> timestamp until which buzzes are ignored (early-buzz penalty). */
  lockouts: Record<string, number>;
  dailyDouble: null | { contestantId: string; wager: number | null };
  /** Set by "nobody got it": the display shows the answer and the server returns to the board. */
  nobody: boolean;
}

export type FinalStage = "category" | "clue" | "writing" | "closed" | "reveal" | "done";

export interface FinalState {
  stage: FinalStage;
  /** Contestants eligible to play Final (score > 0 at start, or everyone if nobody qualifies). */
  eligible: string[];
  wagers: Record<string, number>;
  answers: Record<string, Drawing>;
  /** Typed fallback answers (players without a drawing surface). */
  typed: Record<string, string>;
  endsAt: number | null;
  /** Reveal order (lowest score first, like the show). */
  order: string[];
  /** Per-contestant reveal progress. */
  revealed: Record<string, { answer: boolean; judged: boolean | null; wager: boolean }>;
  current: string | null;
}

export type Screen = "none" | "blank" | "brb" | "scores";

export interface GameState {
  phase: "lobby" | "board" | "clue" | "final" | "finished";
  settings: Settings;
  board: BoardContent;
  roundIndex: number;
  /** clue ids that are Daily Doubles, per round index */
  dailyDoubles: Record<number, string[]>;
  used: Record<string, boolean>;
  players: Record<string, Player>;
  playerOrder: string[];
  teams: Team[];
  scores: Record<string, number>;
  controlId: string | null;
  clue: ActiveClue | null;
  final: FinalState | null;
  timer: Timer | null;
  paused: boolean;
  screen: Screen;
  announcement: { text: string; at: number } | null;
  showJoinQr: boolean;
  lobbyLocked: boolean;
  bannedNames: string[];
  scoreEvents: ScoreEvent[];
  startedAt: number | null;
  finishedAt: number | null;
  /** Monotonic counter of applied actions, used by clients to detect changes. */
  version: number;
}

// ---------------------------------------------------------------------------
// Actions. Everything here is fully resolved (timestamps, random picks, ids)
// so replaying the log is deterministic.
// ---------------------------------------------------------------------------

export type GameAction =
  // players
  | { type: "player/join"; playerId: string; name: string; signature: Drawing | null; teamId?: string | null }
  | { type: "player/signature"; playerId: string; signature: Drawing | null }
  | { type: "player/buzz"; playerId: string }
  | { type: "player/finalWager"; playerId: string; amount: number }
  | { type: "player/finalAnswer"; playerId: string; drawing: Drawing | null; typed?: string }
  // lobby & management
  | { type: "settings/update"; settings: Partial<Settings> }
  | { type: "lobby/lock"; locked: boolean }
  | { type: "player/rename"; playerId: string; name: string }
  | { type: "player/resetSignature"; playerId: string }
  | { type: "player/hideSignature"; playerId: string; hidden: boolean }
  | { type: "player/kick"; playerId: string }
  | { type: "player/ban"; playerId: string }
  | { type: "player/restore"; playerId: string }
  | { type: "team/create"; teamId: string; name: string; color: string }
  | { type: "team/rename"; teamId: string; name: string }
  | { type: "team/delete"; teamId: string }
  | { type: "team/assign"; playerId: string; teamId: string | null }
  | { type: "team/autoBalance"; assignments: Record<string, string> }
  | { type: "game/start"; dailyDoubles: Record<number, string[]> }
  // clue flow
  | { type: "clue/open"; clueId: string }
  | { type: "buzzers/unlock" }
  | { type: "buzzers/lock" }
  | { type: "clue/judge"; correct: boolean; playerId?: string }
  | { type: "clue/reveal" }
  | { type: "clue/nobody" }
  | { type: "clue/close" }
  | { type: "dd/wager"; amount: number; contestantId?: string }
  | { type: "clue/skip"; clueId: string }
  | { type: "clue/setUsed"; clueId: string; used: boolean }
  | { type: "clue/edit"; clueId: string; text?: string; answer?: string }
  | { type: "final/edit"; category?: string; text?: string; answer?: string }
  | { type: "control/set"; contestantId: string | null }
  | { type: "score/adjust"; contestantId: string; delta: number }
  | { type: "score/set"; contestantId: string; score: number }
  // presentation
  | { type: "game/pause"; paused: boolean }
  | { type: "screen/set"; screen: Screen }
  | { type: "announce"; text: string | null }
  | { type: "qr/show"; show: boolean }
  | { type: "timer/start"; seconds: number; label?: string }
  | { type: "timer/stop" }
  // rounds
  | { type: "round/set"; index: number }
  | { type: "final/start" }
  | { type: "final/showClue" }
  | { type: "final/startTimer" }
  | { type: "final/close" }
  | { type: "final/reveal"; contestantId: string }
  | { type: "final/judge"; contestantId: string; correct: boolean }
  | { type: "final/showWager"; contestantId: string }
  | { type: "final/hostWager"; contestantId: string; amount: number }
  | { type: "game/end" }
  | { type: "board/resetUsed" };

export type ActionType = GameAction["type"];

export interface LogEntry {
  seq: number;
  at: number;
  /** Who issued it: "player:<id>", "host:<userId>", or "system". */
  by: string;
  action: GameAction;
  undone?: boolean;
}

/** Actions that come from players. Hidden from the host's undo list by default. */
export const PLAYER_ACTIONS: ReadonlySet<ActionType> = new Set([
  "player/join",
  "player/signature",
  "player/buzz",
  "player/finalWager",
  "player/finalAnswer",
]);
