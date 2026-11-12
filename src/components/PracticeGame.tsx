"use client";

import Link from "next/link";
import { useEffect, useMemo, useRef, useState } from "react";
import { isPlayable, type BoardContent, type Clue, type Media } from "@/shared/board";
import { answersMatch } from "@/shared/answerMatch";
import { MediaView } from "@/components/game";
import { themeVars } from "@/shared/theme";

type Result = "right" | "wrong" | "skipped";
interface Open {
  id: string;
  category: string;
  value: number;
  text: string;
  answer: string;
  media?: Media | null;
  answerMedia?: Media | null;
  final?: boolean;
}

const CLUE_SECONDS = 30;

function money(n: number) {
  return (n < 0 ? "-$" : "$") + Math.abs(n).toLocaleString("en-US");
}

/**
 * Solo practice: one person plays a board against the clock and checks their own answers.
 * It runs entirely in the browser; no game is created and nothing is saved on the server.
 * The best score per board is remembered on this device only.
 */
export function PracticeGame({ content, title, boardKey, exitHref, exitLabel }: { content: BoardContent; title: string; boardKey: string; exitHref: string; exitLabel: string }) {
  const [roundIndex, setRoundIndex] = useState(0);
  const [results, setResults] = useState<Record<string, Result>>({});
  const [score, setScore] = useState(0);
  const [open, setOpen] = useState<Open | null>(null);
  const [guess, setGuess] = useState("");
  const [verdict, setVerdict] = useState<Result | null>(null);
  const [timed, setTimed] = useState(true);
  const [left, setLeft] = useState(CLUE_SECONDS);
  const [stage, setStage] = useState<"board" | "wager" | "done">("board");
  const [wager, setWager] = useState("");
  const [best, setBest] = useState<number | null>(null);
  /** Only these clue ids are in play (used by "practice the ones I missed"). */
  const [only, setOnly] = useState<Set<string> | null>(null);
  const inputRef = useRef<HTMLInputElement>(null);
  const bestKey = `tp.practice.best.${boardKey}`;

  useEffect(() => {
    try {
      const v = localStorage.getItem(bestKey);
      if (v !== null && Number.isFinite(Number(v))) setBest(Number(v));
    } catch {}
  }, [bestKey]);

  const round = content.rounds[roundIndex];
  const inPlay = (q: Clue | undefined): q is Clue => !!q && isPlayable(q) && (!only || only.has(q.id));
  const roundLeft = (r: number) => content.rounds[r]?.categories.reduce((n, c) => n + c.clues.filter((q) => inPlay(q) && !results[q.id]).length, 0) ?? 0;
  const allClues = useMemo(
    () =>
      content.rounds.flatMap((r) =>
        r.categories.flatMap((c) => c.clues.map((q, row) => ({ q, category: c.name, value: r.values[row] ?? 0 })).filter((x) => isPlayable(x.q))),
      ),
    [content],
  );

  // Countdown while a clue is open and unanswered.
  useEffect(() => {
    if (!open || verdict || !timed) return;
    if (left <= 0) {
      settle("skipped");
      return;
    }
    const t = setTimeout(() => setLeft((s) => s - 1), 1000);
    return () => clearTimeout(t);
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [open, verdict, timed, left]);

  useEffect(() => {
    if (open && !verdict) inputRef.current?.focus();
  }, [open, verdict]);

  function show(o: Open) {
    setOpen(o);
    setGuess("");
    setVerdict(null);
    setLeft(CLUE_SECONDS);
  }

  function delta(o: Open, r: Result) {
    return r === "right" ? o.value : r === "wrong" ? -o.value : 0;
  }

  function settle(r: Result) {
    if (!open || verdict) return;
    setVerdict(r);
    setResults((m) => ({ ...m, [open.id]: r }));
    setScore((s) => s + delta(open, r));
  }

  /** The player overrules the automatic check. */
  function overrule(r: Result) {
    if (!open || !verdict || verdict === r) return;
    setScore((s) => s - delta(open, verdict) + delta(open, r));
    setResults((m) => ({ ...m, [open.id]: r }));
    setVerdict(r);
  }

  function next() {
    if (!open) return;
    const wasFinal = open.final;
    setOpen(null);
    setVerdict(null);
    if (wasFinal) return finish();
    // `results` already has this clue (settle ran before next), so the counts are current.
    if (roundLeft(roundIndex) > 0) return;
    const later = content.rounds.findIndex((_, i) => i > roundIndex && roundLeft(i) > 0);
    if (later >= 0) return setRoundIndex(later);
    if (content.final && !only) return setStage("wager");
    finish();
  }

  function finish() {
    setStage("done");
    if (only) return;
    // `score` is already final here: the last clue was settled on an earlier render.
    const nb = best === null || score > best ? score : best;
    setBest(nb);
    try {
      localStorage.setItem(bestKey, String(nb));
    } catch {}
  }

  function restart(missedOnly: boolean) {
    const missed = new Set(Object.entries(results).filter(([id, r]) => r !== "right" && id !== "final").map(([id]) => id));
    setOnly(missedOnly && missed.size ? missed : null);
    setResults({});
    setScore(0);
    setOpen(null);
    setVerdict(null);
    setWager("");
    setStage("board");
    const first = content.rounds.findIndex((r) => r.categories.some((c) => c.clues.some((q) => isPlayable(q) && (!missedOnly || !missed.size || missed.has(q.id)))));
    setRoundIndex(Math.max(0, first));
  }

  const maxWager = Math.max(score, 1000);
  const counts = Object.values(results).reduce((a, r) => ({ ...a, [r]: a[r] + 1 }), { right: 0, wrong: 0, skipped: 0 } as Record<Result, number>);

  return (
    <div className="flex min-h-dvh flex-col bg-[var(--board-edge)] text-white" style={themeVars(content.theme)}>
      <header className="flex flex-wrap items-center gap-x-4 gap-y-1 border-b border-white/10 bg-black/30 px-4 py-2">
        <div className="min-w-0 flex-1">
          <div className="text-xs text-white/50">{only ? "Practice: the ones you missed" : "Solo practice"}</div>
          <div className="cat-text truncate text-lg">{title}</div>
        </div>
        <label className="flex items-center gap-2 text-sm text-white/70">
          <input type="checkbox" checked={timed} onChange={(e) => setTimed(e.target.checked)} className="h-4 w-4 accent-[var(--gold)]" />
          {CLUE_SECONDS}s timer
        </label>
        <div className="text-right">
          <div className={`money text-2xl ${score < 0 ? "!text-red-400" : ""}`} aria-live="polite">{money(score)}</div>
          {best !== null && <div className="text-xs text-white/50">Best {money(best)}</div>}
        </div>
        <Link href={exitHref} className="btn-ghost !px-3 !py-1.5 text-sm">{exitLabel}</Link>
      </header>

      {stage === "board" && !allClues.length && !content.final && (
        <div className="grid flex-1 place-items-center p-6 text-center text-white/70">This board has no clues with both a question and an answer yet.</div>
      )}

      {stage === "board" && round && (
        <div className="flex min-h-0 flex-1 flex-col p-2">
          {content.rounds.length > 1 && <div className="mb-1 text-center text-sm text-white/60">{round.name}</div>}
          <div
            className="grid min-h-[60dvh] flex-1 gap-1 bg-black p-1"
            style={{ gridTemplateColumns: `repeat(${round.categories.length}, minmax(0, 1fr))`, gridTemplateRows: `1.25fr repeat(${round.values.length}, minmax(0, 1fr))` }}
          >
            {round.categories.map((cat) => (
              <div key={cat.id} className="board-cell grid place-items-center overflow-hidden px-1 text-center">
                <span className="cat-text text-[clamp(0.6rem,2.2vw,1.4rem)] leading-tight">{cat.name}</span>
              </div>
            ))}
            {round.values.flatMap((value, r) =>
              round.categories.map((cat) => {
                const q = cat.clues[r];
                const res = q ? results[q.id] : undefined;
                const playable = inPlay(q) && !res;
                return (
                  <button
                    key={`${cat.id}-${r}`}
                    disabled={!playable}
                    aria-label={playable ? `${cat.name} for ${value}` : undefined}
                    onClick={() => q && show({ id: q.id, category: cat.name, value, text: q.text, answer: q.answer, media: q.media, answerMedia: q.answerMedia })}
                    className="board-cell grid place-items-center hover:brightness-125 disabled:cursor-default disabled:hover:brightness-100"
                  >
                    {playable ? (
                      <span className="money text-[clamp(1rem,4vw,2.6rem)]">${value}</span>
                    ) : res ? (
                      <span className="text-[clamp(0.9rem,3vw,1.6rem)] opacity-60">{res === "right" ? "✓" : res === "wrong" ? "✗" : "–"}</span>
                    ) : null}
                  </button>
                );
              }),
            )}
          </div>
        </div>
      )}

      {stage === "wager" && content.final && (
        <div className="board-cell flex flex-1 flex-col items-center justify-center gap-5 p-6 text-center">
          <div className="cat-text text-xl text-gold">Final clue</div>
          <div className="cat-text text-4xl sm:text-5xl">{content.final.category}</div>
          <form
            className="flex w-full max-w-xs flex-col gap-3"
            onSubmit={(e) => {
              e.preventDefault();
              const f = content.final!;
              const w = Math.max(0, Math.min(maxWager, parseInt(wager, 10) || 0));
              setStage("board");
              show({ id: "final", category: f.category, value: w, text: f.text, answer: f.answer, media: f.media, answerMedia: f.answerMedia, final: true });
            }}
          >
            <label className="text-sm text-white/70" htmlFor="practice-wager">Your wager (up to {money(maxWager)})</label>
            <input id="practice-wager" className="input text-center text-2xl" inputMode="numeric" autoFocus value={wager} onChange={(e) => setWager(e.target.value.replace(/\D/g, "").slice(0, 7))} placeholder="0" />
            <button className="btn-primary py-3 text-lg">Show the clue</button>
          </form>
        </div>
      )}

      {stage === "done" && (
        <div className="mx-auto flex w-full max-w-xl flex-1 flex-col items-center justify-center gap-5 p-6 text-center">
          <div className="text-5xl">🐷</div>
          <div>
            <div className="text-white/60">{only ? "Second pass done" : "You finished with"}</div>
            <div className={`money text-6xl ${score < 0 ? "!text-red-400" : ""}`}>{money(score)}</div>
            {!only && best !== null && <div className="mt-1 text-sm text-white/60">{score >= best ? "That is your best on this board." : `Your best is ${money(best)}.`}</div>}
          </div>
          <div className="grid w-full grid-cols-3 gap-2">
            <div className="card !p-3"><div className="text-2xl font-bold text-green-400">{counts.right}</div><div className="text-xs text-white/60">right</div></div>
            <div className="card !p-3"><div className="text-2xl font-bold text-red-400">{counts.wrong}</div><div className="text-xs text-white/60">wrong</div></div>
            <div className="card !p-3"><div className="text-2xl font-bold">{counts.skipped}</div><div className="text-xs text-white/60">skipped</div></div>
          </div>
          {counts.wrong + counts.skipped > 0 && (
            <div className="card w-full !p-0 text-left">
              <div className="border-b border-line px-3 py-2 text-sm font-semibold">Worth another look</div>
              <ul className="max-h-64 overflow-y-auto">
                {allClues.filter((x) => results[x.q.id] && results[x.q.id] !== "right").map((x) => (
                  <li key={x.q.id} className="border-b border-line px-3 py-2 text-sm last:border-0">
                    <div className="text-xs text-white/50">{x.category} · ${x.value}</div>
                    <div>{x.q.text}</div>
                    <div className="text-gold">{x.q.answer}</div>
                  </li>
                ))}
              </ul>
            </div>
          )}
          <div className="flex w-full flex-wrap gap-2">
            {allClues.some((x) => results[x.q.id] && results[x.q.id] !== "right") && (
              <button className="btn-ghost flex-1 py-3" onClick={() => restart(true)}>Practice the ones I missed</button>
            )}
            <button className="btn-primary flex-1 py-3" onClick={() => restart(false)}>Play again</button>
          </div>
        </div>
      )}

      {open && (
        <div className="board-cell fixed inset-0 z-40 flex flex-col items-center gap-4 overflow-y-auto p-5 text-center" role="dialog" aria-label="Clue">
          <div className="flex w-full items-center justify-between text-sm text-white/70">
            <span className="cat-text">
              {open.category} <span className="text-gold">· {open.final ? `wager ${money(open.value)}` : `$${open.value}`}</span>
            </span>
            {timed && !verdict && <span className={`money text-xl ${left <= 5 ? "!text-red-400" : ""}`} aria-label={`${left} seconds left`}>{left}</span>}
          </div>
          {timed && !verdict && (
            <div className="h-1.5 w-full overflow-hidden rounded bg-black/40">
              <div className="h-full bg-[var(--gold)] transition-[width] duration-1000 ease-linear" style={{ width: `${(left / CLUE_SECONDS) * 100}%` }} />
            </div>
          )}
          <div className="flex w-full flex-1 flex-col items-center justify-center gap-4">
            {open.media && <MediaView media={open.media} className="max-h-[30vh] max-w-full rounded-lg" />}
            <div className="clue-text max-w-3xl text-[clamp(1.4rem,5vw,3rem)] leading-snug">{open.text}</div>
            {verdict && (
              <div className="anim-pop rounded-xl bg-black/35 px-6 py-3">
                {open.answerMedia && <MediaView media={open.answerMedia} className="mx-auto mb-2 max-h-[24vh] rounded-lg" />}
                <div className="clue-text text-[clamp(1.2rem,4vw,2.2rem)] text-gold">{open.answer}</div>
              </div>
            )}
          </div>
          {!verdict ? (
            <form
              className="flex w-full max-w-xl flex-col gap-2 sm:flex-row"
              onSubmit={(e) => {
                e.preventDefault();
                if (!guess.trim()) return;
                settle(answersMatch(guess, open.answer) ? "right" : "wrong");
              }}
            >
              <input ref={inputRef} className="input flex-1 text-lg" value={guess} onChange={(e) => setGuess(e.target.value)} placeholder="Type your answer" aria-label="Your answer" maxLength={200} autoComplete="off" autoCapitalize="off" spellCheck={false} />
              <button className="btn-primary px-6 py-3" disabled={!guess.trim()}>Check</button>
              <button type="button" className="btn-ghost px-4 py-3" onClick={() => settle("skipped")}>Skip</button>
            </form>
          ) : (
            <div className="flex w-full max-w-xl flex-col gap-2" aria-live="polite">
              <div className={`text-lg font-bold ${verdict === "right" ? "text-green-400" : verdict === "wrong" ? "text-red-400" : "text-white/70"}`}>
                {verdict === "right" ? `Right: +${money(open.value)}` : verdict === "wrong" ? `Wrong: ${money(-open.value)}` : left <= 0 && timed ? "Out of time" : "Skipped"}
                {guess.trim() && <span className="ml-2 font-normal text-white/60">You wrote “{guess.trim()}”</span>}
              </div>
              <div className="flex gap-2">
                {verdict !== "right" && <button className="btn-ghost flex-1" onClick={() => overrule("right")}>I had it right</button>}
                {verdict === "right" && <button className="btn-ghost flex-1" onClick={() => overrule("wrong")}>Actually, I was wrong</button>}
                <button className="btn-primary flex-1 py-3" autoFocus onClick={next}>{open.final ? "See how I did" : "Next clue"}</button>
              </div>
            </div>
          )}
        </div>
      )}
    </div>
  );
}
