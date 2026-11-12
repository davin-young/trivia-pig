import { describe, expect, it } from "vitest";
import { gameIdFromWatchToken, isWatchToken, watchTokenFor } from "./watchToken";

describe("watch token", () => {
  const id = "cmh2x9k3a0001abcd1234wxyz";

  it("round-trips a game id, in any letter case", () => {
    const token = watchTokenFor(id, "secret");
    expect(isWatchToken(token)).toBe(true);
    expect(token).toMatch(/^[a-z0-9]+$/);
    expect(gameIdFromWatchToken(token, "secret")).toBe(id);
    expect(gameIdFromWatchToken(token.toUpperCase(), "secret")).toBe(id);
  });

  it("refuses a token that was changed, cut short, or signed with another secret", () => {
    const token = watchTokenFor(id, "secret");
    expect(gameIdFromWatchToken(`x${token.slice(1)}`, "secret")).toBeNull();
    expect(gameIdFromWatchToken(`${token.slice(0, -1)}0`, "secret") === id && !token.endsWith("0")).toBe(false);
    expect(gameIdFromWatchToken(token.slice(0, 12), "secret")).toBeNull();
    expect(gameIdFromWatchToken(token, "other")).toBeNull();
    expect(gameIdFromWatchToken(id, "secret")).toBeNull();
  });

  it("never mistakes a room code for a token", () => {
    expect(isWatchToken("ABCDE")).toBe(false);
    expect(isWatchToken("ABCDEF")).toBe(false);
  });
});
