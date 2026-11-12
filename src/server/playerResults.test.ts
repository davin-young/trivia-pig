import { describe, expect, it } from "vitest";
import { GameHistory } from "@/engine/history";
import { DEFAULT_SETTINGS, type GameAction, type Settings } from "@/engine/types";
import { makeRound, type BoardContent } from "@/shared/board";
import { seatResults, totals } from "./playerResults";

function play(settings: Partial<Settings> = {}) {
  const r1 = makeRound("single", 2, [100, 200]);
  r1.categories.forEach((c, ci) =>
    c.clues.forEach((q, qi) => {
      q.text = `clue ${ci}-${qi}`;
      q.answer = `answer ${ci}-${qi}`;
    }),
  );
  const b: BoardContent = { rounds: [r1], final: null };
  const g = new GameHistory({ board: b, settings: { ...DEFAULT_SETTINGS, ...settings } });
  let t = 1000;
  const act = (action: GameAction, by = "host:u1") => g.dispatch(action, by, (t += 10));
  const clue = (cat: number, row: number) => b.rounds[0].categories[cat].clues[row].id;
  return { g, act, clue };
}

describe("seatResults", () => {
  it("gives each player their score, place and answer counts; skips audience, bots and removed players", () => {
    const { g, act, clue } = play();
    for (const [id, name] of [["a", "Ann"], ["b", "Bob"], ["c", "Cy"]]) act({ type: "player/join", playerId: id, name, signature: null }, `player:${id}`);
    act({ type: "player/join", playerId: "w", name: "Watcher", signature: null, audience: true }, "player:w");
    act({ type: "game/start", dailyDoubles: {} });
    expect(seatResults(g.state)).toEqual([]); // not finished yet

    act({ type: "clue/open", clueId: clue(0, 0) });
    act({ type: "buzzers/unlock" });
    act({ type: "player/buzz", playerId: "b" }, "player:b");
    act({ type: "clue/judge", correct: false });
    act({ type: "player/buzz", playerId: "a" }, "player:a");
    act({ type: "clue/judge", correct: true });
    act({ type: "clue/close" });
    act({ type: "player/kick", playerId: "c" });
    act({ type: "game/end" });
    expect(g.state.phase).toBe("finished");

    const res = seatResults(g.state);
    expect(res.map((r) => r.playerId)).toEqual(["a", "b"]);
    expect(res[0]).toMatchObject({ score: 100, place: 1, right: 1, wrong: 0, team: false });
    expect(res[1]).toMatchObject({ score: -100, right: 0, wrong: 1 });
    expect(res[1].place).toBeGreaterThan(1);
  });
});

describe("totals", () => {
  it("adds up games and leaves team answer counts out", () => {
    const t = totals([
      { score: 500, place: 1, right: 5, wrong: 1, team: false },
      { score: -200, place: 3, right: 1, wrong: 3, team: false },
      { score: 900, place: 1, right: 9, wrong: 2, team: true },
    ]);
    expect(t).toEqual({ games: 3, wins: 2, best: 900, points: 1200, right: 6, wrong: 4 });
    expect(totals([])).toMatchObject({ games: 0, best: null });
  });
});
