import { describe, expect, it } from "vitest";
import { BUZZ_WINDOW_MS, MAX_COMPENSATION_MS, RttTracker, orderBuzzes, pressedAt } from "./buzzQueue";

describe("latency-fair buzz ordering", () => {
  it("a slow connection that pressed first beats a fast one that arrived first", () => {
    // Fast phone: pressed at 1000, 10 ms one-way → arrives 1010.
    // Slow phone: pressed at 980, 60 ms one-way → arrives 1040.
    const ordered = orderBuzzes([
      { playerId: "fast", arrivedAt: 1010, rttMs: 20, order: 0, payload: null },
      { playerId: "slow", arrivedAt: 1040, rttMs: 120, order: 1, payload: null },
    ]);
    expect(ordered.map((b) => b.playerId)).toEqual(["slow", "fast"]);
    expect(ordered[0].at).toBe(980);
  });

  it("caps compensation so a huge (or faked) latency can't win everything", () => {
    expect(pressedAt(10_000, 60_000)).toBe(10_000 - MAX_COMPENSATION_MS);
    const ordered = orderBuzzes([
      { playerId: "honest", arrivedAt: 1000, rttMs: 20, order: 0, payload: null },
      { playerId: "laggy", arrivedAt: 1170, rttMs: 9999, order: 1, payload: null },
    ]);
    expect(ordered[0].playerId).toBe("honest");
  });

  it("never dates a press before the floor (e.g. when buzzers opened)", () => {
    expect(pressedAt(1005, 200, 1000)).toBe(1000);
  });

  it("breaks exact ties by arrival order and treats unknown RTT as zero", () => {
    const ordered = orderBuzzes([
      { playerId: "b", arrivedAt: 500, rttMs: 0, order: 1, payload: null },
      { playerId: "a", arrivedAt: 500, rttMs: 0, order: 0, payload: null },
    ]);
    expect(ordered.map((b) => b.playerId)).toEqual(["a", "b"]);
    expect(pressedAt(500, -5)).toBe(500);
  });

  it("RTT tracker uses the smallest recent sample and ignores junk", () => {
    const t = new RttTracker(5);
    expect(t.value).toBe(0);
    [40, 42, 900, 41, 39].forEach((n) => t.add(n));
    expect(t.value).toBe(39);
    t.add(NaN);
    t.add(-1);
    expect(t.value).toBe(39);
    // One honest probe is enough to undo a run of delayed replies.
    [900, 900, 900, 900].forEach((n) => t.add(n));
    expect(t.value).toBe(39);
  });

  it("an inflated latency arriving at the end of the window cannot beat the buzz that opened it", () => {
    const ordered = orderBuzzes([
      { playerId: "honest", arrivedAt: 1000, rttMs: 0, order: 0, payload: null },
      { playerId: "cheat", arrivedAt: 1000 + BUZZ_WINDOW_MS, rttMs: 5000, order: 1, payload: null },
    ]);
    expect(ordered.map((b) => b.playerId)).toEqual(["honest", "cheat"]);
  });
});
