"use client";

import { memo, useId } from "react";
import { getStroke } from "perfect-freehand";
import type { Drawing, Stroke } from "@/shared/strokes";

/** perfect-freehand outline → SVG path (adapted from the library's README). */
export function outlinePath(points: number[][]): string {
  if (!points.length) return "";
  const avg = (a: number, b: number) => (a + b) / 2;
  const len = points.length;
  if (len < 4) {
    const [x, y] = points[0];
    return `M${x},${y} a1,1 0 1,0 0.1,0`;
  }
  const f = (n: number) => n.toFixed(2);
  let d = `M${f(points[0][0])},${f(points[0][1])} Q${f(points[1][0])},${f(points[1][1])} ${f(avg(points[1][0], points[2][0]))},${f(avg(points[1][1], points[2][1]))} T`;
  for (let i = 2; i < len - 1; i++) {
    d += `${f(avg(points[i][0], points[i + 1][0]))},${f(avg(points[i][1], points[i + 1][1]))} `;
  }
  return d + "Z";
}

export function strokePath(s: Stroke): string {
  const hasPressure = s.p.some((p) => p[2] !== 0.5);
  const outline = getStroke(s.p, {
    size: s.s,
    thinning: 0.6,
    smoothing: 0.55,
    streamline: 0.45,
    simulatePressure: !hasPressure,
    last: true,
  });
  return outlinePath(outline);
}

const RAINBOW = ["#ff5d73", "#ff8c42", "#ffd23f", "#4ff0b1", "#7bdff2", "#c792ff"];

function StrokePath({ s, gradId, glowId }: { s: Stroke; gradId: string; glowId: string }) {
  const d = strokePath(s);
  const fill = s.c === "rainbow" ? `url(#${gradId})` : s.c;
  return <path d={d} fill={fill} filter={s.fx === "glow" ? `url(#${glowId})` : undefined} />;
}

/** Crisp vector rendering of handwriting at any size. */
export const Ink = memo(function Ink({
  drawing,
  className,
  live,
  title,
}: {
  drawing: Drawing | null | undefined;
  className?: string;
  live?: Stroke | null;
  title?: string;
}) {
  const uid = useId().replace(/[^a-zA-Z0-9]/g, "");
  if (!drawing) return null;
  const gradId = `rb${uid}`;
  const glowId = `gl${uid}`;
  return (
    <svg
      viewBox={`0 0 ${drawing.w} ${drawing.h}`}
      className={className}
      preserveAspectRatio="xMidYMid meet"
      role="img"
      aria-label={title ?? "handwriting"}
    >
      <defs>
        <linearGradient id={gradId} x1="0" y1="0" x2="1" y2="0" gradientUnits="userSpaceOnUse" gradientTransform={`scale(${drawing.w} 1)`}>
          {RAINBOW.map((c, i) => (
            <stop key={c} offset={i / (RAINBOW.length - 1)} stopColor={c} />
          ))}
        </linearGradient>
        <filter id={glowId} x="-30%" y="-30%" width="160%" height="160%">
          <feGaussianBlur stdDeviation="4" result="b" />
          <feMerge>
            <feMergeNode in="b" />
            <feMergeNode in="b" />
            <feMergeNode in="SourceGraphic" />
          </feMerge>
        </filter>
      </defs>
      {drawing.strokes.map((s, i) => (
        <StrokePath key={i} s={s} gradId={gradId} glowId={glowId} />
      ))}
      {live && <StrokePath s={live} gradId={gradId} glowId={glowId} />}
    </svg>
  );
});
