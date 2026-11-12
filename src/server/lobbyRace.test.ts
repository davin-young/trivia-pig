import { describe, expect, it } from "vitest";
import { LobbyRace, RACE_COUNTDOWN_MS, RACE_GOAL, RACE_MAX_MS, RACE_RESULT_MS } from "./lobbyRace";

describe("LobbyRace", () => {
  it("counts down, races, crowns the first to the goal, then clears", () => {
    const r = new LobbyRace();
    expect(r.view(0)).toBeNull();
    expect(r.tap("a", 1, 1000)).toBe(true);
    expect(r.view(1000)).toMatchObject({ phase: "countdown", startsAt: 1000 + RACE_COUNTDOWN_MS, racers: 1 });
    expect(r.tap("b", 5, 1500)).toBe(true); // lines up; taps before the start do not count
    expect(r.tap("b", 5, 1600)).toBe(false);
    expect(r.view(1600)!.lanes.every((l) => l.taps === 0)).toBe(true);

    let t = 1000 + RACE_COUNTDOWN_MS;
    expect(r.view(t)!.phase).toBe("running");
    while (r.view(t)!.phase === "running") {
      t += 250;
      r.tap("a", 3, t);
      r.tap("b", 2, t);
    }
    const done = r.view(t)!;
    expect(done).toMatchObject({ phase: "done", winnerId: "a" });
    expect(done.lanes[0]).toMatchObject({ id: "a", taps: RACE_GOAL, wins: 1 });
    expect(r.tap("b", 3, t + 100)).toBe(false); // the result stands
    expect(r.view(t + RACE_RESULT_MS)).toBeNull();
    expect(r.tap("b", 1, t + RACE_RESULT_MS + 10)).toBe(true); // a new race
    expect(r.view(t + RACE_RESULT_MS + 10)).toMatchObject({ phase: "countdown", winnerId: null });
  });

  it("does not count taps faster than a person can tap", () => {
    const r = new LobbyRace();
    r.tap("a", 1, 0);
    const start = RACE_COUNTDOWN_MS;
    r.tap("a", 10, start + 10); // claims 10 taps in 10 ms
    expect(r.view(start + 10)!.lanes[0].taps).toBe(1);
    r.tap("a", 10, start + 510); // half a second later: about 7 at most
    expect(r.view(start + 510)!.lanes[0].taps).toBeLessThanOrEqual(9);
    expect(r.tap("a", 0, start + 900)).toBe(false);
  });

  it("gives up on a race nobody finishes, and forgets a player who leaves", () => {
    const r = new LobbyRace();
    r.tap("a", 1, 0);
    r.tap("b", 1, 10);
    r.drop("b");
    expect(r.view(20)!.racers).toBe(1);
    expect(r.view(RACE_COUNTDOWN_MS + RACE_MAX_MS)).toBeNull();
  });
});
