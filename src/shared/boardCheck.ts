import { isPlayable, type BoardContent } from "./board";

export interface BoardIssue {
  /** "error": there is nothing to play. "warn": worth a look before game night. */
  level: "error" | "warn";
  message: string;
  /** Where to jump to in the editor. */
  at: { tab: number | "final"; c?: number; r?: number; field?: "name" | "clue" | "answer" };
}

const has = (s: string | null | undefined) => !!s && s.trim().length > 0;

/**
 * Things worth fixing before game night, in board order. Blank cells are legal (they show
 * as empty on the board), so everything except "no clues at all" is a warning.
 */
export function checkBoard(content: BoardContent): BoardIssue[] {
  const out: BoardIssue[] = [];
  let playable = 0;
  content.rounds.forEach((round, tab) => {
    const label = round.name || `Round ${tab + 1}`;
    const inRound = round.categories.reduce((n, c) => n + c.clues.filter(isPlayable).length, 0);
    playable += inRound;
    if (!inRound) {
      out.push({ level: "warn", message: `${label} has no clues yet.`, at: { tab } });
      return;
    }
    round.categories.forEach((cat, c) => {
      const name = has(cat.name) ? cat.name.trim() : `Category ${c + 1}`;
      const used = cat.clues.filter((q) => isPlayable(q) || has(q.answer)).length;
      if (!used) {
        if (has(cat.name)) out.push({ level: "warn", message: `${label}: "${name}" has no clues.`, at: { tab, c, r: 0, field: "clue" } });
        else out.push({ level: "warn", message: `${label}: column ${c + 1} is empty. Fill it in or delete it.`, at: { tab, c, field: "name" } });
        return;
      }
      if (!has(cat.name)) out.push({ level: "warn", message: `${label}: column ${c + 1} has clues but no category name.`, at: { tab, c, field: "name" } });
      cat.clues.forEach((q, r) => {
        const where = `${label}: ${name} for $${round.values[r] ?? "?"}`;
        if (!isPlayable(q) && has(q.answer)) out.push({ level: "warn", message: `${where} has an answer but no clue.`, at: { tab, c, r, field: "clue" } });
        else if (!isPlayable(q)) out.push({ level: "warn", message: `${where} is blank.`, at: { tab, c, r, field: "clue" } });
        else if (!has(q.answer) && !q.answerMedia) out.push({ level: "warn", message: `${where} has no answer for the host.`, at: { tab, c, r, field: "answer" } });
      });
    });
    const dd = round.categories.reduce((n, c) => n + c.clues.filter((q) => q.dailyDouble && !isPlayable(q)).length, 0);
    if (dd) out.push({ level: "warn", message: `${label}: ${dd} Daily Double${dd > 1 ? "s are" : " is"} on a blank cell and will never come up.`, at: { tab } });
  });
  const f = content.final;
  if (f) {
    const any = has(f.category) || has(f.text) || has(f.answer) || !!f.media;
    if (!any) out.push({ level: "warn", message: "The final round is empty. Fill it in or remove it.", at: { tab: "final" } });
    else {
      if (!has(f.text) && !f.media) out.push({ level: "warn", message: "The final round has no clue.", at: { tab: "final" } });
      if (!has(f.category)) out.push({ level: "warn", message: "The final round has no category (players see it while they wager).", at: { tab: "final" } });
      if (!has(f.answer) && !f.answerMedia) out.push({ level: "warn", message: "The final round has no answer for the host.", at: { tab: "final" } });
    }
  }
  if (!playable) out.unshift({ level: "error", message: "There are no clues on this board yet, so there is nothing to play.", at: { tab: content.rounds.length ? 0 : "final" } });
  return out;
}
