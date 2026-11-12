import { describe, expect, it } from "vitest";
import { makeRound } from "./board";
import { boardFromCsv, boardFromJson, parseDelimited, roundFromBulkPaste } from "./importBoard";

describe("parseDelimited", () => {
  it("handles quotes, escaped quotes, embedded commas and newlines", () => {
    const rows = parseDelimited('a,"b, c","say ""hi"""\n"multi\nline",x,y\r\n');
    expect(rows).toEqual([
      ["a", "b, c", 'say "hi"'],
      ["multi\nline", "x", "y"],
    ]);
  });
  it("detects tabs from spreadsheets", () => {
    expect(parseDelimited("a\tb, c\td")).toEqual([["a", "b, c", "d"]]);
  });
});

describe("bulk paste", () => {
  it("fills a round from category/value/clue/answer rows", () => {
    const base = makeRound("single", 6, [100, 200, 300, 400, 500]);
    const r = roundFromBulkPaste(
      "Category\tValue\tClue\tAnswer\nSci\t200\tH2O\tWater\nSci\t100\tO2\tOxygen\nArt\t$100\tMona Lisa\tDa Vinci",
      base,
    );
    expect(r.id).toBe(base.id);
    expect(r.categories.map((c) => c.name)).toEqual(["Sci", "Art"]);
    expect(r.values).toEqual([100, 200]);
    expect(r.categories[0].clues.map((q) => q.answer)).toEqual(["Oxygen", "Water"]);
    expect(r.categories[1].clues[0].text).toBe("Mona Lisa");
    expect(r.categories[1].clues[1].text).toBe("");
  });
  it("rejects empty input", () => {
    expect(() => roundFromBulkPaste("", makeRound("single", 1, [100]))).toThrow();
  });
});

describe("CSV import", () => {
  it("builds rounds, Daily Doubles and Final", () => {
    const b = boardFromCsv(
      [
        "round,category,value,clue,answer,daily_double",
        "1,Kava,100,Coffee family plant?,Kratom,",
        "1,Kava,200,Pepper family?,Kava,yes",
        "2,Kratom,400,Region?,Southeast Asia,",
        "final,Brains,,Calming system,GABA,",
      ].join("\n"),
    );
    expect(b.rounds).toHaveLength(2);
    expect(b.rounds[0].kind).toBe("single");
    expect(b.rounds[1].kind).toBe("double");
    expect(b.rounds[0].categories[0].clues[1].dailyDouble).toBe(true);
    expect(b.final?.answer).toBe("GABA");
  });

  it("stays small and fast when every row is a new category and value", () => {
    const rows = Array.from({ length: 50_000 }, (_, i) => `1,Cat ${i},${i + 1},Clue ${i},Answer ${i},`);
    const started = Date.now();
    const b = boardFromCsv(["round,category,value,clue,answer,daily_double", ...rows].join("\n"));
    expect(Date.now() - started).toBeLessThan(2000);
    expect(b.rounds[0].categories.length).toBeLessThanOrEqual(12);
    expect(b.rounds[0].values.length).toBeLessThanOrEqual(12);
  });
});

describe("JSON import", () => {
  it("accepts wrapped export and bare content", () => {
    const content = { rounds: [makeRound("single", 1, [100])], final: null };
    expect(boardFromJson({ format: "jeppidy-board", title: "T", content }).title).toBe("T");
    expect(boardFromJson(content).content.rounds).toHaveLength(1);
    expect(() => boardFromJson({ nope: true })).toThrow();
  });
});
