import { describe, expect, it } from "vitest";
import { makeRound, type BoardContent } from "@/shared/board";
import { DEFAULT_SETTINGS, type GameAction, type LogEntry, type Setup } from "@/engine/types";
import { buildResults, csvRow, rankStandings, resultsCsv } from "./results";

function setup(): Setup {
  const r1 = makeRound("single", 2, [100, 200]);
  r1.categories.forEach((c, ci) => {
    c.name = `Cat ${ci}`;
    c.clues.forEach((q, qi) => {
      q.text = `clue ${ci}-${qi}`;
      q.answer = `answer ${ci}-${qi}`;
    });
  });
  const board: BoardContent = { rounds: [r1], final: { category: "F", text: "final clue", answer: "final answer" } };
  return { board, settings: DEFAULT_SETTINGS };
}

function log(actions: GameAction[]): LogEntry[] {
  return actions.map((action, i) => ({ seq: i + 1, at: 1_000 + i * 10, by: "host:u", action }));
}

describe("results", () => {
  it("builds per-clue breakdown, standings and final rows", () => {
    const s = setup();
    const q = s.board.rounds[0].categories[0].clues[1].id;
    const res = buildResults(
      s,
      log([
        { type: "player/join", playerId: "a", name: "Ann", signature: null },
        { type: "player/join", playerId: "b", name: "Bob", signature: null },
        { type: "game/start", dailyDoubles: {} },
        { type: "clue/open", clueId: q },
        { type: "buzzers/unlock" },
        { type: "player/buzz", playerId: "b" },
        { type: "clue/judge", correct: false },
        { type: "player/buzz", playerId: "a" },
        { type: "clue/judge", correct: true },
        { type: "clue/close" },
        { type: "score/adjust", contestantId: "b", delta: 50 },
        { type: "final/start" },
        { type: "player/finalWager", playerId: "a", amount: 100 },
        { type: "final/startTimer" },
        { type: "final/close" },
        { type: "final/reveal", contestantId: "a" },
        { type: "final/judge", contestantId: "a", correct: true },
        { type: "final/showWager", contestantId: "a" },
      ]),
    );
    expect(res.clueRows).toHaveLength(1);
    expect(res.clueRows[0]).toMatchObject({ category: "Cat 0", value: 200, deltas: { a: 200, b: -200 } });
    expect(res.adjustments).toEqual({ b: 50 });
    expect(res.standings.map((x) => [x.name, x.score, x.rank])).toEqual([
      ["Ann", 300, 1],
      ["Bob", -150, 2],
    ]);
    expect(res.final?.rows).toEqual([{ id: "a", name: "Ann", color: undefined, wager: 100, correct: true, typed: null, hasDrawing: false }]);

    const csv = resultsCsv(res, "Test");
    expect(csv).toContain("answer 0-1");
    expect(csv).toContain("final correct");
    expect(csv.trim().split("\r\n").at(-1)).toBe("2,Bob,-150");
  });

  it("ranks ties together", () => {
    const st = rankStandings([{ id: "a", name: "A" }, { id: "b", name: "B" }, { id: "c", name: "C" }], { a: 5, b: 5, c: 1 });
    expect(st.map((s) => s.rank)).toEqual([1, 1, 3]);
  });

  it("escapes CSV and neutralises formulas", () => {
    expect(csvRow(['a,b', 'say "hi"', "=SUM(A1)", -5])).toBe('"a,b","say ""hi""",\'=SUM(A1),-5');
  });
});
