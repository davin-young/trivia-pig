import { findClue } from "@/shared/board";
import { replay } from "@/engine/reducer";
import type { GameState, LogEntry, ScoreEvent, Setup } from "@/engine/types";

export interface ResultContestant {
  id: string;
  name: string;
  color?: string;
}

export interface ClueRow {
  clueId: string;
  round: number;
  roundName: string;
  category: string;
  value: number;
  text: string;
  answer: string;
  deltas: Record<string, number>;
}

export interface Standing extends ResultContestant {
  score: number;
  rank: number;
}

export interface FinalRow extends ResultContestant {
  wager: number | null;
  correct: boolean | null;
  typed: string | null;
  hasDrawing: boolean;
}

export interface GameResults {
  state: GameState;
  contestants: ResultContestant[];
  standings: Standing[];
  clueRows: ClueRow[];
  adjustments: Record<string, number>;
  final: { category: string; text: string; answer: string; rows: FinalRow[] } | null;
  events: ScoreEvent[];
}

/** Everyone who could have scored: teams in team mode, otherwise every player who joined (even if later removed but scored). */
export function contestantsOf(s: GameState): ResultContestant[] {
  if (s.settings.mode === "team") return s.teams.map((t) => ({ id: t.id, name: t.name, color: t.color }));
  const scored = new Set(s.scoreEvents.map((e) => e.contestantId));
  return s.playerOrder
    .map((id) => s.players[id])
    .filter((p) => p && (!p.removed || scored.has(p.id)))
    .map((p) => ({ id: p.id, name: p.name }));
}

/** Rank with ties sharing a place (1, 1, 3, …). */
export function rankStandings(contestants: ResultContestant[], scores: Record<string, number>): Standing[] {
  const sorted = [...contestants].map((c) => ({ ...c, score: scores[c.id] ?? 0 })).sort((a, b) => b.score - a.score);
  return sorted.map((c) => ({ ...c, rank: sorted.findIndex((x) => x.score === c.score) + 1 }));
}

export function buildResults(setup: Setup, log: LogEntry[]): GameResults {
  const state = replay(setup, log);
  const contestants = contestantsOf(state);
  const clueRows: ClueRow[] = [];
  state.board.rounds.forEach((round, r) => {
    const rows = round.values.length;
    for (let row = 0; row < rows; row++) {
      for (const cat of round.categories) {
        const clue = cat.clues[row];
        if (!clue) continue;
        const deltas: Record<string, number> = {};
        for (const e of state.scoreEvents) if (e.clueId === clue.id) deltas[e.contestantId] = (deltas[e.contestantId] ?? 0) + e.delta;
        if (!Object.keys(deltas).length && !state.used[clue.id]) continue;
        clueRows.push({
          clueId: clue.id,
          round: r,
          roundName: round.name,
          category: cat.name,
          value: round.values[row] ?? 0,
          text: clue.text,
          answer: clue.answer,
          deltas,
        });
      }
    }
  });

  const adjustments: Record<string, number> = {};
  for (const e of state.scoreEvents) if (e.kind === "adjust") adjustments[e.contestantId] = (adjustments[e.contestantId] ?? 0) + e.delta;

  let final: GameResults["final"] = null;
  if (state.final && state.board.final) {
    const f = state.final;
    final = {
      category: state.board.final.category,
      text: state.board.final.text,
      answer: state.board.final.answer,
      rows: f.eligible.map((id) => ({
        id,
        name: contestants.find((c) => c.id === id)?.name ?? id,
        color: contestants.find((c) => c.id === id)?.color,
        wager: f.wagers[id] ?? null,
        correct: f.revealed[id]?.judged ?? null,
        typed: f.typed[id] ?? null,
        hasDrawing: !!f.answers[id],
      })),
    };
  }

  return { state, contestants, standings: rankStandings(contestants, state.scores), clueRows, adjustments, final, events: state.scoreEvents };
}

function csvCell(v: unknown): string {
  const s = v === null || v === undefined ? "" : String(v);
  // Neutralise spreadsheet formula injection and quote when needed.
  const safe = /^[=+\-@\t\r]/.test(s) && !/^-?\d+(\.\d+)?$/.test(s) ? `'${s}` : s;
  return /[",\n\r]/.test(safe) ? `"${safe.replace(/"/g, '""')}"` : safe;
}

export function csvRow(cells: unknown[]): string {
  return cells.map(csvCell).join(",");
}

const KIND_LABEL: Record<ScoreEvent["kind"], string> = {
  correct: "correct",
  incorrect: "incorrect",
  "dd-correct": "daily double correct",
  "dd-incorrect": "daily double incorrect",
  "final-correct": "final correct",
  "final-incorrect": "final incorrect",
  adjust: "manual adjustment",
};

export function resultsCsv(res: GameResults, title: string): string {
  const s = res.state;
  const name = (id: string) => res.contestants.find((c) => c.id === id)?.name ?? id;
  const running: Record<string, number> = {};
  const lines: string[] = [csvRow(["Game", title]), "", csvRow(["time", "round", "category", "value", "clue", "answer", "contestant", "delta", "kind", "running total"])];
  for (const e of res.events) {
    running[e.contestantId] = (running[e.contestantId] ?? 0) + e.delta;
    const found = e.clueId ? findClue(s.board, e.clueId) : null;
    const isFinal = e.kind === "final-correct" || e.kind === "final-incorrect";
    lines.push(
      csvRow([
        new Date(e.at).toISOString(),
        isFinal ? "Final" : found ? (s.board.rounds[found.round]?.name ?? found.round + 1) : "",
        isFinal ? (s.board.final?.category ?? "") : (found?.category.name ?? ""),
        found?.value ?? "",
        isFinal ? (s.board.final?.text ?? "") : (found?.clue.text ?? ""),
        isFinal ? (s.board.final?.answer ?? "") : (found?.clue.answer ?? ""),
        name(e.contestantId),
        e.delta,
        KIND_LABEL[e.kind],
        running[e.contestantId],
      ]),
    );
  }
  lines.push("", csvRow(["Final standings"]), csvRow(["rank", "contestant", "score"]));
  for (const st of res.standings) lines.push(csvRow([st.rank, st.name, st.score]));
  return lines.join("\r\n") + "\r\n";
}
