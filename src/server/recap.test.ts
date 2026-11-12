import { describe, expect, it } from "vitest";
import { makeRound, type BoardContent } from "@/shared/board";
import { replay } from "@/engine/reducer";
import { DEFAULT_SETTINGS, type GameAction, type LogEntry, type Setup } from "@/engine/types";
import { buildRecap } from "./recap";

function setup(): Setup {
  const r1 = makeRound("single", 2, [100, 200]);
  r1.categories.forEach((c, ci) => {
    c.name = `Cat ${ci}`;
    c.clues.forEach((q, qi) => {
      q.text = `secret clue ${ci}-${qi}`;
      q.answer = `secret answer ${ci}-${qi}`;
    });
  });
  const board: BoardContent = { rounds: [r1] };
  return { board, settings: DEFAULT_SETTINGS };
}

function log(actions: GameAction[]): LogEntry[] {
  return actions.map((action, i) => ({ seq: i + 1, at: 1_000 + i * 60_000, by: "host:u", action }));
}

describe("recap", () => {
  const s = setup();
  const clue = (cat: number, row: number) => s.board.rounds[0].categories[cat].clues[row].id;
  const answer = (clueId: string, playerId: string, correct: boolean): GameAction[] => [
    { type: "clue/open", clueId },
    { type: "buzzers/unlock" },
    { type: "player/buzz", playerId },
    { type: "clue/judge", correct },
    ...(correct ? [] : ([{ type: "clue/nobody" }] as GameAction[])),
    { type: "clue/close" },
  ];
  const state = replay(
    s,
    log([
      { type: "player/join", playerId: "a", name: "Ann", signature: null },
      { type: "player/join", playerId: "b", name: "Bob", signature: null },
      { type: "game/start", dailyDoubles: {} },
      ...answer(clue(0, 0), "a", true), // Ann 100
      ...answer(clue(0, 1), "b", true), // Bob 200: Bob takes the lead
      ...answer(clue(1, 0), "b", false), // Bob 100: tied, nobody leads
      ...answer(clue(1, 1), "a", true), // Ann 300: Ann takes it back
      { type: "game/end" },
    ]),
  );
  const recap = buildRecap(state);

  it("tracks every contestant's running score", () => {
    expect(recap.series.find((x) => x.id === "a")?.points).toEqual([0, 100, 100, 100, 300]);
    expect(recap.series.find((x) => x.id === "b")?.points).toEqual([0, 0, 200, 100, 100]);
    expect(recap.steps).toHaveLength(4);
  });

  it("counts lead changes, margin, right and wrong", () => {
    expect(recap.leadChanges).toBe(2);
    expect(recap.margin).toBe(200);
    expect(recap.right).toBe(3);
    expect(recap.wrong).toBe(1);
    expect(recap.cluesPlayed).toBe(4);
    expect(recap.nobody).toBe(1);
    expect(recap.biggest).toMatchObject({ name: "Bob", delta: 200, where: "Cat 0 for 200" });
    expect(recap.toughest).toMatchObject({ category: "Cat 1", wrong: 1 });
  });

  it("breaks the game down player by player", () => {
    expect(recap.lines.map((l) => l.name)).toEqual(["Ann", "Bob"]);
    expect(recap.lines[0]).toMatchObject({ right: 2, wrong: 0, byRound: [300], final: null, base: 300, total: 300 });
    expect(recap.lines[1]).toMatchObject({ right: 1, wrong: 1, byRound: [100], base: 100, total: 100 });
    expect(recap.runaway).toBeNull();
  });

  it("never carries clue text or answers", () => {
    expect(JSON.stringify(recap)).not.toMatch(/secret/);
  });
});
