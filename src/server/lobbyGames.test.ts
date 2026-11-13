import { describe, expect, it } from "vitest";
import { CLOCK_TARGET_MS } from "@/shared/minigames";
import { LobbyGames, MINI_COUNTDOWN_MS, MINI_RESULT_MS, RACE_GOAL } from "./lobbyGames";

const START = 1000 + MINI_COUNTDOWN_MS;
/** A game of one kind with shuffling off and a fixed "random" value. */
function games(kind: LobbyGames["kind"], random = 0.5) {
  const g = new LobbyGames(() => random);
  g.configure({ kind, mix: false });
  return g;
}

describe("pig race", () => {
  it("counts down, races, crowns the first to the goal, then clears", () => {
    const r = games("race");
    expect(r.view(0).round).toBeNull();
    expect(r.tap("a", { n: 1 }, 1000).changed).toBe(true);
    expect(r.view(1000).round).toMatchObject({ kind: "race", phase: "countdown", startsAt: START, players: 1 });
    expect(r.tap("b", { n: 5 }, 1500).changed).toBe(true); // lines up; taps before the start do not count
    expect(r.tap("b", { n: 5 }, 1600).changed).toBe(false);
    let t = START;
    while (r.view(t).round!.phase === "running") {
      t += 250;
      r.tap("a", { n: 3 }, t);
      r.tap("b", { n: 2 }, t);
    }
    const done = r.view(t).round!;
    expect(done).toMatchObject({ phase: "done", winnerId: "a" });
    expect(done.lanes![0]).toMatchObject({ id: "a", taps: RACE_GOAL, wins: 1 });
    expect(r.tap("b", { n: 3 }, t + 100).changed).toBe(false); // the result stands
    expect(r.view(t + MINI_RESULT_MS).round).toBeNull();
  });

  it("does not count taps faster than a person can tap", () => {
    const r = games("race");
    r.tap("a", { n: 1 }, 1000);
    r.tap("a", { n: 10 }, START + 10); // claims 10 taps in 10 ms
    expect(r.view(START + 10).round!.lanes![0].taps).toBe(1);
    r.tap("a", { n: 10 }, START + 510);
    expect(r.view(START + 510).round!.lanes![0].taps).toBeLessThanOrEqual(9);
  });
});

describe("quick draw", () => {
  it("puts early tappers out and gives it to the first tap after GO", () => {
    const r = games("reflex", 0.5); // GO comes 4 s after the start
    r.tap("a", {}, 1000);
    r.tap("b", {}, 1100);
    expect(r.tick(START)).toBe(START + 4000); // the server wakes up exactly at GO
    expect(r.tap("a", {}, START + 500).data.out).toBe(true);
    expect(r.view(START + 600).round).toMatchObject({ go: false, out: 1 });
    expect(r.tap("a", {}, START + 4100).changed).toBe(false); // still out
    expect(r.view(START + 4000).round!.go).toBe(true);
    r.tap("b", {}, START + 4321);
    expect(r.view(START + 4321).round).toMatchObject({ phase: "done", winnerId: "b", winnerText: "321 ms" });
  });

  it("ends with no winner when everyone jumps the gun", () => {
    const r = games("reflex");
    r.tap("a", {}, 1000);
    r.tap("a", {}, START + 10);
    expect(r.view(START + 10).round).toMatchObject({ phase: "done", winnerId: null, winnerText: "Everyone jumped the gun" });
  });
});

describe("stop the clock", () => {
  it("gives it to whoever stops closest to the target, once everyone has stopped", () => {
    const r = games("clock");
    r.tap("a", {}, 1000);
    r.tap("b", {}, 1100);
    expect(r.tap("a", {}, START + 6100).data.ms).toBe(6100);
    expect(r.tap("a", {}, START + 6500).data.ms).toBe(6100); // one stop each
    expect(r.view(START + 6600).round).toMatchObject({ phase: "running", stopped: 1 });
    r.tap("b", {}, START + CLOCK_TARGET_MS + 300);
    const done = r.view(START + CLOCK_TARGET_MS + 300).round!;
    expect(done).toMatchObject({ phase: "done", winnerId: "b", winnerText: "7.30 s" });
    expect(done.results!.map((x) => x.id)).toEqual(["b", "a"]);
  });

  it("settles by itself when time runs out", () => {
    const r = games("clock");
    r.tap("a", {}, 1000);
    r.tap("b", {}, 1100);
    r.tap("a", {}, START + 5000);
    expect(r.view(START + 12_000).round).toMatchObject({ phase: "done", winnerId: "a" });
  });
});

describe("count the pigs", () => {
  it("keeps the number from phones until the end, and takes the first right answer", () => {
    const r = games("count", 0.5);
    r.tap("a", {}, 1000);
    r.tap("b", {}, 1100);
    expect(r.view(1200, true).round!.count).toBeNull(); // nobody sees it during the countdown
    const n = r.view(START + 100, true).round!.count!;
    expect(n).toBeGreaterThanOrEqual(5);
    expect(r.view(START + 100, false).round!.count).toBeNull();
    expect(r.tap("a", { pick: n + 1 }, START + 200).data.out).toBe(true);
    expect(r.tap("a", { pick: n }, START + 300).changed).toBe(false); // out stays out
    r.tap("b", { pick: n }, START + 400);
    expect(r.view(START + 400, false).round).toMatchObject({ phase: "done", winnerId: "b", count: n });
  });
});

describe("tug of war", () => {
  it("splits people into two sides and ends when one side pulls far enough", () => {
    const r = games("tug");
    expect(r.tap("a", {}, 1000).data.side).toBe(0);
    expect(r.tap("b", {}, 1100).data.side).toBe(1);
    expect(r.tap("c", {}, 1200).data.side).toBe(0);
    let t = START;
    while (r.view(t).round!.phase === "running" && t < START + 20_000) {
      t += 200;
      r.tap("a", { n: 3 }, t);
      r.tap("c", { n: 3 }, t);
      r.tap("b", { n: 1 }, t);
    }
    const done = r.view(t).round!;
    expect(done).toMatchObject({ phase: "done", winnerId: null, winnerText: "Pink side wins!", sides: [2, 1] });
    expect(done.pull).toBe(-1);
  });
});

describe("choosing games", () => {
  it("moves to a different game after each round when shuffling, and stays put when not", () => {
    const mixed = new LobbyGames(() => 0);
    expect(mixed.view(0)).toMatchObject({ kind: "race", mix: true, round: null });
    mixed.tap("a", {}, 1000);
    mixed.tap("a", { n: 1 }, START + 1); // any tap
    mixed.stop();
    mixed.restart(5000);
    expect(mixed.view(5000).round).toMatchObject({ phase: "countdown", kind: "race" });
    // let the race time out and its result clear
    const over = 5000 + MINI_COUNTDOWN_MS + 45_000;
    expect(mixed.view(over).round).toMatchObject({ phase: "done", winnerId: null });
    const after = mixed.view(over + MINI_RESULT_MS + 1);
    expect(after.round).toBeNull();
    expect(after.kind).not.toBe("race");

    const fixed = games("clock");
    fixed.tap("a", {}, 1000);
    fixed.tap("a", {}, START + 7000);
    expect(fixed.view(START + 7000 + MINI_RESULT_MS + 1)).toMatchObject({ kind: "clock", round: null });
  });

  it("switching game drops the round in progress; a player who leaves is forgotten", () => {
    const r = games("race");
    r.tap("a", {}, 1000);
    r.tap("b", {}, 1100);
    r.drop("b");
    expect(r.view(1200).round!.players).toBe(1);
    r.configure({ kind: "tug" });
    expect(r.view(1300)).toMatchObject({ kind: "tug", round: null });
  });
});

describe("everyone in the lobby plays", () => {
  it("puts the whole lobby in when a round starts, with nothing to tap", () => {
    const r = new LobbyGames(() => 0);
    r.configure({ kind: "tug", mix: false });
    r.roster = ["a", "b", "c"];
    r.tap("a", {}, 1000);
    expect(r.view(1100).round?.players).toBe(3);
    expect(r.view(1100, false, "b").round?.mySide).toBe(1);
  });

  it("adds someone who arrives during the countdown", () => {
    const r = new LobbyGames(() => 0);
    r.configure({ kind: "race", mix: false });
    r.roster = ["a"];
    r.restart(1000);
    r.roster = ["a", "b"];
    expect(r.view(1000 + 3000 + 10).round?.players).toBe(2);
  });
});
