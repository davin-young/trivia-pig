import { findClue } from "@/shared/board";
import type { GameState } from "@/engine/types";
import { contestantsOf } from "./results";

/** How many lines the score chart draws (it has that many validated colours). */
export const RECAP_CHART_SERIES = 5;

export interface RecapSeries {
  id: string;
  name: string;
  /** Running score: index 0 is the start (0), then one entry per step. */
  points: number[];
}

/** One contestant's game, for the breakdown table. */
export interface RecapLine {
  id: string;
  name: string;
  right: number;
  wrong: number;
  /** Points gained in each round (same order as `Recap.rounds`). */
  byRound: number[];
  /** Points won or lost on the final clue (null when there was none, or they sat it out). */
  final: number | null;
  /**
   * Score from clue values alone: a wager clue counts at its face value when right and
   * nothing when wrong, and the final clue is left out. Shows who knew the most,
   * separate from who bet best.
   */
  base: number;
  total: number;
}

export interface Recap {
  series: RecapSeries[];
  rounds: string[];
  lines: RecapLine[];
  /** Before the final clue, the leader had more than double second place: nobody could catch them. */
  runaway: string | null;
  /** What each step was, for the chart tooltip. Never clue text or answers. */
  steps: string[];
  cluesPlayed: number;
  right: number;
  wrong: number;
  leadChanges: number;
  /** Points between first and second place (null with fewer than two contestants). */
  margin: number | null;
  biggest: { name: string; delta: number; where: string } | null;
  /** The category with the most wrong answers. */
  toughest: { category: string; wrong: number; right: number } | null;
  /** Clues that were opened and nobody got right. */
  nobody: number;
  minutes: number | null;
}

/**
 * The story of a finished game, for the public results page. It names categories and
 * point values but never includes clue text or answers.
 */
export function buildRecap(s: GameState): Recap {
  const contestants = contestantsOf(s);
  const running: Record<string, number> = Object.fromEntries(contestants.map((c) => [c.id, 0]));
  const series: RecapSeries[] = contestants.map((c) => ({ id: c.id, name: c.name, points: [0] }));
  const steps: string[] = [];
  const nameOf = (id: string) => contestants.find((c) => c.id === id)?.name ?? "Someone";

  const where = (clueId: string | null, kind: string): { label: string; category: string | null } => {
    if (kind.startsWith("final")) return { label: "Final clue", category: null };
    if (kind === "adjust" || !clueId) return { label: "Score adjustment", category: null };
    const f = findClue(s.board, clueId);
    return f ? { label: `${f.category.name} for ${f.value}`, category: f.category.name } : { label: "A clue", category: null };
  };

  const lines: Record<string, RecapLine> = Object.fromEntries(
    contestants.map((c) => [c.id, { id: c.id, name: c.name, right: 0, wrong: 0, byRound: s.board.rounds.map(() => 0), final: null, base: 0, total: 0 }]),
  );
  let runaway: string | null = null;
  let sawFinal = false;

  let leader: string | null = null;
  let leadChanges = 0;
  let right = 0;
  let wrong = 0;
  let biggest: Recap["biggest"] = null;
  const byCategory = new Map<string, { wrong: number; right: number }>();
  const gotRight = new Set<string>();

  for (const e of s.scoreEvents) {
    if (running[e.contestantId] === undefined) continue;
    const isFinal = e.kind.startsWith("final");
    if (isFinal && !sawFinal) {
      sawFinal = true;
      const before = Object.entries(running).sort((a, b) => b[1] - a[1]);
      if (before.length >= 2 && before[0][1] > 0 && before[0][1] > 2 * Math.max(before[1][1], 0)) runaway = nameOf(before[0][0]);
    }
    const line = lines[e.contestantId];
    if (isFinal) line.final = (line.final ?? 0) + e.delta;
    else if (e.kind !== "adjust" && e.round !== null && line.byRound[e.round] !== undefined) line.byRound[e.round] += e.delta;
    if (e.kind === "correct" || e.kind === "incorrect") line.base += e.delta;
    else if (e.kind === "dd-correct" && e.clueId) line.base += findClue(s.board, e.clueId)?.value ?? 0;
    if (e.kind !== "adjust") {
      if (e.kind.endsWith("correct") && !e.kind.endsWith("incorrect")) line.right++;
      else line.wrong++;
    }
    running[e.contestantId] += e.delta;
    const w = where(e.clueId, e.kind);
    steps.push(`${nameOf(e.contestantId)}: ${e.delta >= 0 ? "+" : "-"}${Math.abs(e.delta).toLocaleString("en-US")} (${w.label})`);
    for (const line of series) line.points.push(running[line.id]);

    if (e.kind !== "adjust") {
      const isRight = e.kind.endsWith("-correct") || e.kind === "correct";
      if (isRight) {
        right++;
        if (e.clueId) gotRight.add(e.clueId);
      } else wrong++;
      if (w.category) {
        const c = byCategory.get(w.category) ?? { wrong: 0, right: 0 };
        if (isRight) c.right++;
        else c.wrong++;
        byCategory.set(w.category, c);
      }
      if (!biggest || Math.abs(e.delta) > Math.abs(biggest.delta)) biggest = { name: nameOf(e.contestantId), delta: e.delta, where: w.label };
    }

    const top = Math.max(...Object.values(running));
    const leaders = Object.keys(running).filter((id) => running[id] === top);
    if (leaders.length === 1 && leaders[0] !== leader) {
      if (leader !== null) leadChanges++;
      leader = leaders[0];
    }
  }

  const sorted = Object.values(running).sort((a, b) => b - a);
  let toughest: Recap["toughest"] = null;
  for (const [category, c] of byCategory) {
    if (c.wrong > 0 && (!toughest || c.wrong > toughest.wrong || (c.wrong === toughest.wrong && c.right < toughest.right))) toughest = { category, ...c };
  }
  const opened = Object.keys(s.used).filter((id) => s.used[id] && findClue(s.board, id));

  for (const c of contestants) lines[c.id].total = s.scores[c.id] ?? 0;

  return {
    series,
    rounds: s.board.rounds.map((r, i) => r.name || `Round ${i + 1}`),
    lines: contestants.map((c) => lines[c.id]).sort((a, b) => b.total - a.total),
    runaway,
    steps,
    cluesPlayed: opened.length,
    right,
    wrong,
    leadChanges,
    margin: sorted.length >= 2 ? sorted[0] - sorted[1] : null,
    biggest,
    toughest,
    nobody: opened.filter((id) => !gotRight.has(id)).length,
    minutes: s.startedAt && s.finishedAt && s.finishedAt > s.startedAt ? Math.max(1, Math.round((s.finishedAt - s.startedAt) / 60000)) : null,
  };
}
