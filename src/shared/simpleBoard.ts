import { z } from "zod";
import { DOUBLE_VALUES, SINGLE_VALUES, boardContentSchema, newId, normalizeRound, type BoardContent } from "./board";

/**
 * The published board format: the smallest shape that describes a whole board, with no ids
 * or editor details. It is what an AI assistant (or a person) writes, what the Import button
 * accepts, and what the board API and the MCP server speak. `simpleToContent` turns it into
 * the editor's own format.
 */
export const simpleClueSchema = z.object({
  question: z.string().max(2000).describe("The clue shown on the big screen and read aloud. Leave empty for a blank cell."),
  answer: z.string().max(1000).describe("The correct response. Only the host sees it until it is revealed."),
  dailyDouble: z.boolean().optional().describe("Optional. True makes this a wager clue for one player. Use at most one or two per round."),
});

export const simpleCategorySchema = z.object({
  name: z.string().max(200).describe("Category title shown at the top of the column. Keep it short."),
  clues: z.array(simpleClueSchema).min(1).max(12).describe("Clues from easiest (lowest value) to hardest. Every category in a round should have the same number."),
});

export const simpleRoundSchema = z.object({
  name: z.string().max(80).optional().describe('Optional round name, for example "Round 1".'),
  values: z
    .array(z.number().int().min(0).max(100000))
    .min(1)
    .max(12)
    .optional()
    .describe("Optional point values, one per clue row, lowest first. Defaults to 100-500 for the first round and 200-1000 for later rounds."),
  categories: z.array(simpleCategorySchema).min(1).max(12).describe("The columns of the board. Six categories of five clues is the usual size."),
});

export const simpleFinalSchema = z.object({
  category: z.string().max(200).describe("Category announced before players wager."),
  question: z.string().max(2000),
  answer: z.string().max(1000),
});

export const simpleBoardSchema = z
  .object({
    title: z.string().trim().min(1).max(120).describe("Name of the board."),
    description: z.string().max(1000).optional().describe("Optional one-line description."),
    tags: z.array(z.string().max(30)).max(20).optional().describe("Optional lowercase tags for finding the board later."),
    rounds: z.array(simpleRoundSchema).min(1).max(4).describe("One to four rounds. Most games use one or two."),
    final: simpleFinalSchema.nullish().describe("Optional final clue that everyone answers in writing after wagering."),
  })
  .describe("A Trivia Pig board. Text only: pictures, sound and video are added in the editor.");
export type SimpleBoard = z.infer<typeof simpleBoardSchema>;

/** True for anything that looks like the simple format rather than the editor's (which has ids). */
export function isSimpleBoard(raw: unknown): boolean {
  const rounds = (raw as { rounds?: unknown } | null)?.rounds;
  return Array.isArray(rounds) && rounds.length > 0 && rounds.every((r) => !!r && typeof r === "object" && !("id" in r) && !("kind" in r));
}

function defaultValues(roundIndex: number, rows: number): number[] {
  const base = roundIndex === 0 ? SINGLE_VALUES : DOUBLE_VALUES;
  const step = base[0];
  return Array.from({ length: rows }, (_, i) => base[i] ?? step * (i + 1));
}

/**
 * Build editor content from the simple format. When `existing` is given (an update), ids,
 * pictures and the board's look are kept for every cell that is still in the same place.
 */
export function simpleToContent(simple: SimpleBoard, existing?: BoardContent | null): BoardContent {
  const rounds = simple.rounds.map((r, ri) => {
    const old = existing?.rounds[ri];
    const rows = Math.max(...r.categories.map((c) => c.clues.length));
    return normalizeRound({
      id: old?.id ?? newId("r"),
      kind: ri === 0 ? ("single" as const) : ("double" as const),
      name: r.name?.trim() || `Round ${ri + 1}`,
      values: r.values ?? defaultValues(ri, rows),
      categories: r.categories.map((c, ci) => {
        const oldCat = old?.categories[ci];
        return {
          id: oldCat?.id ?? newId("k"),
          name: c.name,
          clues: c.clues.map((q, qi) => {
            const oldClue = oldCat?.clues[qi];
            return {
              id: oldClue?.id ?? newId("q"),
              text: q.question,
              answer: q.answer,
              media: oldClue?.media ?? null,
              answerMedia: oldClue?.answerMedia ?? null,
              dailyDouble: !!q.dailyDouble,
            };
          }),
        };
      }),
    });
  });
  const final = simple.final
    ? { category: simple.final.category, text: simple.final.question, answer: simple.final.answer, media: existing?.final?.media ?? null, answerMedia: existing?.final?.answerMedia ?? null }
    : null;
  return boardContentSchema.parse({ rounds, final, theme: existing?.theme ?? null });
}

export function contentToSimple(content: BoardContent, meta: { title: string; description?: string; tags?: string[] }): SimpleBoard {
  return {
    title: meta.title,
    description: meta.description || undefined,
    tags: meta.tags?.length ? meta.tags : undefined,
    rounds: content.rounds.map((r) => ({
      name: r.name,
      values: r.values,
      categories: r.categories.map((c) => ({
        name: c.name,
        clues: c.clues.map((q) => ({ question: q.text, answer: q.answer, ...(q.dailyDouble ? { dailyDouble: true } : {}) })),
      })),
    })),
    final: content.final ? { category: content.final.category, question: content.final.text, answer: content.final.answer } : null,
  };
}

/** A short, readable reason a board was rejected: good enough for a person or a model to fix it. */
export function describeBoardError(e: unknown): string {
  if (e instanceof z.ZodError) {
    return e.issues
      .slice(0, 8)
      .map((i) => `${i.path.join(".") || "board"}: ${i.message}`)
      .join("; ");
  }
  return e instanceof Error ? e.message.slice(0, 300) : "Invalid board";
}

/** JSON Schema for the simple format, served at /api/schema/board.json. */
export function boardJsonSchema(): unknown {
  return z.toJSONSchema(simpleBoardSchema);
}

/** A small complete example, used in the guide and in the MCP tool descriptions. */
export const EXAMPLE_BOARD: SimpleBoard = {
  title: "Space basics",
  description: "An easy warm-up about the solar system.",
  tags: ["science", "space"],
  rounds: [
    {
      name: "Round 1",
      values: [100, 200],
      categories: [
        {
          name: "Planets",
          clues: [
            { question: "The planet we live on.", answer: "Earth" },
            { question: "The largest planet in the solar system.", answer: "Jupiter" },
          ],
        },
        {
          name: "Moons",
          clues: [
            { question: "The number of moons Earth has.", answer: "One" },
            { question: "This moon of Saturn has a thick orange atmosphere.", answer: "Titan", dailyDouble: true },
          ],
        },
      ],
    },
  ],
  final: { category: "Explorers", question: "The first person to walk on the Moon.", answer: "Neil Armstrong" },
};

/** The copy-paste prompt on the guide page. One source, so the page and the MCP server agree. */
export function aiPrompt(topic = "[YOUR TOPIC]"): string {
  return [
    `Write a trivia board about ${topic} for a quiz game played on a TV, where players buzz in from their phones.`,
    "",
    "Reply with one JSON object only (no commentary, no code fence) in exactly this shape:",
    "",
    JSON.stringify(EXAMPLE_BOARD, null, 2),
    "",
    "Rules:",
    "- 1 or 2 rounds, each with 6 categories of 5 clues. Leave out \"values\" to get the usual point values.",
    "- Order each category's clues from easiest to hardest.",
    "- A clue is one short sentence that can be read aloud. Its answer is a few words.",
    "- Every answer must be a fact you are sure of, with one clearly correct response.",
    "- Category names are short (under 25 characters) and no clue gives away another clue's answer.",
    "- Mark one clue in each round with \"dailyDouble\": true, and end with a \"final\" clue.",
    "- Text only: no pictures, links or markdown.",
  ].join("\n");
}
