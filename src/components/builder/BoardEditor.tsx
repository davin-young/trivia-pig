"use client";

import { useCallback, useEffect, useRef, useState } from "react";
import Link from "next/link";
import { useRouter } from "next/navigation";
import {
  DOUBLE_VALUES,
  SINGLE_VALUES,
  emptyClue,
  makeRound,
  newId,
  normalizeRound,
  type BoardContent,
  type Clue,
  type Round,
} from "@/shared/board";
import { ClueEditor } from "./ClueEditor";
import { MediaPicker, uploadFile } from "./MediaPicker";
import { BulkPasteDialog, DetailsDialog, ImportBoardButton, ShareDialog, VersionsDialog, type BoardMeta } from "./dialogs";
import { ChecklistDialog, PhoneRound, ThemeDialog, useNarrow } from "./extras";
import { checkBoard, type BoardIssue } from "@/shared/boardCheck";
import { themeVars } from "@/shared/theme";

export interface EditorBoard {
  id: string;
  title: string;
  description: string;
  tags: string[];
  folder: string;
  content: BoardContent;
  shareToken: string | null;
  shareMode: "VIEW" | "COPY";
  listed?: boolean;
  /** Content revision loaded from the server (absent in guest mode). */
  rev?: number;
}

/** Where a guest's board lives until they sign in. */
export const GUEST_DRAFT_KEY = "tp:guest-board";

type Tab = number | "final";
type SaveStatus = "saved" | "dirty" | "saving" | "error";
type Drag = { type: "cat"; c: number } | { type: "clue"; c: number; r: number } | null;

const MAX_ROUNDS = 4;
const MAX_COLS = 12;

/**
 * `guest`: no account. The board autosaves to this browser only, and anything
 * that needs the server (play, share, history, uploads) asks the person to sign in.
 */
export function BoardEditor({ board, guest = false }: { board: EditorBoard; guest?: boolean }) {
  const router = useRouter();
  const rev = useRef<number | undefined>(board.rev);
  const [conflict, setConflict] = useState(false);
  const [content, setContent] = useState<BoardContent>(board.content);
  const [meta, setMeta] = useState<BoardMeta>({ title: board.title, description: board.description, tags: board.tags, folder: board.folder });
  const [tab, setTab] = useState<Tab>(board.content.rounds.length ? 0 : "final");
  const [editing, setEditing] = useState<{ c: number; r: number } | null>(null);
  const [dialog, setDialog] = useState<"bulk" | "details" | "share" | "versions" | "theme" | "check" | "check-play" | null>(null);
  const narrow = useNarrow();
  const [phoneCat, setPhoneCat] = useState(0);
  const [status, setStatus] = useState<SaveStatus>("saved");
  const [saveError, setSaveError] = useState<string | null>(null);
  const [drag, setDrag] = useState<Drag>(null);
  const [starting, setStarting] = useState(false);

  // ------------------------------------------------------------- autosave
  const latest = useRef({ content, meta });
  latest.current = { content, meta };
  const dirty = useRef(false);
  const timer = useRef<ReturnType<typeof setTimeout> | null>(null);
  const chain = useRef<Promise<void>>(Promise.resolve());
  const first = useRef(true);

  const body = (baseRev?: number) =>
    JSON.stringify({
      baseRev,
      content: latest.current.content,
      title: latest.current.meta.title,
      description: latest.current.meta.description,
      tags: latest.current.meta.tags,
      folder: latest.current.meta.folder,
    });

  const flush = useCallback((): Promise<void> => {
    if (timer.current) clearTimeout(timer.current);
    timer.current = null;
    if (!dirty.current) return chain.current;
    dirty.current = false;
    chain.current = chain.current.then(async () => {
      setStatus("saving");
      try {
        if (guest) {
          localStorage.setItem(GUEST_DRAFT_KEY, body());
        } else {
          const res = await fetch(`/api/boards/${board.id}`, { method: "PUT", headers: { "content-type": "application/json" }, body: body(rev.current) });
          const data = await res.json().catch(() => ({}));
          if (res.status === 409 && data.conflict) setConflict(true);
          if (!res.ok) throw new Error(data.error ?? `Save failed (${res.status})`);
          if (typeof data.rev === "number") rev.current = data.rev;
          setConflict(false);
        }
        setSaveError(null);
        setStatus(dirty.current ? "dirty" : "saved");
      } catch (e) {
        dirty.current = true;
        setSaveError((e as Error).message);
        setStatus("error");
      }
    });
    return chain.current;
  }, [board.id, guest]);

  /** Keep my version: save over whatever changed elsewhere. */
  const overwrite = useCallback(() => {
    rev.current = undefined;
    dirty.current = true;
    setConflict(false);
    void flush();
  }, [flush]);

  useEffect(() => {
    if (first.current) {
      first.current = false;
      return;
    }
    dirty.current = true;
    setStatus("dirty");
    if (timer.current) clearTimeout(timer.current);
    timer.current = setTimeout(() => void flush(), 800);
  }, [content, meta, flush]);

  useEffect(() => {
    const onUnload = (e: BeforeUnloadEvent) => {
      if (!dirty.current) return;
      if (guest) {
        try {
          localStorage.setItem(GUEST_DRAFT_KEY, body());
        } catch {}
        return;
      }
      // Best effort save; also ask the browser to confirm leaving.
      void fetch(`/api/boards/${board.id}`, { method: "PUT", headers: { "content-type": "application/json" }, body: body(rev.current), keepalive: true });
      e.preventDefault();
    };
    window.addEventListener("beforeunload", onUnload);
    return () => window.removeEventListener("beforeunload", onUnload);
  }, [board.id, guest]);

  // -------------------------------------------------------------- mutation
  const mutate = useCallback((fn: (d: BoardContent) => void) => {
    setContent((prev) => {
      const d = structuredClone(prev);
      fn(d);
      return d;
    });
  }, []);

  const round = typeof tab === "number" ? content.rounds[tab] : null;

  const patchClue = (c: number, r: number, patch: Partial<Clue>) =>
    mutate((d) => {
      if (typeof tab !== "number") return;
      Object.assign(d.rounds[tab].categories[c].clues[r], patch);
    });

  const setCategoryName = (c: number, name: string) =>
    mutate((d) => {
      if (typeof tab === "number") d.rounds[tab].categories[c].name = name;
    });

  function addRound() {
    if (content.rounds.length >= MAX_ROUNDS) return;
    const kind = content.rounds.length === 0 ? "single" : "double";
    const cols = content.rounds.at(-1)?.categories.length ?? 6;
    const idx = content.rounds.length;
    mutate((d) => {
      d.rounds.push(makeRound(kind, cols, kind === "single" ? SINGLE_VALUES : DOUBLE_VALUES, idx >= 2 ? `Round ${idx + 1}` : undefined));
    });
    setTab(idx);
  }

  function removeRound(i: number) {
    if (!confirm(`Delete ${content.rounds[i].name} and all its clues?`)) return;
    mutate((d) => {
      d.rounds.splice(i, 1);
    });
    setTab(content.rounds.length > 1 ? Math.max(0, i - 1) : "final");
  }

  function setValues(text: string) {
    if (typeof tab !== "number" || !round) return;
    const values = text
      .split(/[,\s]+/)
      .map((v) => parseInt(v.replace(/[$]/g, ""), 10))
      .filter((v) => Number.isFinite(v) && v >= 0)
      .slice(0, 12);
    if (!values.length) return;
    const losing = round.categories.some((c) => c.clues.slice(values.length).some((q) => q.text || q.answer || q.media));
    if (losing && !confirm("Removing rows will delete the clues in them. Continue?")) return;
    mutate((d) => {
      const r = d.rounds[tab as number];
      r.values = values;
      d.rounds[tab as number] = normalizeRound(r);
    });
  }

  function addCategory() {
    if (typeof tab !== "number" || !round || round.categories.length >= MAX_COLS) return;
    mutate((d) => {
      const r = d.rounds[tab as number];
      r.categories.push({ id: newId("k"), name: "", clues: r.values.map(() => emptyClue()) });
    });
  }

  function removeCategory(c: number) {
    if (typeof tab !== "number" || !round) return;
    const cat = round.categories[c];
    if (round.categories.length <= 1) return;
    if ((cat.name || cat.clues.some((q) => q.text || q.answer)) && !confirm(`Delete category "${cat.name || "untitled"}" and its clues?`)) return;
    mutate((d) => {
      d.rounds[tab as number].categories.splice(c, 1);
    });
  }

  function moveCategory(from: number, to: number) {
    if (typeof tab !== "number" || !round || from === to || to < 0 || to >= round.categories.length) return;
    mutate((d) => {
      const cats = d.rounds[tab as number].categories;
      const [cat] = cats.splice(from, 1);
      cats.splice(to, 0, cat);
    });
  }

  function swapClues(a: { c: number; r: number }, b: { c: number; r: number }) {
    if (typeof tab !== "number") return;
    mutate((d) => {
      const cats = d.rounds[tab as number].categories;
      const x = cats[a.c].clues[a.r];
      cats[a.c].clues[a.r] = cats[b.c].clues[b.r];
      cats[b.c].clues[b.r] = x;
    });
  }

  // ------------------------------------------------------------ keyboard nav
  function focusField(r: number, c: number, f: 0 | 1) {
    const el = document.querySelector<HTMLElement>(`[data-nav="${r}-${c}-${f}"]`);
    el?.focus();
  }

  function onFieldKey(e: React.KeyboardEvent, r: number, c: number, f: 0 | 1) {
    if (!round) return;
    const rows = round.values.length;
    const cols = round.categories.length;
    if (e.key === "Enter" && (e.ctrlKey || e.metaKey)) {
      e.preventDefault();
      setEditing({ c, r });
      return;
    }
    if (e.key === "Enter" && !e.shiftKey) {
      e.preventDefault();
      if (r + 1 < rows) focusField(r + 1, c, f);
      else if (c + 1 < cols) focusField(0, c + 1, f);
      return;
    }
    if (e.altKey && e.key.startsWith("Arrow")) {
      e.preventDefault();
      if (e.key === "ArrowDown" && r + 1 < rows) focusField(r + 1, c, f);
      if (e.key === "ArrowUp") (r > 0 ? focusField(r - 1, c, f) : document.querySelector<HTMLElement>(`[data-cat="${c}"]`)?.focus());
      if (e.key === "ArrowRight" && c + 1 < cols) focusField(r, c + 1, f);
      if (e.key === "ArrowLeft" && c > 0) focusField(r, c - 1, f);
    }
  }

  function stepEditor(delta: 1 | -1) {
    if (!editing || !round) return;
    const rows = round.values.length;
    const cols = round.categories.length;
    let idx = editing.c * rows + editing.r + delta;
    if (idx < 0) idx = cols * rows - 1;
    if (idx >= cols * rows) {
      setEditing(null);
      return;
    }
    setEditing({ c: Math.floor(idx / rows), r: idx % rows });
  }

  // ------------------------------------------------------------------ misc
  async function startGame(skipCheck = false) {
    if (!skipCheck && !guest && issues.length) return setDialog("check-play");
    setDialog(null);
    setStarting(true);
    await flush();
    if (guest) return router.push("/login?next=/try/claim");
    const res = await fetch("/api/games", { method: "POST", headers: { "content-type": "application/json" }, body: JSON.stringify({ boardId: board.id }) });
    const data = await res.json().catch(() => ({}));
    setStarting(false);
    if (!res.ok) return alert(data.error ?? "Couldn't start a game");
    router.push(`/host/${data.code}`);
  }

  const issues = checkBoard(content);

  /** Go to the cell (or field) an issue points at. */
  function jump(at: BoardIssue["at"]) {
    setDialog(null);
    setTab(at.tab);
    if (at.c !== undefined) setPhoneCat(at.c);
    setTimeout(() => {
      const sel = at.c === undefined ? null : at.field === "name" || at.r === undefined ? `[data-cat="${at.c}"]` : `[data-nav="${at.r}-${at.c}-${at.field === "answer" ? 1 : 0}"]`;
      const el = sel ? document.querySelector<HTMLElement>(sel) : null;
      el?.scrollIntoView({ block: "center", behavior: "smooth" });
      el?.focus({ preventScroll: true });
    }, 60);
  }

  const filled = content.rounds.reduce((n, r) => n + r.categories.reduce((m, c) => m + c.clues.filter((q) => q.text.trim()).length, 0), 0);
  const total = content.rounds.reduce((n, r) => n + r.categories.length * r.values.length, 0);

  return (
    <div className="mx-auto flex max-w-[1400px] flex-col gap-3 px-3 py-4 sm:px-4">
      {/* toolbar */}
      <div className="flex flex-wrap items-center gap-2">
        <input
          className="min-w-0 flex-1 rounded-lg border border-transparent bg-transparent px-2 py-1 text-2xl font-bold outline-none hover:border-line focus:border-gold"
          value={meta.title}
          maxLength={120}
          aria-label="Board title"
          onChange={(e) => setMeta({ ...meta, title: e.target.value })}
          onBlur={() => !meta.title.trim() && setMeta({ ...meta, title: "Untitled board" })}
        />
        <SaveBadge status={status} error={saveError} onRetry={() => void flush()} guest={guest} />
      </div>
      {conflict && (
        <div className="flex flex-wrap items-center gap-2 rounded-xl border border-red-500/60 bg-red-600/15 p-3 text-sm" role="alert">
          <span className="min-w-0 flex-1">
            <b>This board was changed somewhere else</b> (another tab, a co-host, or a typo fix made during a game). Your latest edits here are not saved yet.
          </span>
          <button className="btn-ghost !py-1.5" onClick={() => window.location.reload()}>Load the other version</button>
          <button className="btn-primary !py-1.5" onClick={overwrite}>Keep mine</button>
        </div>
      )}
      {guest && (
        <div className="flex flex-wrap items-center gap-2 rounded-xl border border-gold/50 bg-gold/10 p-3 text-sm">
          <span className="min-w-0 flex-1">
            <b>You are trying the builder without an account.</b> This board is saved in this browser only. Sign in to keep it, add images, and host a game with it.
          </span>
          <button className="btn-primary !py-1.5" onClick={() => void startGame()}>Sign in to save & host</button>
        </div>
      )}
      <div className="flex flex-wrap items-center gap-2 text-sm no-scrollbar max-sm:-mx-3 max-sm:flex-nowrap max-sm:overflow-x-auto max-sm:px-3 [&>*]:shrink-0">
        <button className="btn-primary !py-2" onClick={() => void startGame()} disabled={starting}>
          {starting ? "Starting…" : guest ? "▶ Sign in to play" : "▶ Play"}
        </button>
        {!guest && (
          <button
            className="btn-ghost !py-2"
            onClick={async () => {
              await flush();
              window.open(`/boards/${board.id}/preview`, "_blank");
            }}
          >
            👁 Preview
          </button>
        )}
        <button
          className={`btn-ghost !py-2 ${issues.length ? (issues[0].level === "error" ? "!text-red-300" : "!text-amber-300") : "!text-green-400"}`}
          onClick={() => setDialog("check")}
          title={`${filled}/${total} clues filled`}
        >
          {issues.length ? `⚠ ${issues.length} to check` : "✓ Ready to play"}
        </button>
        <button className="btn-ghost !py-2" onClick={() => setDialog("theme")}>
          🎨 Theme
        </button>
        <button className="btn-ghost !py-2" onClick={() => setDialog("details")}>
          ✎ Details
        </button>
        {!guest && (
          <button className="btn-ghost !py-2" onClick={() => setDialog("share")}>
            🔗 Share
          </button>
        )}
        {!guest && (
          <button className="btn-ghost !py-2" onClick={() => setDialog("versions")}>
            🕘 History
          </button>
        )}
        {round && (
          <button className="btn-ghost !py-2" onClick={() => setDialog("bulk")}>
            📋 Bulk paste
          </button>
        )}
        {!guest && (
          <a className="btn-ghost !py-2" href={`/api/boards/${board.id}/export`}>
            ⬇ Export JSON
          </a>
        )}
        {!guest && <ImportBoardButton className="btn-ghost !py-2" label="⬆ Import as new" />}
        <span className="ml-auto text-white/40 max-sm:hidden">
          {filled}/{total} clues filled
        </span>
      </div>

      {/* round tabs */}
      <div className="flex flex-wrap items-center gap-1 border-b border-line no-scrollbar max-sm:-mx-3 max-sm:flex-nowrap max-sm:overflow-x-auto max-sm:overflow-y-hidden max-sm:px-3 max-sm:pt-px [&>*]:shrink-0">
        {content.rounds.map((r, i) => (
          <button
            key={r.id}
            onClick={() => setTab(i)}
            className={`-mb-px rounded-t-lg border px-4 py-2 text-sm font-semibold ${tab === i ? "border-line border-b-[var(--ui-bg)] bg-ui-bg text-gold" : "border-transparent text-white/60 hover:text-white"}`}
          >
            {r.name || `Round ${i + 1}`}
          </button>
        ))}
        <button
          onClick={() => {
            if (!content.final) mutate((d) => void (d.final = { category: "", text: "", answer: "", media: null, answerMedia: null }));
            setTab("final");
          }}
          className={`-mb-px rounded-t-lg border px-4 py-2 text-sm font-semibold ${tab === "final" ? "border-line border-b-[var(--ui-bg)] bg-ui-bg text-gold" : "border-transparent text-white/60 hover:text-white"}`}
        >
          {content.final ? "Final Jeopardy" : "+ Final"}
        </button>
        {content.rounds.length < MAX_ROUNDS && (
          <button onClick={addRound} className="px-3 py-2 text-sm text-white/50 hover:text-white">
            + Round
          </button>
        )}
      </div>

      {round && typeof tab === "number" && (
        <>
          <RoundSettings
            key={round.id}
            round={round}
            onName={(name) => mutate((d) => void (d.rounds[tab].name = name))}
            onKind={(kind) => mutate((d) => void (d.rounds[tab].kind = kind))}
            onValues={setValues}
            onAddCategory={addCategory}
            onRemoveRound={() => removeRound(tab)}
            canAddCategory={round.categories.length < MAX_COLS}
          />
          {narrow && (
            <div style={themeVars(content.theme)}>
              <PhoneRound
                round={round}
                cat={phoneCat}
                setCat={setPhoneCat}
                canAddCategory={round.categories.length < MAX_COLS}
                onAddCategory={addCategory}
                onName={setCategoryName}
                onMove={moveCategory}
                onRemove={removeCategory}
                onPatch={patchClue}
                onSwap={swapClues}
                onOpen={(c, r) => setEditing({ c, r })}
                onFieldKey={onFieldKey}
              />
            </div>
          )}
          <div className={`overflow-x-auto pb-2 ${narrow ? "hidden" : ""}`} style={themeVars(content.theme)}>
            {!narrow && <div
              className="grid gap-1.5"
              style={{ gridTemplateColumns: `repeat(${round.categories.length}, minmax(170px, 1fr))`, minWidth: round.categories.length * 176 }}
            >
              {round.categories.map((cat, c) => (
                <div
                  key={cat.id}
                  onDragOver={(e) => drag?.type === "cat" && e.preventDefault()}
                  onDrop={() => {
                    if (drag?.type === "cat") moveCategory(drag.c, c);
                    setDrag(null);
                  }}
                  className={`flex flex-col gap-1 rounded-lg bg-[var(--board)] p-1.5 ${drag?.type === "cat" && drag.c !== c ? "outline-2 outline-dashed outline-gold/50" : ""}`}
                >
                  <div className="flex items-center gap-1">
                    <span
                      draggable
                      onDragStart={(e) => {
                        e.dataTransfer.effectAllowed = "move";
                        setDrag({ type: "cat", c });
                      }}
                      onDragEnd={() => setDrag(null)}
                      className="cursor-grab px-1 text-white/40 select-none active:cursor-grabbing"
                      title="Drag to reorder categories"
                    >
                      ⠿
                    </span>
                    <button className="px-1 text-xs text-white/40 hover:text-white" title="Move left" onClick={() => moveCategory(c, c - 1)} disabled={c === 0}>
                      ◀
                    </button>
                    <button className="px-1 text-xs text-white/40 hover:text-white" title="Move right" onClick={() => moveCategory(c, c + 1)} disabled={c === round.categories.length - 1}>
                      ▶
                    </button>
                    <button className="ml-auto px-1 text-xs text-white/40 hover:text-red-300" title="Delete category" onClick={() => removeCategory(c)} disabled={round.categories.length <= 1}>
                      ✕
                    </button>
                  </div>
                </div>
              ))}
              {/* category names */}
              {round.categories.map((cat, c) => (
                <textarea
                  key={`n-${cat.id}`}
                  data-cat={c}
                  rows={2}
                  maxLength={200}
                  value={cat.name}
                  placeholder={`Category ${c + 1}`}
                  onChange={(e) => setCategoryName(c, e.target.value)}
                  onKeyDown={(e) => {
                    if (e.key === "Enter" && !e.shiftKey) {
                      e.preventDefault();
                      focusField(0, c, 0);
                    }
                  }}
                  className="cat-text resize-none rounded-lg border border-transparent bg-[var(--board)] px-2 py-2 text-center text-sm text-white outline-none placeholder:text-white/30 focus:border-gold"
                />
              ))}
              {/* clue cells, row-major so Tab moves across a row */}
              {round.values.flatMap((value, r) =>
                round.categories.map((cat, c) => {
                  const q = cat.clues[r];
                  const isDropTarget = drag?.type === "clue" && !(drag.c === c && drag.r === r);
                  return (
                    <div
                      key={`${cat.id}-${r}`}
                      onDragOver={(e) => drag?.type === "clue" && e.preventDefault()}
                      onDrop={() => {
                        if (drag?.type === "clue") swapClues({ c: drag.c, r: drag.r }, { c, r });
                        setDrag(null);
                      }}
                      className={`flex flex-col gap-1 rounded-lg border bg-panel p-1.5 ${q.dailyDouble ? "border-gold/70" : "border-line"} ${isDropTarget ? "outline-2 outline-dashed outline-gold/50" : ""}`}
                    >
                      <div className="flex items-center gap-1 text-xs">
                        <span
                          draggable
                          onDragStart={(e) => {
                            e.dataTransfer.effectAllowed = "move";
                            setDrag({ type: "clue", c, r });
                          }}
                          onDragEnd={() => setDrag(null)}
                          className="cursor-grab px-0.5 text-white/30 select-none"
                          title="Drag onto another cell to swap"
                        >
                          ⠿
                        </span>
                        <span className="money text-sm">${value}</span>
                        {q.dailyDouble && <span className="rounded bg-gold px-1 text-[10px] font-bold text-black">DD</span>}
                        {(q.media || q.answerMedia) && <span title="Has media">🖼</span>}
                        <button className="ml-auto rounded px-1.5 text-white/50 hover:bg-white/10 hover:text-white" onClick={() => setEditing({ c, r })} title="Open full editor (Ctrl+Enter)">
                          ⋯
                        </button>
                      </div>
                      <textarea
                        data-nav={`${r}-${c}-0`}
                        rows={2}
                        maxLength={2000}
                        value={q.text}
                        placeholder="Clue"
                        aria-label={`${cat.name || `Category ${c + 1}`} $${value} clue`}
                        onChange={(e) => patchClue(c, r, { text: e.target.value })}
                        onKeyDown={(e) => onFieldKey(e, r, c, 0)}
                        onPaste={async (e) => {
                          const file = [...e.clipboardData.files].find((f) => f.type.startsWith("image/"));
                          if (!file) return;
                          e.preventDefault();
                          try {
                            patchClue(c, r, { media: await uploadFile(file) });
                          } catch (err) {
                            alert((err as Error).message);
                          }
                        }}
                        className="resize-none rounded border border-transparent bg-black/20 px-1.5 py-1 text-sm outline-none placeholder:text-white/25 focus:border-gold"
                      />
                      <input
                        data-nav={`${r}-${c}-1`}
                        maxLength={1000}
                        value={q.answer}
                        placeholder="Answer"
                        aria-label={`${cat.name || `Category ${c + 1}`} $${value} answer`}
                        onChange={(e) => patchClue(c, r, { answer: e.target.value })}
                        onKeyDown={(e) => onFieldKey(e, r, c, 1)}
                        className="rounded border border-transparent bg-black/20 px-1.5 py-1 text-sm text-gold outline-none placeholder:text-white/25 focus:border-gold"
                      />
                    </div>
                  );
                }),
              )}
            </div>}
          </div>
          <p className="text-xs text-white/40 max-sm:hidden">
            Tab / Shift+Tab move between fields · Enter moves down · Alt+Arrows move around · Ctrl+Enter opens the full editor (media, Daily Double) · drag ⠿ to reorder · changes save automatically
          </p>
        </>
      )}

      {tab === "final" && content.final && (
        <FinalEditor
          final={content.final}
          onChange={(patch) => mutate((d) => void (d.final = { ...d.final!, ...patch }))}
          onRemove={() => {
            if (!confirm("Remove Final Jeopardy from this board?")) return;
            mutate((d) => void (d.final = null));
            setTab(content.rounds.length ? 0 : "final");
          }}
        />
      )}
      {tab === "final" && !content.final && (
        <div className="card text-center text-white/60">
          This board has no rounds yet.{" "}
          <button className="text-gold underline" onClick={addRound}>
            Add a round
          </button>
        </div>
      )}

      {editing && round && round.categories[editing.c]?.clues[editing.r] && (
        <ClueEditor
          clue={round.categories[editing.c].clues[editing.r]}
          category={round.categories[editing.c].name}
          value={round.values[editing.r]}
          onChange={(patch) => patchClue(editing.c, editing.r, patch)}
          onClose={() => {
            const at = editing;
            setEditing(null);
            setTimeout(() => focusField(at.r, at.c, 0), 0);
          }}
          onNext={() => stepEditor(1)}
          onPrev={() => stepEditor(-1)}
        />
      )}
      {dialog === "bulk" && round && typeof tab === "number" && (
        <BulkPasteDialog round={round} onClose={() => setDialog(null)} onApply={(r) => mutate((d) => void (d.rounds[tab] = r))} />
      )}
      {dialog === "theme" && <ThemeDialog theme={content.theme} onChange={(t) => mutate((d) => void (d.theme = t))} onClose={() => setDialog(null)} />}
      {(dialog === "check" || dialog === "check-play") && (
        <ChecklistDialog issues={issues} filled={filled} total={total} aboutToPlay={dialog === "check-play"} onJump={jump} onPlay={() => void startGame(true)} onClose={() => setDialog(null)} />
      )}
      {dialog === "details" && <DetailsDialog meta={meta} onSave={setMeta} onClose={() => setDialog(null)} />}
      {dialog === "share" && <ShareDialog boardId={board.id} initial={{ token: board.shareToken, mode: board.shareMode, listed: !!board.listed }} onClose={() => setDialog(null)} />}
      {dialog === "versions" && <VersionsDialog boardId={board.id} onClose={() => setDialog(null)} beforeRestore={flush} />}

      <div className="pt-4 text-sm">
        <Link href="/dashboard" className="text-white/50 hover:text-white">
          ← Back to boards
        </Link>
      </div>
    </div>
  );
}

function SaveBadge({ status, error, onRetry, guest }: { status: SaveStatus; error: string | null; onRetry: () => void; guest?: boolean }) {
  if (status === "error")
    return (
      <button onClick={onRetry} className="rounded-full bg-red-600/20 px-3 py-1 text-sm text-red-300" title={error ?? ""}>
        ⚠ Not saved — retry
      </button>
    );
  const map: Record<Exclude<SaveStatus, "error">, [string, string]> = {
    saved: [guest ? "✓ Saved in this browser" : "✓ Saved", "text-green-400"],
    dirty: ["Editing…", "text-white/50"],
    saving: ["Saving…", "text-white/60"],
  };
  const [label, cls] = map[status];
  return (
    <span className={`text-sm ${cls}`} aria-live="polite">
      {label}
    </span>
  );
}

function RoundSettings({
  round,
  onName,
  onKind,
  onValues,
  onAddCategory,
  onRemoveRound,
  canAddCategory,
}: {
  round: Round;
  onName: (s: string) => void;
  onKind: (k: Round["kind"]) => void;
  onValues: (s: string) => void;
  onAddCategory: () => void;
  onRemoveRound: () => void;
  canAddCategory: boolean;
}) {
  const [values, setValuesText] = useState(round.values.join(", "));
  useEffect(() => setValuesText(round.values.join(", ")), [round.values]);
  const preset = round.kind === "double" ? DOUBLE_VALUES : SINGLE_VALUES;
  return (
    <div className="flex flex-wrap items-end gap-3 rounded-xl border border-line bg-panel p-3 text-sm max-sm:grid max-sm:grid-cols-2 max-sm:gap-2">
      <label className="flex flex-col gap-1">
        <span className="text-white/60">Round name</span>
        <input className="input !w-48 !py-1.5 max-sm:!w-full" value={round.name} maxLength={80} onChange={(e) => onName(e.target.value)} />
      </label>
      <label className="flex flex-col gap-1">
        <span className="text-white/60">Type</span>
        <select className="input !w-36 !py-1.5 max-sm:!w-full" value={round.kind} onChange={(e) => onKind(e.target.value as Round["kind"])}>
          <option value="single">Single</option>
          <option value="double">Double</option>
        </select>
      </label>
      <label className="flex min-w-56 flex-1 flex-col gap-1 max-sm:col-span-2 max-sm:min-w-0">
        <span className="text-white/60">Point values (one per row)</span>
        <input
          className="input !py-1.5"
          value={values}
          onChange={(e) => setValuesText(e.target.value)}
          onBlur={() => onValues(values)}
          onKeyDown={(e) => e.key === "Enter" && onValues(values)}
          placeholder={preset.join(", ")}
        />
      </label>
      <button className="btn-ghost !py-1.5" onClick={() => onValues(preset.join(","))} title="Reset to standard values">
        Standard
      </button>
      <button className="btn-ghost !py-1.5" onClick={onAddCategory} disabled={!canAddCategory}>
        + Category
      </button>
      <button className="btn-ghost !py-1.5 text-red-300" onClick={onRemoveRound}>
        Delete round
      </button>
    </div>
  );
}

function FinalEditor({
  final,
  onChange,
  onRemove,
}: {
  final: NonNullable<BoardContent["final"]>;
  onChange: (p: Partial<NonNullable<BoardContent["final"]>>) => void;
  onRemove: () => void;
}) {
  return (
    <div className="grid gap-4 rounded-xl border border-line bg-panel p-4 md:grid-cols-2">
      <div className="flex flex-col gap-3">
        <label className="flex flex-col gap-1">
          <span className="text-sm text-white/70">Category (shown first, while players wager)</span>
          <input className="input cat-text text-lg" maxLength={200} value={final.category} onChange={(e) => onChange({ category: e.target.value })} />
        </label>
        <label className="flex flex-col gap-1">
          <span className="text-sm text-white/70">Clue</span>
          <textarea className="input min-h-28 text-lg" maxLength={2000} value={final.text} onChange={(e) => onChange({ text: e.target.value })} />
        </label>
        <label className="flex flex-col gap-1">
          <span className="text-sm text-white/70">Answer</span>
          <input className="input text-lg text-gold" maxLength={1000} value={final.answer} onChange={(e) => onChange({ answer: e.target.value })} />
        </label>
        <button className="self-start text-sm text-red-300 underline" onClick={onRemove}>
          Remove Final Jeopardy
        </button>
      </div>
      <div className="flex flex-col gap-4">
        <MediaPicker label="Clue media" value={final.media} onChange={(m) => onChange({ media: m })} />
        <MediaPicker label="Answer media" value={final.answerMedia} onChange={(m) => onChange({ answerMedia: m })} />
      </div>
    </div>
  );
}
