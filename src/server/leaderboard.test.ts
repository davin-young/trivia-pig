import { describe, expect, it } from "vitest";
import { buildLeaderboard, type FinishedGame } from "./leaderboard";

const g = (id: string, standings: [string, number][], mode: "solo" | "team" = "solo"): FinishedGame => ({ id, mode, standings: standings.map(([name, score]) => ({ name, score })) });

describe("season leaderboard", () => {
  it("aggregates by name, ignoring case and spacing", () => {
    const rows = buildLeaderboard([
      g("1", [["Maya", 1200], ["Jonas", 800], ["Priya", -200]]),
      g("2", [["maya ", 400], ["JONAS", 900]]),
      g("3", [["Priya", 1000], ["Maya", 1000], ["Jonas", 100]]),
    ]);
    const maya = rows.find((r) => r.key === "maya")!;
    expect(maya).toMatchObject({ games: 3, wins: 2, total: 2600, best: 1200, average: 867 });
    expect(maya.winRate).toBeCloseTo(2 / 3);
    expect(rows.find((r) => r.key === "priya")).toMatchObject({ games: 2, wins: 1, total: 800 });
    expect(rows.map((r) => r.key)).toEqual(["maya", "jonas", "priya"]);
  });

  it("ties share the win, and solo test games are ignored", () => {
    const rows = buildLeaderboard([g("1", [["A", 500], ["B", 500]]), g("2", [["A", 9999]])]);
    expect(rows.find((r) => r.key === "a")).toMatchObject({ games: 1, wins: 1, total: 500 });
    expect(rows.find((r) => r.key === "b")).toMatchObject({ games: 1, wins: 1 });
  });

  it("keeps team games separate from individual games", () => {
    const games = [g("1", [["Red", 300], ["Blue", 100]], "team"), g("2", [["Ann", 300], ["Bob", 100]])];
    expect(buildLeaderboard(games, "team").map((r) => r.name)).toEqual(["Red", "Blue"]);
    expect(buildLeaderboard(games, "solo").map((r) => r.name)).toEqual(["Ann", "Bob"]);
  });

  it("counts podium finishes for the top three only", () => {
    const rows = buildLeaderboard([g("1", [["A", 4], ["B", 3], ["C", 2], ["D", 1]])]);
    expect(rows.map((r) => [r.key, r.podiums])).toEqual([["a", 1], ["b", 1], ["c", 1], ["d", 0]]);
  });
});
