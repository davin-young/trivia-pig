import { describe, expect, it } from "vitest";
import { boardContentSchema, makeRound, type BoardContent } from "./board";
import { checkBoard } from "./boardCheck";
import { DEFAULT_THEME, THEME_PRESETS, contrast, safeTheme, themeVars } from "./theme";

function full(): BoardContent {
  const r = makeRound("single", 2, [100, 200]);
  r.categories.forEach((c, ci) => ((c.name = `Cat ${ci}`), c.clues.forEach((q, qi) => ((q.text = `clue ${ci}${qi}`), (q.answer = `ans ${ci}${qi}`)))));
  return { rounds: [r], final: { category: "F", text: "final", answer: "a" } };
}

describe("checkBoard", () => {
  it("passes a complete board", () => {
    expect(checkBoard(full())).toEqual([]);
  });

  it("reports an empty board as unplayable", () => {
    const b: BoardContent = { rounds: [makeRound("single", 2, [100, 200])], final: null };
    expect(checkBoard(b)[0]).toMatchObject({ level: "error" });
  });

  it("points at blank cells, missing answers, unnamed categories and a half-filled final", () => {
    const b = full();
    b.rounds[0].categories[0].clues[1].text = "";
    b.rounds[0].categories[0].clues[1].answer = "";
    b.rounds[0].categories[1].clues[0].answer = "";
    b.rounds[0].categories[1].name = " ";
    b.final!.answer = "";
    const issues = checkBoard(b);
    expect(issues.every((i) => i.level === "warn")).toBe(true);
    expect(issues.map((i) => i.at)).toEqual([
      { tab: 0, c: 0, r: 1, field: "clue" },
      { tab: 0, c: 1, field: "name" },
      { tab: 0, c: 1, r: 0, field: "answer" },
      { tab: "final" },
    ]);
  });

  it("counts a picture-only clue as filled and flags a Daily Double on a blank cell", () => {
    const b = full();
    const q = b.rounds[0].categories[0].clues[0];
    q.text = "";
    q.media = { type: "image", url: "/media/x.png" };
    expect(checkBoard(b)).toEqual([]);
    const blank = b.rounds[0].categories[1].clues[1];
    blank.text = "";
    blank.answer = "";
    blank.dailyDouble = true;
    expect(checkBoard(b).some((i) => i.message.includes("Daily Double"))).toBe(true);
  });
});

describe("board themes", () => {
  it("is optional and survives the board schema", () => {
    expect(boardContentSchema.parse(full()).theme ?? null).toBeNull();
    const themed = boardContentSchema.parse({ ...full(), theme: { board: "#0f5132", accent: "#ffd166", font: "storybook" } });
    expect(themed.theme?.font).toBe("storybook");
    expect(boardContentSchema.safeParse({ ...full(), theme: { board: "red; background:url(x)", accent: "#ffffff", font: "classic" } }).success).toBe(false);
  });

  it("keeps every preset readable as-is", () => {
    for (const p of THEME_PRESETS) expect(safeTheme(p.theme), p.id).toEqual(p.theme);
  });

  it("nudges unreadable picks: white text and the accent must stay legible on the board", () => {
    const t = safeTheme({ board: "#ffff66", accent: "#222222", font: "modern" });
    expect(contrast(t.board, "#ffffff")).toBeGreaterThanOrEqual(7);
    expect(contrast(t.accent, t.board)).toBeGreaterThanOrEqual(4.5);
    expect(t.font).toBe("modern");
  });

  it("falls back to the default look for bad input and emits CSS variables", () => {
    expect(safeTheme({ board: "nope", accent: "#ffffff", font: "classic" })).toEqual(DEFAULT_THEME);
    expect(themeVars(null)).toEqual({});
    const v = themeVars(THEME_PRESETS[2].theme);
    expect(v["--board"]).toBe("#0f5132");
    expect(Object.keys(v).sort()).toEqual(["--board", "--board-deep", "--board-edge", "--f-clue", "--f-display", "--gold"]);
  });
});
