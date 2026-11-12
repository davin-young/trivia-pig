import type { BoardContent } from "./board";

/** How many clues per category a quick game keeps. */
export const QUICK_ROWS = 3;

/**
 * A quick game (about 15 minutes): the first round only, the three lowest rows of it,
 * and the final clue if the board has one. Clue ids are kept, so nothing else changes.
 */
export function quickBoard(content: BoardContent): BoardContent {
  const first = content.rounds[0];
  if (!first) return content;
  const rows = Math.min(QUICK_ROWS, first.values.length);
  return {
    ...content,
    rounds: [
      {
        ...first,
        values: first.values.slice(0, rows),
        categories: first.categories.map((c) => ({ ...c, clues: c.clues.slice(0, rows) })),
      },
    ],
  };
}
