"use client";

import { useState } from "react";
import { isPlayable, type BoardContent, type Clue, type Media } from "@/shared/board";
import { MediaView } from "@/components/game";
import { themeVars } from "@/shared/theme";

type Open = { category: string; value: number | null; text: string; answer: string; media?: Media | null; answerMedia?: Media | null; dd?: boolean };

/**
 * Click-through preview of a board, styled like the big-screen display.
 * Entirely client-side: nothing is sent anywhere.
 */
export function BoardPreview({ content, title }: { content: BoardContent; title: string }) {
  const [tab, setTab] = useState<number | "final">(content.rounds.length ? 0 : "final");
  const [open, setOpen] = useState<Open | null>(null);
  const [revealed, setRevealed] = useState(false);
  const [seen, setSeen] = useState<Record<string, boolean>>({});
  const round = typeof tab === "number" ? content.rounds[tab] : null;

  function show(o: Open, id?: string) {
    setOpen(o);
    setRevealed(false);
    if (id) setSeen((s) => ({ ...s, [id]: true }));
  }

  return (
    <div className="flex min-h-dvh flex-col bg-[var(--board-edge)] text-white" style={themeVars(content.theme)}>
      <div className="flex flex-wrap items-center gap-2 border-b border-white/10 bg-black/30 px-4 py-2">
        <div className="cat-text mr-4 text-lg">{title}</div>
        {content.rounds.map((r, i) => (
          <button key={r.id} onClick={() => setTab(i)} className={`rounded-lg px-3 py-1 text-sm ${tab === i ? "bg-gold text-black" : "bg-white/10 hover:bg-white/20"}`}>
            {r.name}
          </button>
        ))}
        {content.final && (
          <button onClick={() => setTab("final")} className={`rounded-lg px-3 py-1 text-sm ${tab === "final" ? "bg-gold text-black" : "bg-white/10 hover:bg-white/20"}`}>
            Final
          </button>
        )}
        <button className="ml-auto text-sm text-white/50 hover:text-white" onClick={() => setSeen({})}>
          Reset
        </button>
      </div>

      {round && (
        <div className="min-h-0 flex-1 p-[1vmin]">
          <div
            className="grid h-[calc(100dvh-60px)] gap-[0.6vmin] bg-black p-[0.6vmin]"
            style={{
              gridTemplateColumns: `repeat(${round.categories.length}, minmax(0, 1fr))`,
              gridTemplateRows: `1.25fr repeat(${round.values.length}, minmax(0, 1fr))`,
            }}
          >
            {round.categories.map((cat) => (
              <div key={cat.id} className="board-cell grid place-items-center overflow-hidden px-[0.8vmin] text-center">
                <span className="cat-text" style={{ fontSize: `${Math.min(3.4, 22 / Math.max(round.categories.length, 3))}vmin` }}>
                  {cat.name}
                </span>
              </div>
            ))}
            {round.values.flatMap((value, r) =>
              round.categories.map((cat) => {
                const q: Clue | undefined = cat.clues[r];
                const playable = q && isPlayable(q);
                return (
                  <button
                    key={`${cat.id}-${r}`}
                    disabled={!playable}
                    onClick={() => q && show({ category: cat.name, value, text: q.text, answer: q.answer, media: q.media, answerMedia: q.answerMedia, dd: q.dailyDouble }, q.id)}
                    className="board-cell grid place-items-center hover:brightness-125 disabled:cursor-default"
                  >
                    {playable && !seen[q.id] && (
                      <span className="money" style={{ fontSize: `${Math.min(7, 40 / Math.max(round.categories.length, 4))}vmin` }}>
                        ${value}
                      </span>
                    )}
                  </button>
                );
              }),
            )}
          </div>
        </div>
      )}

      {tab === "final" && content.final && (
        <div className="board-cell flex flex-1 flex-col items-center justify-center gap-6 p-8 text-center">
          <div className="cat-text text-[3vmin] text-gold">Final Jeopardy!</div>
          <div className="cat-text text-[7vmin]">{content.final.category}</div>
          <button className="btn-primary" onClick={() => show({ category: content.final!.category, value: null, text: content.final!.text, answer: content.final!.answer, media: content.final!.media, answerMedia: content.final!.answerMedia })}>
            Show clue
          </button>
        </div>
      )}

      {open && (
        <div className="board-cell anim-clue fixed inset-0 z-40 flex flex-col items-center justify-center gap-[3vmin] p-[5vmin] text-center" onClick={() => (revealed ? setOpen(null) : setRevealed(true))}>
          <div className="absolute left-[3vmin] top-[2vmin] cat-text text-[2.6vmin] text-white/70">
            {open.category}
            {open.value !== null && <span className="text-gold"> · ${open.value}</span>}
            {open.dd && <span className="text-gold"> · Daily Double</span>}
          </div>
          {open.media && <MediaView media={open.media} className="max-h-[40vh] max-w-[85vw] rounded-[1vmin]" />}
          <div className="clue-text max-w-[90vw] text-[6vmin]">{open.text}</div>
          {revealed ? (
            <div className="anim-pop rounded-[1.5vmin] bg-black/35 px-[4vmin] py-[2vmin]">
              {open.answerMedia && <MediaView media={open.answerMedia} className="mx-auto mb-[1.5vmin] max-h-[30vh] rounded-[1vmin]" />}
              <div className="clue-text text-[4.5vmin] text-gold">{open.answer}</div>
            </div>
          ) : null}
          <div className="absolute bottom-[3vmin] text-[2vmin] text-white/50">{revealed ? "Click to return to the board" : "Click to reveal the answer"}</div>
        </div>
      )}
    </div>
  );
}
