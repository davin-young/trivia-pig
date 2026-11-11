import { z } from "zod";

export const mediaSchema = z.object({
  type: z.enum(["image", "video", "audio", "youtube"]),
  url: z.string().max(2048),
});
export type Media = z.infer<typeof mediaSchema>;

export const clueSchema = z.object({
  id: z.string().min(1).max(40),
  text: z.string().max(2000).default(""),
  answer: z.string().max(1000).default(""),
  media: mediaSchema.nullish(),
  answerMedia: mediaSchema.nullish(),
  dailyDouble: z.boolean().default(false),
});
export type Clue = z.infer<typeof clueSchema>;

export const categorySchema = z.object({
  id: z.string().min(1).max(40),
  name: z.string().max(200).default(""),
  clues: z.array(clueSchema).max(12),
});
export type Category = z.infer<typeof categorySchema>;

export const roundSchema = z.object({
  id: z.string().min(1).max(40),
  kind: z.enum(["single", "double"]),
  name: z.string().max(80),
  values: z.array(z.number().int().min(0).max(100000)).min(1).max(12),
  categories: z.array(categorySchema).min(1).max(12),
});
export type Round = z.infer<typeof roundSchema>;

export const finalSchema = z.object({
  category: z.string().max(200).default(""),
  text: z.string().max(2000).default(""),
  answer: z.string().max(1000).default(""),
  media: mediaSchema.nullish(),
  answerMedia: mediaSchema.nullish(),
});
export type FinalClue = z.infer<typeof finalSchema>;

export const boardContentSchema = z.object({
  rounds: z.array(roundSchema).max(4),
  final: finalSchema.nullish(),
});
export type BoardContent = z.infer<typeof boardContentSchema>;

let idCounter = 0;
export function newId(prefix = "c"): string {
  idCounter = (idCounter + 1) % 1_000_000;
  return `${prefix}${Date.now().toString(36)}${Math.random().toString(36).slice(2, 7)}${idCounter.toString(36)}`;
}

export function emptyClue(): Clue {
  return { id: newId("q"), text: "", answer: "", media: null, answerMedia: null, dailyDouble: false };
}

export function makeRound(kind: "single" | "double", cols: number, values: number[], name?: string): Round {
  return {
    id: newId("r"),
    kind,
    name: name ?? (kind === "single" ? "Jeopardy!" : "Double Jeopardy!"),
    values,
    categories: Array.from({ length: cols }, () => ({
      id: newId("k"),
      name: "",
      clues: values.map(() => emptyClue()),
    })),
  };
}

export const SINGLE_VALUES = [100, 200, 300, 400, 500];
export const DOUBLE_VALUES = [200, 400, 600, 800, 1000];

/** Keep each category's clue list in sync with the round's value rows. */
export function normalizeRound(round: Round): Round {
  return {
    ...round,
    categories: round.categories.map((cat) => {
      const clues = cat.clues.slice(0, round.values.length);
      while (clues.length < round.values.length) clues.push(emptyClue());
      return { ...cat, clues };
    }),
  };
}

export const TEMPLATES: { id: string; name: string; description: string; build: () => BoardContent }[] = [
  {
    id: "classic",
    name: "Classic 6×5",
    description: "Jeopardy + Double Jeopardy, 6 categories × 5 clues, plus Final.",
    build: () => ({
      rounds: [makeRound("single", 6, SINGLE_VALUES), makeRound("double", 6, DOUBLE_VALUES)],
      final: { category: "", text: "", answer: "", media: null, answerMedia: null },
    }),
  },
  {
    id: "single-category",
    name: "Single category",
    description: "One category per round — great for a themed mini-game.",
    build: () => ({
      rounds: [makeRound("single", 1, SINGLE_VALUES), makeRound("double", 1, DOUBLE_VALUES)],
      final: { category: "", text: "", answer: "", media: null, answerMedia: null },
    }),
  },
  {
    id: "quick",
    name: "Quick 3×3",
    description: "One short round of 3 categories × 3 clues. No Final.",
    build: () => ({ rounds: [makeRound("single", 3, [100, 200, 300])], final: null }),
  },
];

export function findClue(content: BoardContent, clueId: string) {
  for (let r = 0; r < content.rounds.length; r++) {
    const round = content.rounds[r];
    for (let c = 0; c < round.categories.length; c++) {
      const cat = round.categories[c];
      for (let q = 0; q < cat.clues.length; q++) {
        if (cat.clues[q].id === clueId) {
          return { round: r, cat: c, row: q, clue: cat.clues[q], category: cat, value: round.values[q] ?? 0 };
        }
      }
    }
  }
  return null;
}

/** A clue is "playable" when it has text or media. Blank cells are shown empty and can't be opened. */
export function isPlayable(clue: Clue): boolean {
  return clue.text.trim().length > 0 || !!clue.media;
}
