"use client";

import { useCallback, useEffect, useRef, useState } from "react";
import { useGame } from "@/client/useGame";
import type { FxEvent } from "@/shared/protocol";
import { contestants, formatScore } from "@/components/game";

/**
 * Scores only, on a transparent page, for laying over a camera in streaming software.
 * It connects as a spectator, so it never counts as the room's big screen, and it gets
 * the display's view of the game: no answers before they are revealed.
 */
export default function OverlayClient({ code, top, reactions: showReactions }: { code: string; top: boolean; reactions: boolean }) {
  const [reactions, setReactions] = useState<{ key: number; emoji: string; x: number }[]>([]);
  const nextKey = useRef(0);

  const onFx = useCallback(
    (fx: FxEvent) => {
      if (fx.cue !== "react" || !fx.id || !showReactions) return;
      const key = ++nextKey.current;
      setReactions((list) => [...list.slice(-30), { key, emoji: fx.id!, x: 5 + Math.random() * 90 }]);
      setTimeout(() => setReactions((list) => list.filter((r) => r.key !== key)), 3200);
    },
    [showReactions],
  );

  const { view } = useGame({
    role: "display",
    code,
    watch: true,
    onFx,
    onRedirect: (next) => window.location.replace(`/overlay/${next}${window.location.search}`),
  });

  // The site's background would cover the stream; make this page see-through.
  useEffect(() => {
    const html = document.documentElement.style;
    const body = document.body.style;
    const before = [html.background, body.background];
    html.background = "transparent";
    body.background = "transparent";
    return () => {
      html.background = before[0];
      body.background = before[1];
    };
  }, []);

  if (!view || !view.settings.spectators) return null;

  const list = contestants(view);
  const answering = view.clue?.answering ?? null;
  const best = Math.max(...list.map((c) => view.scores[c.id] ?? 0), 1);

  return (
    <main className="pointer-events-none fixed inset-0 select-none overflow-hidden text-white">
      {showReactions && (
        <div className="absolute inset-0" aria-hidden>
          {reactions.map((r) => (
            <span key={r.key} className="anim-react absolute bottom-0 text-[7vmin] leading-none drop-shadow-lg" style={{ left: `${r.x}%` }}>
              {r.emoji}
            </span>
          ))}
        </div>
      )}
      <div className={`absolute inset-x-0 flex flex-wrap justify-center gap-[1vw] px-[2vw] ${top ? "top-[2vh]" : "bottom-[2vh]"}`}>
        {list.map((c) => {
          const score = view.scores[c.id] ?? 0;
          const active = answering === c.id || c.players.some((p) => p.id === answering);
          const leading = view.phase !== "lobby" && score === best;
          return (
            <div
              key={c.id}
              className={`flex min-w-[10vw] max-w-[22vw] flex-col items-center rounded-[0.8vw] px-[1.2vw] py-[0.6vw] shadow-xl ring-[0.2vw] transition ${active ? "scale-110 bg-white text-black ring-gold" : "bg-black/75 ring-white/15"}`}
            >
              <span className="w-full truncate text-center text-[1.5vw] font-semibold" style={c.color && !active ? { color: c.color } : undefined}>
                {leading && !active ? "👑 " : ""}
                {c.name}
              </span>
              <span className={`money text-[2.2vw] leading-tight ${score < 0 ? "!text-red-400" : ""} ${active ? "!text-black" : ""}`}>{formatScore(score)}</span>
            </div>
          );
        })}
      </div>
    </main>
  );
}
