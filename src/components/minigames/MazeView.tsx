"use client";

import type { GameView } from "@/engine/views";
import { WALL, type MiniX } from "@/shared/minigames";
import { TEAM_COLORS } from "@/shared/protocol";

/** The pig maze, drawn the same way on the big screen and on phones. */
export function MazeView({ x, view, me, className }: { x: MiniX; view: GameView; me?: string; className?: string }) {
  const w = x.w ?? 1;
  const h = x.h ?? 1;
  const walls = x.walls ?? [];
  const lines: string[] = [];
  walls.forEach((cell, i) => {
    const cx = i % w;
    const cy = Math.floor(i / w);
    if (cell & WALL.N) lines.push(`M${cx},${cy}h1`);
    if (cell & WALL.W) lines.push(`M${cx},${cy}v1`);
    if (cx === w - 1 && cell & WALL.E) lines.push(`M${cx + 1},${cy}v1`);
    if (cy === h - 1 && cell & WALL.S) lines.push(`M${cx},${cy + 1}h1`);
  });
  const color = (id: string) => TEAM_COLORS[(view.players.find((p) => p.id === id)?.index ?? 0) % TEAM_COLORS.length];
  const pigs = x.pigs ?? [];
  return (
    <svg viewBox={`-0.1 -0.1 ${w + 0.2} ${h + 0.2}`} className={className} role="img" aria-label="Maze">
      <rect x={0} y={0} width={w} height={h} fill="rgba(0,0,0,0.35)" />
      <text x={w - 0.5} y={h - 0.5} fontSize={0.7} textAnchor="middle" dominantBaseline="central">
        🌽
      </text>
      <path d={lines.join("")} stroke="#f2e9dc" strokeWidth={0.09} strokeLinecap="round" fill="none" />
      {pigs.map((p, i) => {
        // Pigs sharing a square are nudged apart so each one can be seen.
        const same = pigs.filter((q) => q.x === p.x && q.y === p.y);
        const at = same.indexOf(p);
        const off = same.length > 1 ? ((at / (same.length - 1)) - 0.5) * 0.4 : 0;
        return (
          <g key={p.id} style={{ transform: `translate(${p.x + 0.5 + off}px, ${p.y + 0.5}px)`, transition: "transform 110ms linear" }}>
            <circle r={p.id === me ? 0.42 : 0.36} fill={color(p.id)} opacity={p.id === me || !me ? 0.9 : 0.45} stroke={p.id === me ? "#ffffff" : "none"} strokeWidth={0.06} />
            <text fontSize={0.5} textAnchor="middle" dominantBaseline="central" aria-hidden>
              🐖
            </text>
            <title>{view.players.find((q) => q.id === p.id)?.name ?? `Pig ${i + 1}`}</title>
          </g>
        );
      })}
    </svg>
  );
}
