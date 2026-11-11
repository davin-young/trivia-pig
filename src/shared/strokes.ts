import { z } from "zod";

/**
 * Handwriting is stored as vector stroke data so it scales crisply on a TV.
 * Points are in the drawing's own coordinate space (w × h), pressure 0..1.
 */
export const LIMITS = {
  maxStrokes: 300,
  maxPointsPerStroke: 1500,
  maxTotalPoints: 30000,
};

const coord = z.number().finite().min(-50).max(5000);
export const strokeSchema = z.object({
  /** "#rrggbb" or the special "rainbow" brush */
  c: z.union([z.string().regex(/^#[0-9a-fA-F]{6}$/), z.literal("rainbow")]),
  /** brush size in drawing units */
  s: z.number().min(1).max(60),
  fx: z.enum(["glow"]).optional(),
  p: z.array(z.tuple([coord, coord, z.number().min(0).max(1)])).min(1).max(LIMITS.maxPointsPerStroke),
});
export type Stroke = z.infer<typeof strokeSchema>;

export const drawingSchema = z
  .object({
    v: z.literal(1),
    w: z.number().int().min(50).max(2000),
    h: z.number().int().min(20).max(2000),
    strokes: z.array(strokeSchema).max(LIMITS.maxStrokes),
  })
  .refine((d) => d.strokes.reduce((n, s) => n + s.p.length, 0) <= LIMITS.maxTotalPoints, {
    message: "Drawing has too many points",
  });
export type Drawing = z.infer<typeof drawingSchema>;

export const NAME_CANVAS = { w: 600, h: 240 };
export const FINAL_CANVAS = { w: 800, h: 450 };

/** Bright swatches tuned to read on the dark-blue display. */
export const PALETTE = [
  "#ffffff",
  "#ffd23f",
  "#ff8c42",
  "#ff5d73",
  "#ff7ad9",
  "#c792ff",
  "#7bdff2",
  "#4ff0b1",
  "#b8f35d",
  "#f2e9dc",
];

export const BRUSH_SIZES = { thin: 6, medium: 11, thick: 18 } as const;

export function isEmptyDrawing(d: Drawing | null | undefined): boolean {
  return !d || d.strokes.length === 0;
}

/** Round coordinates so payloads stay small. */
export function compactDrawing(d: Drawing): Drawing {
  return {
    ...d,
    strokes: d.strokes.map((s) => ({
      ...s,
      p: s.p.map(([x, y, pr]) => [Math.round(x * 10) / 10, Math.round(y * 10) / 10, Math.round(pr * 100) / 100]),
    })),
  };
}
