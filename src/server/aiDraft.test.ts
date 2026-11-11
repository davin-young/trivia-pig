import { describe, expect, it } from "vitest";
import { boardContentSchema } from "@/shared/board";
import { draftPrompt, draftRequestSchema, draftToBoard, type Draft } from "./aiDraft";

const cat = (name: string, n: number) => ({ name, clues: Array.from({ length: n }, (_, i) => ({ clue: `${name} clue ${i}`, response: `What is ${name} ${i}?` })) });

describe("AI board drafts", () => {
  it("turns a draft into valid board content with the right values", () => {
    const req = draftRequestSchema.parse({ topic: "Space", categories: 3, cluesPerCategory: 4 });
    const draft: Draft = {
      title: "  To the Moon  ",
      rounds: [{ categories: [cat("Planets", 4), cat("Rockets", 4), cat("Stars", 4)] }, { categories: [cat("Moons", 4), cat("Probes", 4), cat("People", 4)] }],
      final: { category: "Firsts", clue: "First person in space", response: "Who is Yuri Gagarin?" },
    };
    const { title, content } = draftToBoard(draft, req);
    expect(title).toBe("To the Moon");
    expect(() => boardContentSchema.parse(content)).not.toThrow();
    expect(content.rounds).toHaveLength(2);
    expect(content.rounds[0].values).toHaveLength(4);
    expect(content.rounds[1].kind).toBe("double");
    expect(content.rounds[1].values[0]).toBe(content.rounds[0].values[0] * 2);
    expect(content.rounds[0].categories[1].name).toBe("Rockets");
    expect(content.rounds[0].categories[1].clues[3]).toMatchObject({ text: "Rockets clue 3", answer: "What is Rockets 3?" });
    expect(content.final).toMatchObject({ category: "Firsts", answer: "Who is Yuri Gagarin?" });
  });

  it("tolerates extra or missing categories and clues, and can skip Final", () => {
    const req = draftRequestSchema.parse({ topic: "Dogs", rounds: 1, categories: 3, cluesPerCategory: 3, final: false });
    const draft: Draft = { title: "", rounds: [{ categories: [cat("A", 5), cat("B", 2), cat("C", 3), cat("D", 3)] }, { categories: [cat("Z", 3)] }], final: { category: "x", clue: "y", response: "z" } };
    const { title, content } = draftToBoard(draft, req);
    expect(title).toBe("Dogs");
    expect(content.rounds).toHaveLength(1);
    expect(content.rounds[0].categories.map((c) => c.name)).toEqual(["A", "B", "C"]);
    expect(content.rounds[0].categories[0].clues).toHaveLength(3);
    expect(content.rounds[0].categories[1].clues[2].text).toBe("");
    expect(content.final).toBeNull();
    expect(() => boardContentSchema.parse(content)).not.toThrow();
  });

  it("describes the request to the model", () => {
    const p = draftPrompt(draftRequestSchema.parse({ topic: "90s movies", audience: "coworkers", difficulty: "easy", rounds: 1, final: false }));
    expect(p).toContain("Topic: 90s movies");
    expect(p).toContain("coworkers");
    expect(p).toContain("Write 1 round,");
    expect(p).toContain("set final to null");
  });
});
