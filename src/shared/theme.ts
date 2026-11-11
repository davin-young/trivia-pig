import { z } from "zod";

const hex = z.string().regex(/^#[0-9a-fA-F]{6}$/);

export const FONT_IDS = ["classic", "modern", "storybook", "typewriter"] as const;
export type FontId = (typeof FONT_IDS)[number];

/** A board's look: the board colour, the accent (money, highlights) and the lettering. */
export const boardThemeSchema = z.object({
  board: hex,
  accent: hex,
  font: z.enum(FONT_IDS).default("classic"),
});
export type BoardTheme = z.infer<typeof boardThemeSchema>;

export const DEFAULT_THEME: BoardTheme = { board: "#0a1a9e", accent: "#ffcf3f", font: "classic" };

export const THEME_PRESETS: { id: string; name: string; theme: BoardTheme }[] = [
  { id: "classic", name: "Classic blue", theme: DEFAULT_THEME },
  { id: "midnight", name: "Midnight", theme: { board: "#1b1f3a", accent: "#7bdff2", font: "modern" } },
  { id: "forest", name: "Forest", theme: { board: "#0f5132", accent: "#ffd166", font: "storybook" } },
  { id: "berry", name: "Berry", theme: { board: "#6a1b6e", accent: "#ffb3e6", font: "classic" } },
  { id: "ember", name: "Ember", theme: { board: "#8a2a0b", accent: "#ffd23f", font: "classic" } },
  { id: "ocean", name: "Ocean", theme: { board: "#075e73", accent: "#b8f35d", font: "modern" } },
  { id: "slate", name: "Slate", theme: { board: "#2f3a4a", accent: "#ffffff", font: "typewriter" } },
  { id: "holiday", name: "Holiday", theme: { board: "#8f1220", accent: "#9af0b0", font: "storybook" } },
];

const MONO = 'ui-monospace, "Cascadia Mono", "SF Mono", Menlo, Consolas, monospace';
const SERIF = 'var(--font-lora), Georgia, "Times New Roman", serif';
const SANS = "var(--font-inter), system-ui, sans-serif";

export const FONTS: Record<FontId, { name: string; display: string; clue: string }> = {
  classic: { name: "Classic", display: 'var(--font-oswald), "Arial Narrow", sans-serif', clue: "var(--font-lora), Georgia, serif" },
  modern: { name: "Modern", display: SANS, clue: SANS },
  storybook: { name: "Storybook", display: SERIF, clue: SERIF },
  typewriter: { name: "Typewriter", display: MONO, clue: MONO },
};

type Rgb = [number, number, number];
const toRgb = (h: string): Rgb => [1, 3, 5].map((i) => parseInt(h.slice(i, i + 2), 16)) as Rgb;
const toHex = (c: Rgb) => "#" + c.map((v) => Math.round(Math.min(255, Math.max(0, v))).toString(16).padStart(2, "0")).join("");
const mix = (a: Rgb, b: Rgb, t: number): Rgb => [0, 1, 2].map((i) => a[i] + (b[i] - a[i]) * t) as Rgb;

/** WCAG relative luminance, 0 (black) to 1 (white). */
export function luminance(h: string): number {
  const [r, g, b] = toRgb(h).map((v) => {
    const c = v / 255;
    return c <= 0.03928 ? c / 12.92 : ((c + 0.055) / 1.055) ** 2.4;
  });
  return 0.2126 * r + 0.7152 * g + 0.0722 * b;
}

export function contrast(a: string, b: string): number {
  const [hi, lo] = [luminance(a), luminance(b)].sort((x, y) => y - x);
  return (hi + 0.05) / (lo + 0.05);
}

/**
 * Clues are white on the board colour and money is the accent on the board colour, so a
 * picked colour is nudged until both stay readable: the board is darkened until white text
 * reaches 7:1, then the accent is lightened until it reaches 4.5:1 on that board.
 */
export function safeTheme(input: BoardTheme | null | undefined): BoardTheme {
  const t = boardThemeSchema.safeParse(input);
  if (!t.success) return DEFAULT_THEME;
  let board = toRgb(t.data.board);
  for (let i = 0; i < 60 && contrast(toHex(board), "#ffffff") < 7; i++) board = mix(board, [0, 0, 0], 0.06);
  let accent = toRgb(t.data.accent);
  for (let i = 0; i < 60 && contrast(toHex(accent), toHex(board)) < 4.5; i++) accent = mix(accent, [255, 255, 255], 0.08);
  return { board: toHex(board), accent: toHex(accent), font: t.data.font };
}

/** CSS variables for a themed surface. Spread into `style` on a wrapper element. */
export function themeVars(input: BoardTheme | null | undefined): Record<string, string> {
  if (!input) return {};
  const t = safeTheme(input);
  const b = toRgb(t.board);
  const f = FONTS[t.font];
  return {
    "--board": t.board,
    "--board-deep": toHex(mix(b, [0, 0, 0], 0.45)),
    "--board-edge": toHex(mix(b, [0, 0, 0], 0.72)),
    "--gold": t.accent,
    "--f-display": f.display,
    "--f-clue": f.clue,
  };
}

export function sameTheme(a: BoardTheme | null | undefined, b: BoardTheme): boolean {
  const x = a ?? DEFAULT_THEME;
  return x.board.toLowerCase() === b.board.toLowerCase() && x.accent.toLowerCase() === b.accent.toLowerCase() && x.font === b.font;
}
