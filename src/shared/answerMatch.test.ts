import { describe, expect, it } from "vitest";
import { answersMatch, normalizeAnswer } from "./answerMatch";
import { quickBoard } from "./quickBoard";
import { makeRound } from "./board";

describe("practice answer checking", () => {
  it("ignores question phrasing, articles, case and punctuation", () => {
    expect(normalizeAnswer("What is the Nile?")).toBe("nile");
    expect(answersMatch("what is the nile", "The Nile")).toBe(true);
    expect(answersMatch("Who was Marie Curie?", "Marie Curie")).toBe(true);
    expect(answersMatch("café", "Cafe")).toBe(true);
  });
  it("allows small typos and a surname for a full name", () => {
    expect(answersMatch("Missisippi", "Mississippi")).toBe(true);
    expect(answersMatch("Curie", "Marie Curie")).toBe(true);
  });
  it("accepts any listed alternative", () => {
    expect(answersMatch("Lutetia", "Paris (or Lutetia)")).toBe(true);
    expect(answersMatch("soccer", "Football / Soccer")).toBe(true);
  });
  it("rejects wrong answers, empty answers and near-miss numbers", () => {
    expect(answersMatch("London", "Paris")).toBe(false);
    expect(answersMatch("", "Paris")).toBe(false);
    expect(answersMatch("   ", "Paris")).toBe(false);
    expect(answersMatch("1941", "1914")).toBe(false);
    expect(answersMatch("cat", "bat")).toBe(false);
  });
});

describe("quick game", () => {
  it("keeps the first round's three lowest rows and the final", () => {
    const r1 = makeRound("single", 4, [100, 200, 300, 400, 500]);
    const r2 = makeRound("double", 4, [200, 400, 600, 800, 1000]);
    const final = { category: "F", text: "t", answer: "a" };
    const q = quickBoard({ rounds: [r1, r2], final });
    expect(q.rounds).toHaveLength(1);
    expect(q.rounds[0].values).toEqual([100, 200, 300]);
    expect(q.rounds[0].categories.every((c) => c.clues.length === 3)).toBe(true);
    expect(q.rounds[0].categories[0].clues[0].id).toBe(r1.categories[0].clues[0].id);
    expect(q.final).toEqual(final);
  });
  it("leaves a short board alone", () => {
    const r1 = makeRound("single", 2, [100, 200]);
    expect(quickBoard({ rounds: [r1] }).rounds[0].values).toEqual([100, 200]);
  });
});
