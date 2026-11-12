"use client";

import { useState } from "react";

export interface ChartSeries {
  id: string;
  name: string;
  points: number[];
}

/** Fixed order, validated for colour-blind separation and contrast on the dark card surface. */
const COLORS = ["#3987e5", "#d95926", "#199e70", "#c98500", "#d55181"];

const W = 640;
const H = 260;
const PAD = { l: 52, r: 14, t: 12, b: 26 };

function fmt(n: number) {
  return (n < 0 ? "-" : "") + Math.abs(n).toLocaleString("en-US");
}

function niceStep(span: number): number {
  const raw = span / 4;
  const pow = 10 ** Math.floor(Math.log10(Math.max(raw, 1)));
  return [1, 2, 5, 10].map((m) => m * pow).find((x) => x >= raw) ?? pow * 10;
}

/**
 * Score over the course of a game, one line per contestant (the caller passes at most
 * five, see RECAP_CHART_SERIES). Hover or drag for the scores at any moment; the standings list on
 * the page is the table view of the final values.
 */
export function ScoreChart({ series, steps }: { series: ChartSeries[]; steps: string[] }) {
  const [at, setAt] = useState<number | null>(null);
  const n = series[0]?.points.length ?? 0;
  if (n < 2) return null;

  const all = series.flatMap((s) => s.points);
  const step = niceStep(Math.max(...all, 0) - Math.min(...all, 0) || 1);
  const lo = Math.floor(Math.min(...all, 0) / step) * step;
  const hi = Math.ceil(Math.max(...all, step) / step) * step;
  const x = (i: number) => PAD.l + (i / (n - 1)) * (W - PAD.l - PAD.r);
  const y = (v: number) => PAD.t + (1 - (v - lo) / (hi - lo)) * (H - PAD.t - PAD.b);
  const ticks: number[] = [];
  for (let v = lo; v <= hi; v += step) ticks.push(v);

  function move(e: React.PointerEvent<SVGSVGElement>) {
    const box = e.currentTarget.getBoundingClientRect();
    const px = ((e.clientX - box.left) / box.width) * W;
    setAt(Math.max(0, Math.min(n - 1, Math.round(((px - PAD.l) / (W - PAD.l - PAD.r)) * (n - 1)))));
  }

  const shown = at ?? n - 1;
  return (
    <figure className="card !p-3">
      <figcaption className="mb-2 flex flex-wrap items-center gap-x-4 gap-y-1 text-sm">
        {series.map((s, i) => (
          <span key={s.id} className="flex items-center gap-1.5">
            <span className="inline-block h-0.5 w-4 rounded" style={{ background: COLORS[i] }} />
            <span className="max-w-[10rem] truncate">{s.name}</span>
            <span className="tabular-nums text-white/60">{fmt(s.points[shown])}</span>
          </span>
        ))}
      </figcaption>
      <svg
        viewBox={`0 0 ${W} ${H}`}
        className="w-full touch-pan-y select-none"
        role="img"
        aria-label={`Line chart of each contestant's score through the game. ${series.map((s) => `${s.name} finished on ${fmt(s.points[n - 1])}`).join(", ")}.`}
        onPointerMove={move}
        onPointerDown={move}
        onPointerLeave={() => setAt(null)}
      >
        {ticks.map((v) => (
          <g key={v}>
            <line x1={PAD.l} x2={W - PAD.r} y1={y(v)} y2={y(v)} stroke={v === 0 ? "rgba(255,255,255,0.35)" : "rgba(255,255,255,0.1)"} strokeWidth={1} />
            <text x={PAD.l - 8} y={y(v) + 4} textAnchor="end" fontSize={11} fill="rgba(246,247,255,0.6)">{fmt(v)}</text>
          </g>
        ))}
        <text x={PAD.l} y={H - 6} fontSize={11} fill="rgba(246,247,255,0.6)">Start</text>
        <text x={W - PAD.r} y={H - 6} textAnchor="end" fontSize={11} fill="rgba(246,247,255,0.6)">Final</text>
        {at !== null && <line x1={x(at)} x2={x(at)} y1={PAD.t} y2={H - PAD.b} stroke="rgba(255,255,255,0.4)" strokeWidth={1} />}
        {series.map((s, i) => (
          <g key={s.id}>
            <polyline fill="none" stroke={COLORS[i]} strokeWidth={2} strokeLinejoin="round" strokeLinecap="round" points={s.points.map((v, j) => `${x(j).toFixed(1)},${y(v).toFixed(1)}`).join(" ")} />
            <circle cx={x(shown)} cy={y(s.points[shown])} r={4} fill={COLORS[i]} stroke="#141a38" strokeWidth={2} />
          </g>
        ))}
      </svg>
      <div className="mt-1 min-h-5 text-xs text-white/60" aria-live="polite">
        {at !== null && at > 0 ? steps[at - 1] : at === 0 ? "Start of the game" : "Hover or drag across the chart to replay the game."}
      </div>
    </figure>
  );
}
