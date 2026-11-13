"use client";

import { Ink } from "@/components/Ink";
import type { GameView } from "@/engine/views";
import { TEAM_COLORS } from "@/shared/protocol";

export const vmin = (n: number) => `${n}vmin`;

/**
 * A player as a little pig: their drawn face if they made one, ears and a ring in their colour.
 * `mood` picks the movement (see the pig-* classes in globals.css).
 */
export function Pig({ view, id, size, unit = "vmin", mood, badge, label = true, delay = 0, children }: { view: GameView; id: string; size: number; unit?: "vmin" | "px"; mood?: "bob" | "hop" | "panic" | "duck" | "out"; badge?: React.ReactNode; label?: boolean; delay?: number; children?: React.ReactNode }) {
  const p = view.players.find((x) => x.id === id);
  const color = TEAM_COLORS[(p?.index ?? 0) % TEAM_COLORS.length];
  // The big screen sizes everything from the screen (vmin); phones use plain pixels.
  const vmin = (n: number) => `${n}${unit}`;
  const ear = "absolute top-[-6%] h-[34%] w-[34%] rounded-[45%_55%_20%_80%]";
  return (
    <div className={`relative flex shrink-0 flex-col items-center ${mood ? `pig-${mood}` : ""}`} style={{ width: vmin(size), ["--pig-delay" as string]: `${delay}s` }}>
      <div className="pig-body relative" style={{ width: vmin(size), height: vmin(size) }}>
        <span className={`${ear} left-[4%] -rotate-12`} style={{ background: color }} aria-hidden />
        <span className={`${ear} right-[4%] rotate-12 -scale-x-100`} style={{ background: color }} aria-hidden />
        <div className="absolute inset-0 grid place-items-center overflow-hidden rounded-full bg-[var(--board-deep)]" style={{ boxShadow: `0 0 0 ${vmin(size * 0.07)} ${color}`, fontSize: vmin(size * 0.62) }}>
          {p?.avatar ? <Ink drawing={p.avatar} className="h-full w-full" /> : <span aria-hidden>🐷</span>}
        </div>
        {children}
      </div>
      {badge && (
        <div className="anim-pop absolute right-[-18%] top-[-18%] leading-none" style={{ fontSize: vmin(size * 0.42) }} aria-hidden>
          {badge}
        </div>
      )}
      {label && (
        <div className="mt-1 max-w-[190%] truncate rounded-full bg-black/55 px-2 font-bold leading-tight" style={{ fontSize: vmin(Math.max(unit === "px" ? 11 : 1.5, size * 0.21)), color }}>
          {p?.name ?? "Someone"}
        </div>
      )}
    </div>
  );
}
