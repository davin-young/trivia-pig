import { describe, expect, it } from "vitest";
import { boardFromJson } from "./importBoard";
import { EXAMPLE_BOARD, aiPrompt, boardJsonSchema, contentToSimple, describeBoardError, isSimpleBoard, simpleBoardSchema, simpleToContent } from "./simpleBoard";

describe("published board format", () => {
  it("turns the example into editor content with ids, kinds and default values", () => {
    const content = simpleToContent({ ...EXAMPLE_BOARD, rounds: [{ categories: EXAMPLE_BOARD.rounds[0].categories }, { categories: EXAMPLE_BOARD.rounds[0].categories }] });
    expect(content.rounds.map((r) => [r.kind, r.name, r.values])).toEqual([
      ["single", "Round 1", [100, 200]],
      ["double", "Round 2", [200, 400]],
    ]);
    const clue = content.rounds[0].categories[1].clues[1];
    expect(clue).toMatchObject({ text: "This moon of Saturn has a thick orange atmosphere.", answer: "Titan", dailyDouble: true });
    const ids = content.rounds.flatMap((r) => [r.id, ...r.categories.flatMap((c) => [c.id, ...c.clues.map((q) => q.id)])]);
    expect(new Set(ids).size).toBe(ids.length);
    expect(content.final).toMatchObject({ category: "Explorers", answer: "Neil Armstrong" });
  });

  it("pads short categories so every column has a clue per value", () => {
    const content = simpleToContent({
      title: "Uneven",
      rounds: [{ categories: [{ name: "A", clues: [{ question: "q1", answer: "a1" }] }, { name: "B", clues: [{ question: "q1", answer: "a1" }, { question: "q2", answer: "a2" }, { question: "q3", answer: "a3" }] }] }],
    });
    expect(content.rounds[0].values).toEqual([100, 200, 300]);
    expect(content.rounds[0].categories.map((c) => c.clues.length)).toEqual([3, 3]);
  });

  it("round-trips through the simple format", () => {
    const content = simpleToContent(EXAMPLE_BOARD);
    const back = contentToSimple(content, { title: EXAMPLE_BOARD.title, description: EXAMPLE_BOARD.description, tags: EXAMPLE_BOARD.tags });
    expect(back).toEqual(EXAMPLE_BOARD);
  });

  it("an update keeps ids, pictures and the look for cells that stayed put", () => {
    const before = simpleToContent(EXAMPLE_BOARD);
    before.rounds[0].categories[0].clues[0].media = { type: "image", url: "/media/x.png" };
    const edited = structuredClone(EXAMPLE_BOARD);
    edited.rounds[0].categories[0].clues[0].question = "Our home planet.";
    const after = simpleToContent(edited, before);
    expect(after.rounds[0].categories[0].clues[0]).toMatchObject({ id: before.rounds[0].categories[0].clues[0].id, text: "Our home planet.", media: { type: "image", url: "/media/x.png" } });
    expect(after.rounds[0].id).toBe(before.rounds[0].id);
  });

  it("the Import button accepts it, and still accepts the editor's own export", () => {
    expect(isSimpleBoard(EXAMPLE_BOARD)).toBe(true);
    const fromSimple = boardFromJson(EXAMPLE_BOARD);
    expect(fromSimple.title).toBe("Space basics");
    expect(fromSimple.content.rounds[0].categories).toHaveLength(2);
    const exported = { format: "jeppidy-board", version: 1, title: "X", content: fromSimple.content };
    expect(isSimpleBoard(exported.content)).toBe(false);
    expect(boardFromJson(exported).content.rounds[0].categories[0].clues[0].text).toBe("The planet we live on.");
  });

  it("rejects bad boards with a reason that says where", () => {
    const bad = simpleBoardSchema.safeParse({ title: "", rounds: [{ categories: [{ name: "A", clues: [] }] }] });
    expect(bad.success).toBe(false);
    const why = describeBoardError(bad.error);
    expect(why).toContain("title");
    expect(why).toContain("rounds.0.categories.0.clues");
    expect(simpleBoardSchema.safeParse({ title: "x", rounds: [] }).success).toBe(false);
  });

  it("publishes a JSON Schema and a prompt that carries the example", () => {
    const schema = boardJsonSchema() as { type: string; required: string[]; properties: Record<string, unknown> };
    expect(schema.type).toBe("object");
    expect(schema.required).toEqual(expect.arrayContaining(["title", "rounds"]));
    expect(Object.keys(schema.properties)).toEqual(expect.arrayContaining(["title", "rounds", "final"]));
    const prompt = aiPrompt("dinosaurs");
    expect(prompt).toContain("dinosaurs");
    expect(simpleBoardSchema.safeParse(JSON.parse(prompt.slice(prompt.indexOf("{"), prompt.lastIndexOf("}") + 1))).success).toBe(true);
  });
});
