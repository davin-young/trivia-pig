"use client";

import { useEffect, useState } from "react";
import { isPlayable, type Clue, type Round } from "@/shared/board";
import type { BoardIssue } from "@/shared/boardCheck";
import { DEFAULT_THEME, FONTS, FONT_IDS, THEME_PRESETS, safeTheme, sameTheme, themeVars, type BoardTheme } from "@/shared/theme";
import { Modal } from "./dialogs";

/** True on phone-width screens (matches Tailwind's `max-sm`). */
export function useNarrow(): boolean {
  const [narrow, setNarrow] = useState(false);
  useEffect(() => {
    const mq = window.matchMedia("(max-width: 639px)");
    const on = () => setNarrow(mq.matches);
    on();
    mq.addEventListener("change", on);
    return () => mq.removeEventListener("change", on);
  }, []);
  return narrow;
}

// ------------------------------------------------------------------ theme

function Swatch({ theme, label }: { theme: BoardTheme; label: string }) {
  return (
    <span className="flex flex-col overflow-hidden rounded-lg text-center" style={{ ...themeVars(theme), background: "var(--board-edge)" }}>
      <span className="cat-text m-1 mb-0.5 truncate rounded bg-[var(--board)] px-1 py-1 text-[11px] text-white">{label}</span>
      <span className="board-cell money m-1 mt-0 rounded py-1.5 text-lg">$400</span>
    </span>
  );
}

export function ThemeDialog({ theme, onChange, onClose }: { theme: BoardTheme | null | undefined; onChange: (t: BoardTheme | null) => void; onClose: () => void }) {
  const current = theme ?? DEFAULT_THEME;
  const shown = safeTheme(current);
  const nudged = shown.board.toLowerCase() !== current.board.toLowerCase() || shown.accent.toLowerCase() !== current.accent.toLowerCase();
  const set = (patch: Partial<BoardTheme>) => onChange({ ...current, ...patch });
  return (
    <Modal title="Board theme" onClose={onClose} wide>
      <div className="flex flex-col gap-4 overflow-y-auto">
        <p className="text-sm text-white/60">Players see this look on the big screen, their phones and the host controls.</p>
        <div className="grid grid-cols-2 gap-2 sm:grid-cols-4">
          {THEME_PRESETS.map((p) => {
            const active = sameTheme(theme, p.theme);
            return (
              <button
                key={p.id}
                onClick={() => onChange(p.id === "classic" ? null : p.theme)}
                aria-pressed={active}
                className={`rounded-xl border-2 p-1 text-left ${active ? "border-white" : "border-transparent hover:border-white/30"}`}
              >
                <Swatch theme={p.theme} label={p.name} />
              </button>
            );
          })}
        </div>

        <div className="grid gap-3 rounded-xl border border-line p-3 sm:grid-cols-3">
          <label className="flex items-center gap-2 text-sm">
            <input type="color" className="h-10 w-12 shrink-0 cursor-pointer rounded border border-line bg-transparent" value={current.board} onChange={(e) => set({ board: e.target.value })} />
            Board colour
          </label>
          <label className="flex items-center gap-2 text-sm">
            <input type="color" className="h-10 w-12 shrink-0 cursor-pointer rounded border border-line bg-transparent" value={current.accent} onChange={(e) => set({ accent: e.target.value })} />
            Accent (money)
          </label>
          <label className="flex flex-col gap-1 text-sm">
            Lettering
            <select className="input !py-1.5" value={current.font} onChange={(e) => set({ font: e.target.value as BoardTheme["font"] })}>
              {FONT_IDS.map((f) => (
                <option key={f} value={f}>
                  {FONTS[f].name}
                </option>
              ))}
            </select>
          </label>
        </div>
        {nudged && <p className="text-sm text-amber-300">These colours were adjusted a little so white clue text and the money values stay readable from across the room.</p>}

        <div className="rounded-xl p-3" style={{ ...themeVars(current), background: "var(--board-edge)" }}>
          <div className="grid grid-cols-3 gap-1.5">
            {["History", "Food & drink", "Movies"].map((n) => (
              <div key={n} className="cat-text grid min-h-12 place-items-center rounded bg-[var(--board)] px-1 text-center text-sm text-white">
                {n}
              </div>
            ))}
            {[200, 200, 200, 400, 400, 400].map((v, i) => (
              <div key={i} className="board-cell money grid place-items-center rounded py-2 text-2xl">
                ${v}
              </div>
            ))}
          </div>
          <div className="clue-text mt-2 rounded bg-[var(--board)] p-4 text-center text-base text-white sm:text-lg">This is how a clue looks once it is opened</div>
        </div>

        <div className="flex justify-between gap-2">
          <button className="btn-ghost" onClick={() => onChange(null)} disabled={!theme}>
            Reset to classic
          </button>
          <button className="btn-primary" onClick={onClose}>
            Done
          </button>
        </div>
      </div>
    </Modal>
  );
}

// -------------------------------------------------------------- checklist

export function ChecklistDialog({
  issues,
  filled,
  total,
  aboutToPlay,
  onJump,
  onPlay,
  onClose,
}: {
  issues: BoardIssue[];
  filled: number;
  total: number;
  /** Opened by pressing Play: offer "Play anyway". */
  aboutToPlay: boolean;
  onJump: (at: BoardIssue["at"]) => void;
  onPlay: () => void;
  onClose: () => void;
}) {
  const blocked = issues.some((i) => i.level === "error");
  return (
    <Modal title={issues.length ? (aboutToPlay ? "Before you play" : "Board checklist") : "Board checklist"} onClose={onClose}>
      <div className="flex min-h-0 flex-col gap-3">
        <p className="text-sm text-white/60">
          {filled} of {total} clues filled.{" "}
          {issues.length ? `${issues.length} thing${issues.length > 1 ? "s" : ""} to look at. Tap one to go there.` : "Everything has a clue, an answer and a category name."}
        </p>
        {!issues.length && <div className="rounded-xl bg-green-600/15 p-4 text-center text-lg font-semibold text-green-300">✓ Ready to play</div>}
        {issues.length > 0 && (
          <ul className="flex min-h-0 flex-col gap-1 overflow-y-auto">
            {issues.map((issue, i) => (
              <li key={i}>
                <button
                  className={`flex w-full items-start gap-2 rounded-lg border px-3 py-2 text-left text-sm hover:bg-white/5 ${issue.level === "error" ? "border-red-500/60 bg-red-600/10" : "border-line"}`}
                  onClick={() => onJump(issue.at)}
                >
                  <span aria-hidden>{issue.level === "error" ? "⛔" : "⚠️"}</span>
                  <span className="min-w-0 flex-1">{issue.message}</span>
                  <span className="text-white/40" aria-hidden>
                    →
                  </span>
                </button>
              </li>
            ))}
          </ul>
        )}
        {issues.length > 0 && !blocked && <p className="text-xs text-white/50">Blank cells are allowed: they show as empty squares on the board and cannot be picked.</p>}
        <div className="flex flex-wrap justify-end gap-2">
          <button className="btn-ghost" onClick={onClose}>
            {aboutToPlay ? "Fix first" : "Close"}
          </button>
          {aboutToPlay && (
            <button className="btn-primary" onClick={onPlay} disabled={blocked}>
              ▶ Play anyway
            </button>
          )}
        </div>
      </div>
    </Modal>
  );
}

// ------------------------------------------------------------ phone layout

/**
 * One category at a time, full width, for phone screens. Field `data-nav` / `data-cat`
 * attributes match the desktop grid so keyboard handling and "jump to" keep working.
 */
export function PhoneRound({
  round,
  cat,
  setCat,
  canAddCategory,
  onAddCategory,
  onName,
  onMove,
  onRemove,
  onPatch,
  onSwap,
  onOpen,
  onFieldKey,
}: {
  round: Round;
  cat: number;
  setCat: (c: number) => void;
  canAddCategory: boolean;
  onAddCategory: () => void;
  onName: (c: number, name: string) => void;
  onMove: (from: number, to: number) => void;
  onRemove: (c: number) => void;
  onPatch: (c: number, r: number, patch: Partial<Clue>) => void;
  onSwap: (a: { c: number; r: number }, b: { c: number; r: number }) => void;
  onOpen: (c: number, r: number) => void;
  onFieldKey: (e: React.KeyboardEvent, r: number, c: number, f: 0 | 1) => void;
}) {
  const cols = round.categories.length;
  const c = Math.min(cat, cols - 1);
  const category = round.categories[c];
  const rows = round.values.length;
  const iconBtn = "grid h-10 w-10 place-items-center rounded-lg bg-white/10 text-base disabled:opacity-30";
  return (
    <div className="flex flex-col gap-3">
      <div className="no-scrollbar -mx-3 flex gap-1.5 overflow-x-auto px-3 pb-1" role="tablist" aria-label="Categories">
        {round.categories.map((k, i) => {
          const done = k.clues.filter(isPlayable).length;
          return (
            <button
              key={k.id}
              role="tab"
              aria-selected={i === c}
              onClick={() => setCat(i)}
              className={`flex shrink-0 flex-col items-start rounded-xl border px-3 py-1.5 text-left ${i === c ? "border-gold bg-[var(--board)] text-white" : "border-line bg-panel text-white/70"}`}
            >
              <span className="max-w-36 truncate text-sm font-semibold">{k.name.trim() || `Category ${i + 1}`}</span>
              <span className={`text-xs ${done === rows ? "text-green-400" : "text-white/50"}`}>
                {done}/{rows}
              </span>
            </button>
          );
        })}
        {canAddCategory && (
          <button
            className="shrink-0 rounded-xl border border-dashed border-line px-3 text-sm text-white/60"
            onClick={() => {
              onAddCategory();
              setCat(cols);
            }}
          >
            + Add
          </button>
        )}
      </div>

      <div className="flex flex-col gap-2 rounded-xl bg-[var(--board)] p-2">
        <textarea
          data-cat={c}
          rows={2}
          maxLength={200}
          value={category.name}
          placeholder={`Category ${c + 1} name`}
          onChange={(e) => onName(c, e.target.value)}
          className="cat-text resize-none rounded-lg border border-white/20 bg-black/20 px-2 py-2 text-center text-lg text-white outline-none placeholder:text-white/40 focus:border-gold"
        />
        <div className="flex items-center gap-2 text-sm text-white/70">
          <button className={iconBtn} aria-label="Move category earlier" onClick={() => (onMove(c, c - 1), setCat(c - 1))} disabled={c === 0}>
            ◀
          </button>
          <span className="flex-1 text-center">
            Column {c + 1} of {cols}
          </span>
          <button className={iconBtn} aria-label="Move category later" onClick={() => (onMove(c, c + 1), setCat(c + 1))} disabled={c === cols - 1}>
            ▶
          </button>
          <button className={`${iconBtn} text-red-300`} aria-label="Delete category" onClick={() => onRemove(c)} disabled={cols <= 1}>
            ✕
          </button>
        </div>
      </div>

      {round.values.map((value, r) => {
        const q = category.clues[r];
        return (
          <div key={q.id} className={`flex flex-col gap-2 rounded-xl border bg-panel p-2.5 ${q.dailyDouble ? "border-gold/70" : "border-line"}`}>
            <div className="flex items-center gap-2">
              <span className="money text-xl">${value}</span>
              {q.dailyDouble && <span className="rounded bg-gold px-1.5 text-xs font-bold text-black">DD</span>}
              {(q.media || q.answerMedia) && <span title="Has media">🖼</span>}
              <span className="flex-1" />
              <button className={iconBtn} aria-label="Swap with the clue above" onClick={() => onSwap({ c, r }, { c, r: r - 1 })} disabled={r === 0}>
                ▲
              </button>
              <button className={iconBtn} aria-label="Swap with the clue below" onClick={() => onSwap({ c, r }, { c, r: r + 1 })} disabled={r === rows - 1}>
                ▼
              </button>
              <button className={`${iconBtn} !w-auto px-3 text-sm`} onClick={() => onOpen(c, r)}>
                More
              </button>
            </div>
            <textarea
              data-nav={`${r}-${c}-0`}
              rows={3}
              maxLength={2000}
              value={q.text}
              placeholder="Clue"
              aria-label={`$${value} clue`}
              onChange={(e) => onPatch(c, r, { text: e.target.value })}
              onKeyDown={(e) => onFieldKey(e, r, c, 0)}
              className="resize-none rounded-lg border border-transparent bg-black/25 px-2.5 py-2 text-base outline-none placeholder:text-white/30 focus:border-gold"
            />
            <input
              data-nav={`${r}-${c}-1`}
              maxLength={1000}
              value={q.answer}
              placeholder="Answer"
              aria-label={`$${value} answer`}
              enterKeyHint="next"
              onChange={(e) => onPatch(c, r, { answer: e.target.value })}
              onKeyDown={(e) => onFieldKey(e, r, c, 1)}
              className="rounded-lg border border-transparent bg-black/25 px-2.5 py-2 text-base text-gold outline-none placeholder:text-white/30 focus:border-gold"
            />
          </div>
        );
      })}

      <div className="flex gap-2">
        <button className="btn-ghost flex-1" onClick={() => setCat(c - 1)} disabled={c === 0}>
          ← Previous
        </button>
        <button className="btn-ghost flex-1" onClick={() => setCat(c + 1)} disabled={c === cols - 1}>
          Next category →
        </button>
      </div>
    </div>
  );
}
