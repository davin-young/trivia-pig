"use client";

import { useEffect, useState } from "react";
import Link from "next/link";
import type { BoardCellView } from "@/engine/views";
import { Ink } from "@/components/Ink";
import { MediaView, Signature, TimerBar, contestantName, contestants, formatScore, playerName, useCountdown } from "@/components/game";
import { useTick } from "@/client/useGame";
import { useHost } from "./HostClient";

export function MainPane() {
  const { view } = useHost();
  useShortcuts();
  switch (view.phase) {
    case "lobby":
      return <LobbyControl />;
    case "board":
      return <BoardControl />;
    case "clue":
      return <ClueControl />;
    case "final":
      return <FinalControl />;
    case "finished":
      return <FinishedControl />;
  }
}

/** Keyboard shortcuts for hosts on a laptop. Ignored while typing in a field. */
function useShortcuts() {
  const { view, act, emit } = useHost();
  useEffect(() => {
    const onKey = (e: KeyboardEvent) => {
      const el = e.target as HTMLElement;
      if (el.closest("input, textarea, select, [contenteditable]") || e.metaKey || e.ctrlKey || e.altKey) return;
      const c = view.clue;
      const k = e.key.toLowerCase();
      if (k === " " && c && !c.dailyDouble) {
        e.preventDefault();
        if (c.stage === "reading") void act({ type: "buzzers/unlock" });
        else if (c.stage === "open") void act({ type: "buzzers/lock" });
      } else if (k === "c" && c && (c.answering || c.dailyDouble?.wager != null)) void act({ type: "clue/judge", correct: true });
      else if (k === "x" && c && (c.answering || c.dailyDouble?.wager != null)) void act({ type: "clue/judge", correct: false });
      else if (k === "r" && c && c.stage !== "revealed") void act({ type: "clue/reveal" });
      else if (k === "n" && c && c.stage !== "revealed") void act({ type: "clue/nobody" });
      else if ((k === "b" || k === "escape") && c) void act({ type: "clue/close" });
      else if (k === "p" && view.phase !== "lobby") void act({ type: "game/pause", paused: !view.paused });
      else if (k === "s" && view.phase !== "lobby") void act({ type: "screen/set", screen: view.screen === "scores" ? "none" : "scores" });
      else if (k === "u") void emit("host:undoLast", {});
    };
    window.addEventListener("keydown", onKey);
    return () => window.removeEventListener("keydown", onKey);
  }, [view, act, emit]);
}

// ------------------------------------------------------------------- lobby

function LobbyControl() {
  const { view, act, presence, now } = useHost();
  const left = useCountdown(view.startingAt, now);
  const players = view.players.filter((p) => !p.removed);
  const pending = players.filter((p) => p.signatureHidden && (p.signature || p.avatar));
  const teamMode = view.settings.mode === "team";
  const unassigned = teamMode ? players.filter((p) => !p.teamId) : [];
  return (
    <div className="mx-auto flex max-w-3xl flex-col gap-4">
      <div className="card flex flex-wrap items-center gap-4">
        <div>
          <div className="text-sm text-white/60">Join code</div>
          <div className="money text-5xl tracking-[0.2em]">{view.code}</div>
          <button className="mt-1 text-xs text-white/60 underline" onClick={() => act({ type: "settings/update", settings: { hideCode: !view.settings.hideCode } })}>
            {view.settings.hideCode ? "🤫 Hidden on the big screen — show it" : "Hide the code on the big screen (streaming)"}
          </button>
        </div>
        <div className="text-sm text-white/70">
          Players go to <b>/join</b> on their phones, or scan the QR on the display.
          <div className="mt-1">
            <a className="text-gold underline" href={`/display/${view.code}`} target="_blank" rel="noreferrer">Open the display ↗</a>
            <span className="text-white/40"> — {presence?.display === "online" ? "connected" : "not connected yet"}</span>
          </div>
        </div>
      </div>

      <div className="card">
        <div className="mb-3 flex items-center justify-between">
          <h3 className="font-semibold">
            {players.length} player{players.length === 1 ? "" : "s"} in the lobby
            {view.crowd.count > 0 && <span className="font-normal text-white/60"> · {view.crowd.count} in the audience</span>}
          </h3>
          <button
            className={`btn-ghost !py-1.5 text-sm ${view.lobbyLocked ? "!bg-red-600" : ""}`}
            onClick={() => act({ type: "lobby/lock", locked: !view.lobbyLocked })}
          >
            {view.lobbyLocked ? "🔒 Locked — unlock" : "🔓 Lock lobby"}
          </button>
        </div>
        {pending.length > 0 && (
          <div className="mb-3 flex flex-wrap items-center gap-2 rounded-xl border border-yellow-400/50 bg-yellow-400/10 p-2 text-sm">
            <span className="min-w-0 flex-1">
              <b>{pending.length} drawing{pending.length === 1 ? "" : "s"} waiting for your OK</b> before {pending.length === 1 ? "it shows" : "they show"} on the big screen.
            </span>
            <button className="btn-primary !py-1.5" onClick={() => pending.forEach((p) => void act({ type: "player/hideSignature", playerId: p.id, hidden: false }))}>
              Approve all
            </button>
          </div>
        )}
        <div className="grid max-h-[50dvh] grid-cols-2 gap-2 overflow-y-auto p-1 sm:grid-cols-3">
          {players.map((p) => (
            <div key={p.id} className={`rounded-lg bg-panel-2 p-2 ${p.signatureHidden && (p.signature || p.avatar) ? "ring-2 ring-yellow-400/70" : ""}`}>
              <div className="relative aspect-[5/2] rounded bg-[var(--board-deep)] text-lg">
                <Signature player={p} className="h-full w-full" />
                {p.avatar && (
                  <div className="absolute -right-1 -top-1 h-9 w-9 rounded-full bg-[var(--board-deep)] ring-1 ring-white/30">
                    <Ink drawing={p.avatar} className="h-full w-full" />
                  </div>
                )}
              </div>
              {p.signatureHidden && (p.signature || p.avatar) && (
                <div className="mt-1 flex gap-1 text-xs">
                  <button className="flex-1 rounded bg-green-600 px-2 py-1 font-semibold" onClick={() => act({ type: "player/hideSignature", playerId: p.id, hidden: false })}>Approve</button>
                  <button className="flex-1 rounded bg-white/10 px-2 py-1" onClick={() => act({ type: "player/resetSignature", playerId: p.id })}>Erase</button>
                </div>
              )}
              <div className="mt-1 truncate text-xs text-white/60">{view.vipId === p.id && "👑 "}{p.bot && "🤖 "}{p.name}{teamMode && ` · ${contestantName(view, p.teamId) === "—" ? "no team" : contestantName(view, p.teamId)}`}</div>
            </div>
          ))}
        </div>
        <div className="mt-3 flex flex-wrap items-center gap-2 border-t border-line pt-3 text-sm">
          <span className="text-white/60">Rehearse without a crowd:</span>
          <button className="btn-ghost !py-1.5" onClick={() => act({ type: "bots/add", count: 3 })}>🤖 Add 3 practice bots</button>
          {players.some((p) => p.bot) && <button className="btn-ghost !py-1.5" onClick={() => act({ type: "bots/remove" })}>Remove bots</button>}
          <span className="text-xs text-white/40">Bots buzz, write answers and wager on their own.</span>
        </div>
        {teamMode && (
          <p className="mt-3 text-sm text-white/60">
            Team mode: {view.teams.length} team{view.teams.length === 1 ? "" : "s"}{unassigned.length ? `, ${unassigned.length} unassigned` : ""}. Manage teams under <b>Players</b>.
          </p>
        )}
      </div>

      {left !== null ? (
        <div className="card flex flex-wrap items-center gap-3 !border-gold/60">
          <div className="money text-5xl">{Math.max(1, Math.ceil(left / 1000))}</div>
          <div className="min-w-0 flex-1 text-sm text-white/70">Starting… the big screen is counting down. People can still join.</div>
          <button className="btn-ghost" onClick={() => act({ type: "game/cancelStart" })}>Cancel</button>
          <button className="btn-primary" onClick={() => act({ type: "game/start", now: true })}>Start now</button>
        </div>
      ) : (
        <button
          className="btn-primary py-4 text-xl"
          disabled={teamMode && view.teams.length === 0}
          onClick={() => {
            if (unassigned.length && !confirm(`${unassigned.length} player(s) aren't on a team and won't score. Start anyway?`)) return;
            void act({ type: "game/start" });
          }}
        >
          ▶ Start game
        </button>
      )}
      {view.vipId && left === null && (
        <p className="text-center text-xs text-white/50">
          👑 {players.find((p) => p.id === view.vipId)?.name} was first in and can also start the game from their phone (turn this off in Settings).
        </p>
      )}
      <p className="text-center text-xs text-white/40">Tip: on a laptop, Space opens/locks buzzers, C/X judge, R reveals, N = nobody, B = back to board, S = scoreboard, U = undo.</p>
    </div>
  );
}

// ------------------------------------------------------------------- board

function BoardControl() {
  const { view, act } = useHost();
  const [sel, setSel] = useState<{ cell: BoardCellView; cat: string } | null>(null);
  const board = view.board;
  if (!board) return null;
  const cols = board.categories.length;
  return (
    <div className="flex h-full flex-col gap-2">
      <div className="flex flex-wrap items-center gap-2 text-sm">
        <span className="font-semibold">{view.rounds[view.roundIndex]?.name}</span>
        <span className="text-white/50">Control: <b className="text-gold">{contestantName(view, view.controlId)}</b></span>
        <span className="ml-auto text-white/40">Tap a clue to open it</span>
      </div>
      {view.roundComplete && (
        <div className="flex flex-wrap items-center gap-2 rounded-xl border border-gold/50 bg-gold/10 p-3">
          <span className="font-semibold">Round complete!</span>
          {view.roundIndex + 1 < view.rounds.length && (
            <button className="btn-primary" onClick={() => act({ type: "round/set", index: view.roundIndex + 1 })}>
              Next: {view.rounds[view.roundIndex + 1].name} →
            </button>
          )}
          {view.roundIndex + 1 >= view.rounds.length && view.hasFinal && (
            <button className="btn-primary" onClick={() => act({ type: "final/start" })}>Final Jeopardy →</button>
          )}
          {view.roundIndex + 1 >= view.rounds.length && !view.hasFinal && (
            <button className="btn-primary" onClick={() => confirm("End the game?") && act({ type: "game/end" })}>End game 🏁</button>
          )}
        </div>
      )}
      <div className="grid min-h-[300px] flex-1 gap-1" style={{ gridTemplateColumns: `repeat(${cols}, minmax(0, 1fr))` }}>
        {board.categories.map((cat) => (
          <div key={cat.id} className="flex min-w-0 flex-col gap-1">
            <div className="grid min-h-12 place-items-center rounded bg-[var(--board)] p-1 text-center text-[11px] font-bold uppercase leading-tight sm:text-xs">{cat.name}</div>
            {cat.clues.map((cell) => (
              <button
                key={cell.id}
                disabled={!cell.playable}
                onClick={() => setSel({ cell, cat: cat.name })}
                className={`relative flex min-h-14 flex-1 flex-col items-center justify-center rounded p-1 text-center transition ${
                  cell.used ? "bg-panel-2 text-white/30" : "bg-[var(--board)] hover:brightness-125"
                } disabled:opacity-20`}
              >
                <span className={`money text-lg sm:text-2xl ${cell.used ? "!text-white/30" : ""}`}>${cell.value}</span>
                {cell.dailyDouble && <span className="absolute right-0.5 top-0.5 rounded bg-gold px-1 text-[9px] font-bold text-black">DD</span>}
                <span className="line-clamp-2 hidden text-[10px] leading-tight text-white/60 lg:block">{cell.answer}</span>
              </button>
            ))}
          </div>
        ))}
      </div>
      {sel && <CellSheet sel={sel} onClose={() => setSel(null)} />}
    </div>
  );
}

function CellSheet({ sel, onClose }: { sel: { cell: BoardCellView; cat: string }; onClose: () => void }) {
  const { act } = useHost();
  const { cell } = sel;
  const [editing, setEditing] = useState(false);
  return (
    <div className="fixed inset-0 z-50 grid place-items-center bg-black/60 p-4" onClick={onClose}>
      <div className="card w-full max-w-lg" onClick={(e) => e.stopPropagation()}>
        <div className="mb-1 text-sm text-white/60">{sel.cat} · ${cell.value} {cell.dailyDouble && <b className="text-gold">· Daily Double</b>} {cell.used && "· used"}</div>
        {editing ? (
          <ClueEditor clueId={cell.id} text={cell.text ?? ""} answer={cell.answer ?? ""} onDone={() => setEditing(false)} />
        ) : (
          <>
            <div className="clue-text mb-2 text-lg">{cell.text}</div>
            {cell.media && <MediaView media={cell.media} className="mb-2 max-h-40 rounded" />}
            <div className="mb-4 rounded-lg bg-black/30 p-2 text-gold">{cell.answer}</div>
            <div className="grid grid-cols-2 gap-2">
              <button className="btn-primary col-span-2 py-3 text-lg" onClick={async () => (await act({ type: "clue/open", clueId: cell.id })) && onClose()}>
                {cell.used ? "Re-open clue" : "Open on display"}
              </button>
              {!cell.dailyDouble && (
                <button
                  className="btn-ghost col-span-2"
                  title="Everyone writes an answer on their phone. Right answers score, wrong answers cost nothing."
                  onClick={async () => (await act({ type: "clue/open", clueId: cell.id, allPlay: true })) && onClose()}
                >
                  ✍️ Open as all-play (everyone answers)
                </button>
              )}
              <button className="btn-ghost" onClick={async () => (await act({ type: "clue/setUsed", clueId: cell.id, used: !cell.used })) && onClose()}>
                Mark {cell.used ? "unused" : "used"}
              </button>
              <button className="btn-ghost" onClick={async () => (await act({ type: "clue/skip", clueId: cell.id })) && onClose()} disabled={cell.used}>
                Skip clue
              </button>
              <button className="btn-ghost" onClick={() => setEditing(true)}>✏️ Fix typo</button>
              <button className="btn-ghost" onClick={onClose}>Cancel</button>
            </div>
          </>
        )}
      </div>
    </div>
  );
}

function ClueEditor({ clueId, text, answer, onDone }: { clueId: string; text: string; answer: string; onDone: () => void }) {
  const { act } = useHost();
  const [t, setT] = useState(text);
  const [a, setA] = useState(answer);
  const [save, setSave] = useState(true);
  return (
    <form
      className="flex flex-col gap-2"
      onSubmit={async (e) => {
        e.preventDefault();
        if (await act({ type: "clue/edit", clueId, text: t, answer: a, saveToBoard: save })) onDone();
      }}
    >
      <label className="text-sm text-white/60">Clue</label>
      <textarea className="input min-h-20" value={t} onChange={(e) => setT(e.target.value)} />
      <label className="text-sm text-white/60">Answer</label>
      <input className="input" value={a} onChange={(e) => setA(e.target.value)} />
      <label className="flex items-center gap-2 text-sm"><input type="checkbox" checked={save} onChange={(e) => setSave(e.target.checked)} /> Also fix it in the saved board</label>
      <div className="flex gap-2">
        <button type="button" className="btn-ghost flex-1" onClick={onDone}>Cancel</button>
        <button className="btn-primary flex-1">Save</button>
      </div>
    </form>
  );
}

// -------------------------------------------------------------------- clue

function ClueControl() {
  const { view, act, now } = useHost();
  const c = view.clue!;
  const [editing, setEditing] = useState(false);
  const [timerSecs, setTimerSecs] = useState(10);
  const answering = c.answering;
  const revealed = c.stage === "revealed";

  return (
    <div className="mx-auto flex max-w-3xl flex-col gap-3">
      <div className="card">
        <div className="mb-1 flex items-center gap-2 text-sm text-white/60">
          <span>{c.category} · ${c.value}</span>
          {c.dailyDouble && <span className="rounded bg-gold px-2 font-bold text-black">DAILY DOUBLE</span>}
          <StageBadge stage={c.stage} />
          <button className="ml-auto text-white/60 underline" onClick={() => setEditing(!editing)}>{editing ? "close editor" : "✏️ fix typo"}</button>
        </div>
        {editing ? (
          <ClueEditor clueId={c.id} text={c.text ?? ""} answer={c.answer ?? ""} onDone={() => setEditing(false)} />
        ) : (
          <>
            <div className="clue-text text-xl">{c.text}</div>
            {c.media && <MediaView media={c.media} className="mt-2 max-h-40 rounded" />}
            <div className="mt-3 rounded-lg border border-gold/40 bg-gold/10 p-3">
              <div className="text-xs uppercase text-gold/70">Answer</div>
              <div className="text-xl font-semibold text-gold">{c.answer}</div>
            </div>
          </>
        )}
      </div>

      {c.dailyDouble ? <DailyDoubleControl /> : c.allPlay ? <AllPlayControl /> : (
        <>
          {!revealed && (
            <div className="grid grid-cols-2 gap-2">
              {c.stage === "reading" && (
                <button className="btn-ok col-span-2 py-5 text-2xl" onClick={() => act({ type: "buzzers/unlock" })}>
                  🔓 Open buzzers{c.autoUnlockAt ? <AutoUnlockCountdown at={c.autoUnlockAt} /> : null}
                </button>
              )}
              {c.stage === "open" && (
                <button className="btn-ghost col-span-2 py-4 text-lg" onClick={() => act({ type: "buzzers/lock" })}>🔒 Lock buzzers <span className="text-sm text-green-400">(open now)</span></button>
              )}
              {c.stage === "answering" && answering && (
                <>
                  <div className="col-span-2 rounded-xl bg-gold p-3 text-center text-black">
                    <div className="text-sm">Buzzed in first</div>
                    <div className="text-2xl font-black">{playerName(view, answering)}</div>
                    {view.settings.mode === "team" && <div className="text-sm">{contestantName(view, view.players.find((p) => p.id === answering)?.teamId)}</div>}
                  </div>
                  {view.timer && <TimerBar startedAt={view.timer.startedAt} endsAt={view.timer.endsAt} now={now} className="col-span-2" />}
                  <button className="btn-ok py-6 text-2xl" onClick={() => act({ type: "clue/judge", correct: true })}>✓ Correct</button>
                  <button className="btn-bad py-6 text-2xl" onClick={() => act({ type: "clue/judge", correct: false })}>✗ Wrong</button>
                </>
              )}
            </div>
          )}
          {c.buzzes.length > 0 && (
            <div className="card !p-3 text-sm">
              <div className="mb-1 text-white/60">Buzz order</div>
              <ol className="flex flex-wrap gap-2">
                {c.buzzes.map((b, i) => (
                  <li key={b.playerId} className={`rounded-full px-3 py-1 ${i === 0 ? "bg-gold text-black" : "bg-white/10"}`}>
                    {i + 1}. {playerName(view, b.playerId)} <span className="opacity-60">+{b.at - c.buzzes[0].at}ms</span>
                  </li>
                ))}
              </ol>
            </div>
          )}
          {c.attempted.length > 0 && <div className="text-sm text-white/60">Already wrong: {c.attempted.map((id) => contestantName(view, id)).join(", ")}</div>}
          {!revealed && c.stage !== "answering" && <ManualJudge />}
        </>
      )}

      <div className="grid grid-cols-2 gap-2 sm:grid-cols-4">
        {!revealed && <button className="btn-ghost" onClick={() => act({ type: "clue/reveal" })}>👁 Reveal answer</button>}
        {!revealed && !c.allPlay && <button className="btn-ghost" onClick={() => act({ type: "clue/nobody" })}>🤷 Nobody got it</button>}
        <button className={`btn-ghost ${revealed ? "btn-primary col-span-2 py-4 text-lg sm:col-span-4" : ""}`} onClick={() => act({ type: "clue/close" })}>
          ⬅ Back to board
        </button>
        {!revealed && (
          view.timer ? (
            <button className="btn-ghost" onClick={() => act({ type: "timer/stop" })}>⏹ Stop timer</button>
          ) : (
            <div className="flex">
              <input className="input !w-14 !rounded-r-none !px-1 text-center" inputMode="numeric" value={timerSecs} onChange={(e) => setTimerSecs(Number(e.target.value.replace(/\D/g, "")) || 0)} />
              <button className="btn-ghost !rounded-l-none flex-1 !px-2" onClick={() => timerSecs > 0 && act({ type: "timer/start", seconds: timerSecs })}>⏱ Timer</button>
            </div>
          )
        )}
      </div>
      {revealed && c.nobody && <p className="text-center text-sm text-white/50">Returning to the board automatically…</p>}
    </div>
  );
}

function AutoUnlockCountdown({ at }: { at: number }) {
  const { now } = useHost();
  useTick(200);
  const left = Math.max(0, Math.ceil((at - now()) / 1000));
  return <span className="ml-2 text-base font-normal opacity-80">(opens by itself in {left}s)</span>;
}

/** All-play clue: watch answers come in, then rule on each one. */
function AllPlayControl() {
  const { view, act, now } = useHost();
  const c = view.clue!;
  const ap = c.allPlay!;
  const list = contestants(view);
  const writing = ap.stage === "writing" && c.stage !== "revealed";
  const answered = list.filter((x) => ap.hasAnswer[x.id]);
  return (
    <div className="flex flex-col gap-2">
      <div className="rounded-xl bg-[var(--board)] p-3 text-center">
        <div className="text-sm text-white/70">✍️ All-play: everyone writes an answer. Right answers earn ${c.value}; wrong answers cost nothing.</div>
        {writing && view.timer && <TimerBar startedAt={view.timer.startedAt} endsAt={view.timer.endsAt} now={now} className="mt-2" />}
        {writing && <div className="mt-2 text-sm">{answered.length} of {list.length} answered</div>}
      </div>
      {writing && <button className="btn-ok py-4 text-lg" onClick={() => act({ type: "allPlay/close" })}>✋ Pencils down: close answers now</button>}
      <div className="grid gap-2 sm:grid-cols-2">
        {list.map((x) => {
          const judged = ap.judged[x.id];
          const has = !!ap.hasAnswer[x.id];
          return (
            <div key={x.id} className={`card !p-2 ${judged === true ? "!border-green-500" : judged === false ? "!border-red-500/70" : ""}`}>
              <div className="mb-1 flex items-center justify-between text-sm">
                <b style={{ color: x.color }}>{x.name}</b>
                <span className="text-white/50">{judged === true ? `✓ +$${c.value}` : judged === false ? "✗" : has ? "answered" : "no answer"}</span>
              </div>
              <div className="aspect-[16/9] rounded bg-[var(--board-deep)]">
                {ap.answers[x.id] ? (
                  <Ink drawing={ap.answers[x.id]} className="h-full w-full" />
                ) : (
                  <div className="clue-text grid h-full place-items-center px-2 text-center text-lg">{ap.typed[x.id] || <span className="text-white/30">—</span>}</div>
                )}
              </div>
              {!writing && (
                <div className="mt-2 grid grid-cols-2 gap-2">
                  <button className={`btn-ok !py-2 ${judged === true ? "ring-2 ring-white" : ""}`} onClick={() => act({ type: "allPlay/judge", contestantId: x.id, correct: true })}>✓ Correct</button>
                  <button className={`btn-bad !py-2 ${judged === false ? "ring-2 ring-white" : ""}`} onClick={() => act({ type: "allPlay/judge", contestantId: x.id, correct: false })}>✗ Wrong</button>
                </div>
              )}
            </div>
          );
        })}
      </div>
      {!writing && <p className="text-center text-xs text-white/50">Each ruling shows that answer on the display. Then reveal the correct answer.</p>}
    </div>
  );
}

function StageBadge({ stage }: { stage: string }) {
  const map: Record<string, [string, string]> = {
    reading: ["Buzzers locked", "bg-white/10"],
    open: ["Buzzers open", "bg-green-600"],
    answering: ["Answering", "bg-gold text-black"],
    revealed: ["Revealed", "bg-white/20"],
  };
  const [label, cls] = map[stage] ?? [stage, ""];
  return <span className={`rounded px-2 text-xs ${cls}`}>{label}</span>;
}

/** Judge any player directly (e.g. someone shouted it out, or a phone died). */
function ManualJudge() {
  const { view, act } = useHost();
  const [open, setOpen] = useState(false);
  const players = view.players.filter((p) => !p.removed);
  if (!players.length) return null;
  return (
    <div className="card !p-3">
      <button className="text-sm text-white/60 underline" onClick={() => setOpen(!open)}>{open ? "Hide" : "Judge a player manually…"}</button>
      {open && (
        <div className="mt-2 flex flex-col gap-1">
          {players.map((p) => (
            <div key={p.id} className="flex items-center gap-2">
              <span className="flex-1 truncate">{p.name}</span>
              <button className="btn-ok !px-3 !py-1" onClick={() => act({ type: "clue/judge", correct: true, playerId: p.id })}>✓</button>
              <button className="btn-bad !px-3 !py-1" onClick={() => act({ type: "clue/judge", correct: false, playerId: p.id })}>✗</button>
            </div>
          ))}
        </div>
      )}
    </div>
  );
}

function DailyDoubleControl() {
  const { view, act } = useHost();
  const c = view.clue!;
  const dd = c.dailyDouble!;
  const [wager, setWager] = useState("");
  const [who, setWho] = useState(dd.contestantId);
  const list = contestants(view);
  const max = Math.max(view.scores[who] ?? 0, Math.max(0, ...(view.board?.values ?? [0])));
  if (dd.wager === null) {
    return (
      <div className="card flex flex-col gap-3">
        <div className="text-sm text-white/60">Who found the Daily Double?</div>
        <div className="flex flex-wrap gap-2">
          {list.map((x) => (
            <button key={x.id} className={`btn-ghost ${who === x.id ? "!border-gold !text-gold" : ""}`} onClick={() => setWho(x.id)}>
              {x.name} <span className="text-xs opacity-60">{formatScore(view.scores[x.id] ?? 0)}</span>
            </button>
          ))}
        </div>
        <label className="text-sm text-white/60">Wager (0 – ${max.toLocaleString()})</label>
        <div className="flex gap-2">
          <input className="input text-2xl" inputMode="numeric" value={wager} onChange={(e) => setWager(e.target.value.replace(/\D/g, ""))} placeholder="0" />
          <button className="btn-ghost" onClick={() => setWager(String(max))}>True DD</button>
        </div>
        <button
          className="btn-primary py-3 text-lg"
          disabled={!who || wager === "" || Number(wager) > max}
          onClick={() => act({ type: "dd/wager", amount: Number(wager), contestantId: who })}
        >
          Lock wager & show clue
        </button>
      </div>
    );
  }
  if (c.stage === "revealed") return null;
  return (
    <div className="grid grid-cols-2 gap-2">
      <div className="col-span-2 text-center text-white/70">
        {contestantName(view, dd.contestantId)} wagered <b className="text-gold">${dd.wager.toLocaleString()}</b>
      </div>
      <button className="btn-ok py-6 text-2xl" onClick={() => act({ type: "clue/judge", correct: true })}>✓ Correct</button>
      <button className="btn-bad py-6 text-2xl" onClick={() => act({ type: "clue/judge", correct: false })}>✗ Wrong</button>
    </div>
  );
}

// ------------------------------------------------------------------- final

function FinalControl() {
  const { view, act, now } = useHost();
  const f = view.final!;
  const [editing, setEditing] = useState(false);
  const [hostWager, setHostWager] = useState<Record<string, string>>({});
  const order = f.order.length ? f.order : f.eligible;
  return (
    <div className="mx-auto flex max-w-3xl flex-col gap-3">
      <div className="card">
        <div className="mb-1 flex items-center text-sm text-white/60">
          Final Jeopardy · <b className="ml-1 text-white">{f.category}</b> · stage: {f.stage}
          <button className="ml-auto underline" onClick={() => setEditing(!editing)}>{editing ? "close" : "✏️ fix typo"}</button>
        </div>
        {editing ? (
          <FinalEditor onDone={() => setEditing(false)} />
        ) : (
          <>
            <div className="clue-text text-lg">{f.text}</div>
            <div className="mt-2 rounded-lg border border-gold/40 bg-gold/10 p-2 text-gold">{f.answer}</div>
          </>
        )}
      </div>

      {f.stage === "category" && (
        <button className="btn-primary py-4 text-lg" onClick={() => act({ type: "final/showClue" })}>Show the clue →</button>
      )}
      {(f.stage === "category" || f.stage === "clue") && (
        <button className="btn-ok py-4 text-lg" onClick={() => act({ type: "final/startTimer" })}>
          ⏱ Start {view.settings.finalTimerSec}s timer + think music
        </button>
      )}
      {f.stage === "writing" && (
        <>
          {view.timer && <TimerBar startedAt={view.timer.startedAt} endsAt={view.timer.endsAt} now={now} />}
          <button className="btn-ghost py-3" onClick={() => act({ type: "final/close" })}>Close answers now</button>
        </>
      )}

      <div className="card flex flex-col gap-2">
        <div className="text-sm text-white/60">
          {f.stage === "closed" || f.stage === "reveal" || f.stage === "done" ? "Reveal one by one (lowest score first)" : "Contestants"}
        </div>
        {order.map((id) => {
          const r = f.revealed[id];
          const c = contestants(view).find((x) => x.id === id);
          return (
            <div key={id} className={`rounded-xl border p-3 ${f.current === id ? "border-gold" : "border-line"} bg-panel-2`}>
              <div className="flex flex-wrap items-center gap-2">
                <b style={{ color: c?.color }}>{contestantName(view, id)}</b>
                <span className="text-sm text-white/50">{formatScore(view.scores[id] ?? 0)}</span>
                <span className="text-xs">{f.hasWager[id] ? `✓ wager $${(f.wagers[id] ?? 0).toLocaleString()}` : "⏳ no wager"}</span>
                <span className="text-xs">{f.hasAnswer[id] ? "✓ answered" : "⏳ no answer"}</span>
              </div>
              {(f.stage === "category" || f.stage === "clue" || f.stage === "writing") && !f.hasWager[id] && (
                <div className="mt-2 flex gap-2">
                  <input className="input !py-1" inputMode="numeric" placeholder="Enter wager for them" value={hostWager[id] ?? ""} onChange={(e) => setHostWager({ ...hostWager, [id]: e.target.value.replace(/\D/g, "") })} />
                  <button className="btn-ghost !py-1" onClick={() => hostWager[id] && act({ type: "final/hostWager", contestantId: id, amount: Number(hostWager[id]) })}>Set</button>
                </div>
              )}
              {(f.stage === "closed" || f.stage === "reveal" || f.stage === "done") && (
                <div className="mt-2 flex flex-col gap-2">
                  {(f.answers[id] || f.typed[id]) && (
                    <div className="flex items-center gap-2">
                      {f.answers[id] && <Ink drawing={f.answers[id]} className="aspect-video w-40 rounded bg-[var(--board-deep)]" />}
                      {f.typed[id] && <span className="text-sm">typed: “{f.typed[id]}”</span>}
                    </div>
                  )}
                  <div className="flex flex-wrap gap-2">
                    {!r?.answer && <button className="btn-primary" onClick={() => act({ type: "final/reveal", contestantId: id })}>1 · Show answer</button>}
                    {r?.answer && r.judged === null && (
                      <>
                        <button className="btn-ok" onClick={() => act({ type: "final/judge", contestantId: id, correct: true })}>2 · ✓ Correct</button>
                        <button className="btn-bad" onClick={() => act({ type: "final/judge", contestantId: id, correct: false })}>2 · ✗ Wrong</button>
                      </>
                    )}
                    {r?.answer && r.judged !== null && !r.wager && (
                      <button className="btn-primary" onClick={() => act({ type: "final/showWager", contestantId: id })}>3 · Reveal wager & update score</button>
                    )}
                    {r?.wager && <span className="text-sm text-white/60">{r.judged ? "✓ correct" : "✗ wrong"} · done</span>}
                  </div>
                </div>
              )}
            </div>
          );
        })}
        {!order.length && <div className="text-sm text-white/50">No contestants.</div>}
      </div>
      {(f.stage === "done" || f.stage === "reveal" || f.stage === "closed") && (
        <button className="btn-primary py-4 text-lg" onClick={() => confirm("End the game and show the winner?") && act({ type: "game/end" })}>🏁 End game & crown winner</button>
      )}
    </div>
  );
}

function FinalEditor({ onDone }: { onDone: () => void }) {
  const { view, act } = useHost();
  const f = view.final!;
  const [cat, setCat] = useState(f.category);
  const [t, setT] = useState(f.text ?? "");
  const [a, setA] = useState(f.answer ?? "");
  return (
    <form className="flex flex-col gap-2" onSubmit={async (e) => {
      e.preventDefault();
      if (await act({ type: "final/edit", category: cat, text: t, answer: a, saveToBoard: true })) onDone();
    }}>
      <input className="input" value={cat} onChange={(e) => setCat(e.target.value)} />
      <textarea className="input" value={t} onChange={(e) => setT(e.target.value)} />
      <input className="input" value={a} onChange={(e) => setA(e.target.value)} />
      <button className="btn-primary">Save (also updates the board)</button>
    </form>
  );
}

// ---------------------------------------------------------------- finished

function FinishedControl() {
  const { view, gameId, act, toast } = useHost();
  const [busy, setBusy] = useState(false);
  const [boards, setBoards] = useState<{ id: string; title: string }[] | null>(null);
  const [boardId, setBoardId] = useState("");
  useEffect(() => {
    let live = true;
    fetch("/api/boards")
      .then((r) => (r.ok ? r.json() : { boards: [] }))
      .then((d: { boards?: { id: string; title: string }[] }) => live && setBoards(d.boards ?? []))
      .catch(() => live && setBoards([]));
    return () => {
      live = false;
    };
  }, []);
  async function rematchWith(id: string) {
    setBusy(true);
    const res = await fetch(`/api/games/${gameId}/rematch`, { method: "POST", headers: { "content-type": "application/json" }, body: JSON.stringify({ boardId: id }) });
    setBusy(false);
    const data = await res.json().catch(() => ({}));
    if (!res.ok) return toast(data.error ?? "Couldn't start the next game");
    window.location.href = `/host/${data.code}`;
  }
  const ranked = [...contestants(view)].sort((a, b) => (view.scores[b.id] ?? 0) - (view.scores[a.id] ?? 0));
  async function rematch(sameBoard: boolean) {
    setBusy(true);
    const res = await fetch(`/api/games/${gameId}/rematch`, { method: "POST", headers: { "content-type": "application/json" }, body: JSON.stringify({ sameBoard }) });
    setBusy(false);
    const data = await res.json().catch(() => ({}));
    if (!res.ok) return toast(data.error ?? "Rematch failed");
    window.location.href = `/host/${data.code}`;
  }
  return (
    <div className="mx-auto flex max-w-xl flex-col gap-3">
      <div className="card">
        <h2 className="mb-2 text-xl font-bold">🏁 Game over</h2>
        {ranked.map((c, i) => (
          <div key={c.id} className="flex justify-between border-b border-line py-1.5 last:border-0">
            <span>{i + 1}. {c.name}</span>
            <b className="money">{formatScore(view.scores[c.id] ?? 0)}</b>
          </div>
        ))}
      </div>
      {!!view.awards?.length && (
        <div className="card">
          <h3 className="mb-2 font-semibold">Awards</h3>
          {view.awards.map((a) => (
            <div key={a.id} className="flex items-baseline gap-2 border-b border-line py-1.5 text-sm last:border-0">
              <span className="text-lg">{a.emoji}</span>
              <b className="text-gold">{a.title}</b>
              <span>{a.name}</span>
              <span className="ml-auto text-right text-white/50">{a.detail}</span>
            </div>
          ))}
        </div>
      )}
      <div className="card flex flex-col gap-2 !border-gold/50">
        <h3 className="font-semibold">▶ Play again with the same players</h3>
        <p className="text-sm text-white/60">Everyone stays in the room: phones and the big screen move to the new game by themselves, with fresh scores.</p>
        {boards && boards.length > 0 ? (
          <div className="flex flex-wrap gap-2">
            <select className="input min-w-0 flex-1" value={boardId} onChange={(e) => setBoardId(e.target.value)} aria-label="Board for the next game">
              <option value="">Pick the next board…</option>
              {boards.map((b) => (
                <option key={b.id} value={b.id}>{b.title}</option>
              ))}
            </select>
            <button className="btn-primary" disabled={busy || !boardId} onClick={() => rematchWith(boardId)}>Start</button>
          </div>
        ) : (
          <Link className="btn-ghost py-2" href={`/dashboard?rematch=${gameId}`}>Pick a board on the dashboard…</Link>
        )}
        <button className="btn-ghost py-2" disabled={busy} onClick={() => rematch(true)}>🔁 Same board again</button>
      </div>
      <Link className="btn-ghost py-3" href={`/results/${gameId}`}>📊 Results & CSV export</Link>
      <button
        className="btn-ghost py-3"
        onClick={async () => {
          const url = `${window.location.origin}/r/${gameId}`;
          try {
            await navigator.clipboard.writeText(url);
            toast("Results link copied. Anyone with it can see the final standings.");
          } catch {
            toast(url);
          }
        }}
      >
        🔗 Copy a shareable results link
      </button>
      <button className="btn-ghost" onClick={() => act({ type: "board/resetUsed" })}>Reset used clues</button>
      <p className="text-center text-xs text-white/40">Ended by mistake? Use History → undo “Ended game”.</p>
    </div>
  );
}
