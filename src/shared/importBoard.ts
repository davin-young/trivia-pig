import { isSimpleBoard, simpleBoardSchema, simpleToContent } from "./simpleBoard";
import {
  boardContentSchema,
  emptyClue,
  newId,
  normalizeRound,
  type BoardContent,
  type Category,
  type FinalClue,
  type Round,
} from "./board";

/** Minimal RFC 4180 CSV/TSV parser: quoted fields, escaped quotes, newlines inside quotes. */
export function parseDelimited(text: string, delimiter?: string): string[][] {
  const src = text.replace(/^﻿/, "");
  const delim = delimiter ?? detectDelimiter(src);
  const rows: string[][] = [];
  let row: string[] = [];
  let field = "";
  let quoted = false;
  for (let i = 0; i < src.length; i++) {
    const ch = src[i];
    if (quoted) {
      if (ch === '"') {
        if (src[i + 1] === '"') {
          field += '"';
          i++;
        } else quoted = false;
      } else field += ch;
      continue;
    }
    if (ch === '"' && field === "") quoted = true;
    else if (ch === delim) {
      row.push(field);
      field = "";
    } else if (ch === "\n" || ch === "\r") {
      if (ch === "\r" && src[i + 1] === "\n") i++;
      row.push(field);
      rows.push(row);
      row = [];
      field = "";
    } else field += ch;
  }
  if (field !== "" || row.length) {
    row.push(field);
    rows.push(row);
  }
  return rows.map((r) => r.map((f) => f.trim())).filter((r) => r.some((f) => f !== ""));
}

function detectDelimiter(text: string): string {
  const firstLine = text.split(/\r?\n/, 1)[0] ?? "";
  return firstLine.includes("\t") ? "\t" : firstLine.split(";").length > firstLine.split(",").length ? ";" : ",";
}

function toValue(s: string): number | null {
  const n = Number(s.replace(/[$,\s]/g, ""));
  return Number.isFinite(n) && s.trim() !== "" ? Math.round(n) : null;
}

const truthy = (s: string | undefined) => !!s && /^(1|y|yes|true|x|dd)$/i.test(s.trim());

const MAX_GRID = 12; // same as the board schema: 12 categories, 12 values
const MAX_IMPORT_ROWS = 2000;

interface Row {
  category: string;
  value: number | null;
  clue: string;
  answer: string;
  dd: boolean;
}

/** Build a round from rows of category/value/clue/answer. Categories keep first-seen order. */
function roundFromRows(rows: Row[], base: Pick<Round, "kind" | "name"> & { id?: string }): Round {
  // A round holds at most MAX_GRID categories of MAX_GRID clues. The limits are applied while
  // reading, so a huge paste cannot make this build a grid of millions of empty clues.
  const catOrder: string[] = [];
  const byCat = new Map<string, Row[]>();
  for (const r of rows.slice(0, MAX_IMPORT_ROWS)) {
    if (!byCat.has(r.category)) {
      if (catOrder.length >= MAX_GRID) continue;
      byCat.set(r.category, []);
      catOrder.push(r.category);
    }
    byCat.get(r.category)!.push(r);
  }
  const kept = [...byCat.values()].flat();
  const explicit = [...new Set(kept.map((r) => r.value).filter((v): v is number => v !== null))].sort((a, b) => a - b).slice(0, MAX_GRID);
  const maxPerCat = Math.min(MAX_GRID, Math.max(1, ...[...byCat.values()].map((rs) => rs.length)));
  const step = base.kind === "double" ? 200 : 100;
  const values = explicit.length >= maxPerCat ? explicit : Array.from({ length: maxPerCat }, (_, i) => explicit[i] ?? (i + 1) * step);
  const categories: Category[] = catOrder.map((name) => {
    const list = byCat.get(name)!;
    const clues = values.map(() => emptyClue());
    const unplaced: Row[] = [];
    for (const r of list) {
      const idx = r.value === null ? -1 : values.indexOf(r.value);
      if (idx >= 0 && !clues[idx].text && !clues[idx].answer) clues[idx] = { ...emptyClue(), text: r.clue, answer: r.answer, dailyDouble: r.dd };
      else unplaced.push(r);
    }
    for (const r of unplaced) {
      const idx = clues.findIndex((c) => !c.text && !c.answer);
      if (idx >= 0) clues[idx] = { ...emptyClue(), text: r.clue, answer: r.answer, dailyDouble: r.dd };
    }
    return { id: newId("k"), name, clues };
  });
  return normalizeRound({ id: base.id ?? newId("r"), kind: base.kind, name: base.name, values, categories: categories.slice(0, 12) });
}

/**
 * Bulk paste into one round: rows of `category, value, clue, answer` (TSV from a
 * spreadsheet or CSV). A header row is skipped automatically.
 */
export function roundFromBulkPaste(text: string, round: Round): Round {
  let rows = parseDelimited(text);
  if (rows[0] && /^category$/i.test(rows[0][0])) rows = rows.slice(1);
  const parsed: Row[] = rows
    .filter((r) => r.length >= 3)
    .map((r) =>
      r.length >= 4
        ? { category: r[0], value: toValue(r[1]), clue: r[2], answer: r[3], dd: truthy(r[4]) }
        : { category: r[0], value: null, clue: r[1], answer: r[2], dd: false },
    );
  if (!parsed.length) throw new Error("No rows found. Use: category, value, clue, answer");
  return roundFromRows(parsed, { id: round.id, kind: round.kind, name: round.name });
}

const FINAL_KEYS = /^(final|f|fj|final jeopardy!?)$/i;

/** CSV import: columns round, category, value, clue, answer[, daily_double]. */
export function boardFromCsv(text: string): BoardContent {
  let rows = parseDelimited(text);
  if (rows[0] && /^round$/i.test(rows[0][0])) rows = rows.slice(1);
  if (!rows.length) throw new Error("The CSV is empty");
  const roundOrder: string[] = [];
  const byRound = new Map<string, Row[]>();
  let final: FinalClue | null = null;
  for (const r of rows) {
    const [roundKey = "1", category = "", value = "", clue = "", answer = "", dd] = r;
    if (FINAL_KEYS.test(roundKey)) {
      final = { category, text: clue, answer, media: null, answerMedia: null };
      continue;
    }
    if (!byRound.has(roundKey)) {
      byRound.set(roundKey, []);
      roundOrder.push(roundKey);
    }
    byRound.get(roundKey)!.push({ category, value: toValue(value), clue, answer, dd: truthy(dd) });
  }
  const rounds = roundOrder.slice(0, 4).map((key, i) => {
    const kind: Round["kind"] = /double|^2$/i.test(key) || i === 1 ? "double" : "single";
    const name = /^\d+$/.test(key) ? (kind === "double" ? "Double Jeopardy!" : "Jeopardy!") : key;
    return roundFromRows(byRound.get(key)!, { kind, name });
  });
  return boardContentSchema.parse({ rounds, final });
}

/** JSON import: our export format `{ format: "jeppidy-board", content }` or bare BoardContent. */
export function boardFromJson(raw: unknown): { content: BoardContent; title?: string; description?: string; tags?: string[] } {
  // The published format (what an AI assistant writes): no ids, "question" instead of "text".
  if (isSimpleBoard(raw)) {
    const simple = simpleBoardSchema.parse(raw);
    return { content: simpleToContent(simple), title: simple.title, description: simple.description, tags: simple.tags };
  }
  const obj = raw as Record<string, unknown> | null;
  const isWrapped = !!obj && typeof obj === "object" && "content" in obj;
  const content = boardContentSchema.parse(isWrapped ? obj!.content : raw);
  return {
    content: { ...content, rounds: content.rounds.map(normalizeRound) },
    title: isWrapped && typeof obj!.title === "string" ? obj!.title : undefined,
    description: isWrapped && typeof obj!.description === "string" ? obj!.description : undefined,
    tags: isWrapped && Array.isArray(obj!.tags) ? (obj!.tags as unknown[]).filter((t): t is string => typeof t === "string") : undefined,
  };
}
