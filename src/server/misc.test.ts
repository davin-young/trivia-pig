import { describe, expect, it } from "vitest";
import { containsProfanity, cleanName } from "./profanity";
import { TokenBucket } from "./rateLimit";
import { clientEvents } from "@/shared/protocol";
import { LIMITS } from "@/shared/strokes";

describe("profanity filter", () => {
  it("flags obvious words and leetspeak but not innocent names", () => {
    expect(containsProfanity("sh1t head")).toBe(true);
    expect(containsProfanity("FUCK")).toBe(true);
    expect(containsProfanity("Scunthorpe")).toBe(false);
    expect(containsProfanity("Dickens")).toBe(false);
    expect(containsProfanity("Ann")).toBe(false);
  });
  it("cleans control chars and length", () => {
    expect(cleanName("  a\u0000b   c  ")).toBe("ab c");
    expect(cleanName("x".repeat(40))).toHaveLength(24);
  });
});

describe("rate limiting", () => {
  it("token bucket bursts then refills", () => {
    const b = new TokenBucket(3, 1, 0);
    expect([b.take(1, 0), b.take(1, 0), b.take(1, 0), b.take(1, 0)]).toEqual([true, true, true, false]);
    expect(b.take(1, 1000)).toBe(true);
  });
  it("is not drained when the clock steps backwards", () => {
    const b = new TokenBucket(3, 1, 400_000);
    expect(b.take(1, 400_000)).toBe(true);
    expect(b.take(1, 20_000)).toBe(true); // clock jumped back 380 s
    expect(b.take(1, 20_000)).toBe(true);
    expect(b.take(1, 20_000)).toBe(false);
    expect(b.take(1, 21_000)).toBe(true);
  });

});

describe("message size limits", () => {
  it("rejects oversized drawings", () => {
    const stroke = { c: "#ffffff", s: 5, p: Array.from({ length: LIMITS.maxPointsPerStroke + 1 }, () => [1, 1, 0.5]) };
    const r = clientEvents["player:signature"].safeParse({ signature: { v: 1, w: 600, h: 240, strokes: [stroke] } });
    expect(r.success).toBe(false);
    const many = Array.from({ length: 25 }, () => ({ c: "#ffffff", s: 5, p: Array.from({ length: 1400 }, () => [1, 1, 0.5]) }));
    expect(clientEvents["player:signature"].safeParse({ signature: { v: 1, w: 600, h: 240, strokes: many } }).success).toBe(false);
  });
  it("rejects bad colours and unknown host actions", () => {
    const bad = { v: 1, w: 600, h: 240, strokes: [{ c: "red;</svg>", s: 5, p: [[1, 1, 0.5]] }] };
    expect(clientEvents["player:signature"].safeParse({ signature: bad }).success).toBe(false);
    expect(clientEvents["host:action"].safeParse({ action: { type: "admin/deleteEverything" } }).success).toBe(false);
  });
});
