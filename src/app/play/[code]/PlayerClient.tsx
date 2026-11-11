"use client";

import { useCallback, useEffect, useRef, useState } from "react";
import Link from "next/link";
import { getPlayerToken, setPlayerToken, clearPlayerToken, useGame } from "@/client/useGame";
import { sound } from "@/client/sound";
import { useWakeLock } from "@/client/useWakeLock";
import { DrawingPad } from "@/components/DrawingPad";
import { Ink } from "@/components/Ink";
import { ConnBanner, MediaView, StatusDot, TimerBar, contestantName, formatScore, playerName, useCountdown } from "@/components/game";
import type { GameView } from "@/engine/views";
import { FINAL_CANVAS, NAME_CANVAS, isEmptyDrawing, type Drawing } from "@/shared/strokes";
import { REACTIONS } from "@/shared/protocol";

export default function PlayerClient({ code }: { code: string }) {
  const [kicked, setKicked] = useState<string | null>(null);
  useWakeLock();
  const [flash, setFlash] = useState<string | null>(null);
  const { view, status, error, emit, now } = useGame({
    role: "player",
    code,
    onFx: (fx) => {
      if (fx.cue === "earlyBuzz") setFlash("Too early! Locked out for a moment");
    },
    onRedirect: (next) => {
      const token = getPlayerToken(code);
      if (token) setPlayerToken(next, token);
      window.location.replace(`/play/${next}`);
    },
    onKicked: (reason) => {
      setKicked(reason);
      if (reason === "banned") clearPlayerToken(code);
    },
  });

  useEffect(() => {
    if (!flash) return;
    const t = setTimeout(() => setFlash(null), 1800);
    return () => clearTimeout(t);
  }, [flash]);

  if (kicked) {
    return (
      <Center>
        <div className="text-5xl">🚪</div>
        <h1 className="text-2xl font-bold">{kicked === "banned" ? "You've been removed from this game" : "The host removed you"}</h1>
        {kicked !== "banned" && (
          <button className="btn-primary" onClick={() => window.location.reload()}>
            Rejoin
          </button>
        )}
        <Link href="/join" className="text-white/60 underline">Join a different game</Link>
      </Center>
    );
  }

  if (!view) {
    return (
      <Center>
        <ConnBanner status={status} error={error} />
        {status === "error" ? (
          <>
            <div className="text-5xl">🤔</div>
            <h1 className="text-xl font-bold">{error === "Game not found" ? `No game with code ${code}` : error}</h1>
            <Link href="/join" className="btn-primary">Try another code</Link>
          </>
        ) : (
          <div className="text-white/60">Connecting…</div>
        )}
      </Center>
    );
  }

  const me = view.me;
  const myPlayer = me ? view.players.find((p) => p.id === me.playerId) : undefined;

  if (!me || !myPlayer || myPlayer.removed) {
    return (
      <>
        <ConnBanner status={status} error={error} />
        <JoinForm view={view} emit={emit} code={code} rejoinName={myPlayer?.name} />
      </>
    );
  }

  return (
    <main className="flex min-h-dvh flex-col bg-[var(--board-edge)] pb-[env(safe-area-inset-bottom)]">
      <ConnBanner status={status} error={error} />
      <header className="flex items-center gap-3 border-b border-white/10 bg-[var(--board-deep)] px-4 py-2">
        <div className="h-10 w-24 shrink-0">
          {myPlayer.signature ? <Ink drawing={myPlayer.signature} className="h-full w-full" /> : <span className="font-bold">{myPlayer.name}</span>}
        </div>
        <div className="min-w-0 flex-1 truncate text-sm text-white/60">
          {view.settings.mode === "team" && me.contestantId ? contestantName(view, me.contestantId) : view.title}
        </div>
        <div className={`money text-2xl ${(view.scores[me.contestantId ?? ""] ?? 0) < 0 ? "!text-red-400" : ""}`}>{formatScore(view.scores[me.contestantId ?? ""] ?? 0)}</div>
        <StatusDot status={status} />
      </header>
      {flash && <div className="bg-red-600 py-2 text-center font-semibold">{flash}</div>}
      <div className="flex flex-1 flex-col p-4">
        <PlayerStage view={view} emit={emit} now={now} onFlash={setFlash} />
      </div>
    </main>
  );
}

type Emit = ReturnType<typeof useGame>["emit"];

function Center({ children }: { children: React.ReactNode }) {
  return <main className="flex min-h-dvh flex-col items-center justify-center gap-4 p-6 text-center">{children}</main>;
}

// --------------------------------------------------------------------- join

function JoinForm({ view, emit, code, rejoinName }: { view: GameView; emit: Emit; code: string; rejoinName?: string }) {
  const [name, setName] = useState(rejoinName ?? "");
  const [drawing, setDrawing] = useState<Drawing | null>(null);
  const [teamId, setTeamId] = useState<string | null>(null);
  const [busy, setBusy] = useState(false);
  const [err, setErr] = useState<string | null>(null);
  const closed = view.lobbyLocked || (view.phase !== "lobby" && !view.settings.allowLateJoin);

  async function submit() {
    setBusy(true);
    setErr(null);
    const res = await emit("player:join", { name: name.trim(), signature: drawing && !isEmptyDrawing(drawing) ? drawing : null, teamId });
    setBusy(false);
    if (!res.ok) return setErr(res.error);
    const data = res.data as { playerToken?: string };
    if (data.playerToken) setPlayerToken(code, data.playerToken);
  }

  return (
    <main className="mx-auto flex min-h-dvh max-w-xl flex-col gap-4 p-4">
      <div className="text-center">
        <div className="text-sm text-white/50">Joining</div>
        <h1 className="cat-text text-3xl">{view.title}</h1>
        <div className="money text-xl tracking-widest">{code}</div>
      </div>
      {closed && !rejoinName ? (
        <div className="card text-center">{view.lobbyLocked ? "The host has locked the lobby." : "This game has already started and isn't accepting new players."}</div>
      ) : (
        <>
          <label className="flex flex-col gap-1">
            <span className="text-sm text-white/70">Your name</span>
            <input className="input text-lg" value={name} maxLength={24} onChange={(e) => setName(e.target.value)} placeholder="Type your name" autoComplete="nickname" />
          </label>
          <div>
            <div className="mb-1 flex items-baseline justify-between">
              <span className="text-sm text-white/70">Sign your name ✍️</span>
              <span className="text-xs text-white/40">optional — shown on the big screen</span>
            </div>
            <DrawingPad width={NAME_CANVAS.w} height={NAME_CANVAS.h} multiColor={view.settings.multiColor} onChange={setDrawing} placeholder="Draw your name here" />
          </div>
          {view.settings.mode === "team" && view.teams.length > 0 && (
            <div>
              <div className="mb-1 text-sm text-white/70">Team (host can change this)</div>
              <div className="flex flex-wrap gap-2">
                {view.teams.map((t) => (
                  <button key={t.id} type="button" onClick={() => setTeamId(t.id)} className={`btn-ghost ${teamId === t.id ? "!border-white" : ""}`} style={{ color: t.color }}>
                    {t.name}
                  </button>
                ))}
              </div>
            </div>
          )}
          {err && <div className="rounded-lg bg-red-600/20 p-3 text-red-300">{err}</div>}
          <button className="btn-primary py-4 text-xl" disabled={busy || !name.trim()} onClick={submit}>
            {busy ? "Joining…" : rejoinName ? "Rejoin game" : "Join game"}
          </button>
        </>
      )}
    </main>
  );
}

// -------------------------------------------------------------------- stage

function PlayerStage({ view, emit, now, onFlash }: { view: GameView; emit: Emit; now: () => number; onFlash: (s: string) => void }) {
  if (view.phase === "lobby") return <LobbyWait view={view} emit={emit} />;
  // Reactions stay out of the way while a clue is live so nobody mis-taps the buzzer.
  const quiet =
    view.phase === "board" ||
    view.phase === "finished" ||
    (view.phase === "clue" && view.clue?.stage === "revealed") ||
    (view.phase === "final" && ["closed", "reveal", "done"].includes(view.final?.stage ?? ""));
  return (
    <>
      {view.phase === "final" ? (
        <FinalPlayer view={view} emit={emit} now={now} />
      ) : view.phase === "finished" ? (
        <Finished view={view} />
      ) : view.clue?.allPlay ? (
        <AllPlayPlayer key={view.clue.id} view={view} emit={emit} now={now} />
      ) : (
        <Buzzer view={view} emit={emit} now={now} onFlash={onFlash} />
      )}
      {view.settings.reactions && quiet && <ReactionBar emit={emit} />}
    </>
  );
}

function ReactionBar({ emit }: { emit: Emit }) {
  const [sent, setSent] = useState<string | null>(null);
  return (
    <div className="mt-3 flex justify-between gap-1 rounded-2xl bg-white/5 p-2" role="group" aria-label="Send a reaction to the big screen">
      {REACTIONS.map((e) => (
        <button
          key={e}
          type="button"
          aria-label={`React ${e}`}
          className={`grid h-11 flex-1 place-items-center rounded-xl text-2xl transition-transform active:scale-125 ${sent === e ? "bg-white/15" : ""}`}
          onClick={() => {
            setSent(e);
            setTimeout(() => setSent((cur) => (cur === e ? null : cur)), 500);
            void emit("player:react", { emoji: e });
          }}
        >
          {e}
        </button>
      ))}
    </div>
  );
}

/** All-play clue: everyone writes (or types) an answer; the host rules on each one. */
function AllPlayPlayer({ view, emit, now }: { view: GameView; emit: Emit; now: () => number }) {
  const me = view.me!;
  const c = view.clue!;
  const ap = c.allPlay!;
  const [answer, setAnswer] = useState<Drawing | null>(me.allPlayAnswer);
  const [typed, setTyped] = useState(me.allPlayTyped ?? "");
  const [saved, setSaved] = useState<"idle" | "saving" | "saved" | "error">(me.allPlayAnswer || me.allPlayTyped ? "saved" : "idle");
  const [msg, setMsg] = useState<string | null>(null);
  const pending = useRef<NodeJS.Timeout | null>(null);
  const writing = ap.stage === "writing" && c.stage !== "revealed";
  const left = useCountdown(writing ? ap.endsAt : null, now);

  const submit = useCallback(
    async (d: Drawing | null, t: string) => {
      setSaved("saving");
      const r = await emit("player:allPlayAnswer", { drawing: d && !isEmptyDrawing(d) ? d : null, typed: t || undefined });
      setSaved(r.ok ? "saved" : "error");
      setMsg(r.ok ? null : r.error);
    },
    [emit],
  );
  const queue = (d: Drawing | null, t: string) => {
    if (pending.current) clearTimeout(pending.current);
    setSaved("idle");
    pending.current = setTimeout(() => void submit(d, t), 2200);
  };
  useEffect(() => () => {
    if (pending.current) clearTimeout(pending.current);
  }, []);
  // Flush right before time runs out.
  useEffect(() => {
    if (left !== null && left < 900 && left > 0 && saved === "idle") {
      if (pending.current) clearTimeout(pending.current);
      void submit(answer, typed);
    }
  }, [left, saved, answer, typed, submit]);

  const header = (
    <div className="rounded-xl bg-[var(--board)] p-3 text-center">
      <div className="text-xs uppercase text-white/60">{c.category} · ${c.value} · everybody plays</div>
      <div className="mt-1 text-sm">{c.text}</div>
      {c.media && <MediaView media={c.media} className="mx-auto mt-2 max-h-40 rounded" />}
      {c.stage === "revealed" && <div className="clue-text mt-2 text-lg text-gold">{c.answer}</div>}
    </div>
  );

  if (!me.contestantId) return <Center>{header}<p className="text-white/60">Watch the big screen.</p></Center>;

  if (writing) {
    return (
      <div className="flex flex-col gap-3">
        {header}
        {view.timer && <TimerBar startedAt={view.timer.startedAt} endsAt={view.timer.endsAt} now={now} />}
        <DrawingPad
          width={FINAL_CANVAS.w}
          height={FINAL_CANVAS.h}
          multiColor={view.settings.multiColor}
          initial={me.allPlayAnswer}
          onChange={(d) => {
            setAnswer(d);
            queue(d, typed);
          }}
          placeholder="Write your answer"
        />
        <input
          className="input"
          placeholder="Or type it (optional)"
          maxLength={200}
          value={typed}
          onChange={(e) => {
            setTyped(e.target.value);
            queue(answer, e.target.value);
          }}
        />
        <button className="btn-primary py-3 text-lg" onClick={() => void submit(answer, typed)} disabled={saved === "saving"}>
          {saved === "saved" ? "✓ Answer saved (tap to resave)" : saved === "saving" ? "Saving…" : "Lock in answer"}
        </button>
        {msg && <div className="text-red-300">{msg}</div>}
      </div>
    );
  }

  const judged = ap.judged[me.contestantId];
  return (
    <div className="flex flex-1 flex-col items-center gap-3 text-center">
      {header}
      <div className="text-5xl">{judged === true ? "✅" : judged === false ? "❌" : "🤞"}</div>
      <h2 className="text-xl font-bold">{judged === true ? `Correct! +$${c.value}` : judged === false ? "Not this time" : "Pencils down! Watch the big screen"}</h2>
      {me.allPlayAnswer ? (
        <Ink drawing={me.allPlayAnswer} className="aspect-video w-full max-w-sm rounded-xl bg-[var(--board-deep)]" />
      ) : me.allPlayTyped ? (
        <p className="clue-text text-lg">{me.allPlayTyped}</p>
      ) : (
        <p className="text-white/60">You did not answer this one.</p>
      )}
    </div>
  );
}

function LobbyWait({ view, emit }: { view: GameView; emit: Emit }) {
  const me = view.me!;
  const p = view.players.find((x) => x.id === me.playerId)!;
  const [redraw, setRedraw] = useState(false);
  const [draft, setDraft] = useState<Drawing | null>(null);
  const [msg, setMsg] = useState<string | null>(null);
  if (redraw) {
    return (
      <div className="flex flex-col gap-3">
        <h2 className="text-lg font-semibold">Redraw your name</h2>
        <DrawingPad width={NAME_CANVAS.w} height={NAME_CANVAS.h} multiColor={view.settings.multiColor} initial={p.signature} onChange={setDraft} />
        {msg && <div className="text-red-300">{msg}</div>}
        <div className="flex gap-2">
          <button className="btn-ghost flex-1" onClick={() => setRedraw(false)}>Cancel</button>
          <button
            className="btn-primary flex-1"
            onClick={async () => {
              const r = await emit("player:signature", { signature: draft && !isEmptyDrawing(draft) ? draft : null });
              if (r.ok) setRedraw(false);
              else setMsg(r.error);
            }}
          >
            Save
          </button>
        </div>
      </div>
    );
  }
  return (
    <div className="flex flex-1 flex-col items-center justify-center gap-5 text-center">
      <div className="text-6xl">🎉</div>
      <h2 className="text-2xl font-bold">You&apos;re in!</h2>
      <div className="aspect-[5/2] w-full max-w-sm rounded-xl bg-[var(--board)] p-2">
        {p.signature ? <Ink drawing={p.signature} className="h-full w-full" /> : <div className="cat-text grid h-full place-items-center text-3xl">{p.name}</div>}
      </div>
      {p.signatureHidden && <div className="text-sm text-yellow-300">The host hid your drawing — try redrawing it.</div>}
      <button className="btn-ghost" onClick={() => setRedraw(true)}>✏️ Redraw my name</button>
      <p className="text-white/60">Watch the big screen. The game will start soon.</p>
    </div>
  );
}

function Buzzer({ view, emit, now, onFlash }: { view: GameView; emit: Emit; now: () => number; onFlash: (s: string) => void }) {
  const me = view.me!;
  const c = view.clue;
  const [pressed, setPressed] = useState(false);
  const lockLeft = useCountdown(me.lockedUntil > now() ? me.lockedUntil : null, now);
  const lastBuzz = useRef(0);

  const buzz = useCallback(async () => {
    const t = Date.now();
    if (t - lastBuzz.current < 150) return;
    lastBuzz.current = t;
    navigator.vibrate?.(35);
    if (view.settings.sound.playerBuzzSound) {
      void sound().unlock().then(() => sound().play("buzz", view.players.find((p) => p.id === me.playerId)?.index ?? 0));
    }
    const res = await emit("player:buzz", {});
    if (res.ok) {
      const d = res.data as { accepted: boolean; first: boolean; locked: boolean };
      if (d.locked && !d.first) onFlash("Too early! Wait for the host to open buzzers");
    }
  }, [emit, me.playerId, onFlash, view.players, view.settings.sound.playerBuzzSound]);

  const answeringMe = c?.answering === me.playerId;
  const answeringOther = c?.answering && !answeringMe;
  const attempted = !!c && !!me.contestantId && c.attempted.includes(me.contestantId) && !view.settings.allowRebuzz;
  const locked = (lockLeft ?? 0) > 0;

  let label = "Waiting for a clue…";
  let tone = "bg-neutral-700 text-white/50";
  let enabled = false;
  if (view.paused) label = "Paused";
  else if (c?.dailyDouble) label = `Daily Double for ${contestantName(view, c.dailyDouble.contestantId)}`;
  else if (c) {
    if (c.stage === "revealed") label = "Answer revealed";
    else if (answeringMe) {
      label = "You buzzed first! Answer now";
      tone = "bg-gold text-black";
    } else if (answeringOther) {
      label = `Locked — ${playerName(view, c.answering)} buzzed in`;
      tone = "bg-neutral-800 text-white/60";
    } else if (attempted) label = "You already answered this one";
    else if (locked) {
      label = "Too early — locked";
      tone = "bg-red-900 text-white/70";
    } else if (c.stage === "open") {
      label = "BUZZ!";
      tone = "bg-red-600 text-white shadow-[0_0_60px_rgba(239,68,68,0.6)]";
      enabled = true;
    } else {
      label = "Get ready…";
      tone = "bg-[var(--board)] text-white";
      enabled = true; // pressing early triggers the lockout penalty, like the real thing
    }
  }

  return (
    <div className="flex flex-1 flex-col gap-4">
      {c && !c.dailyDouble && (
        <div className="rounded-xl bg-[var(--board)] p-3 text-center">
          <div className="text-xs uppercase text-white/60">{c.category} · ${c.value}</div>
          {c.stage === "revealed" ? <div className="clue-text mt-1 text-lg text-gold">{c.answer}</div> : <div className="mt-1 text-sm text-white/80">{c.text}</div>}
        </div>
      )}
      {view.timer && c?.answering && <TimerBar startedAt={view.timer.startedAt} endsAt={view.timer.endsAt} now={now} />}
      <button
        type="button"
        disabled={!enabled}
        onPointerDown={(e) => {
          e.preventDefault();
          if (!enabled) return;
          setPressed(true);
          void buzz();
        }}
        onPointerUp={() => setPressed(false)}
        onPointerLeave={() => setPressed(false)}
        onContextMenu={(e) => e.preventDefault()}
        className={`flex min-h-[50vh] flex-1 items-center justify-center rounded-[2rem] text-center text-4xl font-black uppercase transition-transform duration-75 select-none [touch-action:manipulation] [-webkit-touch-callout:none] ${tone} ${pressed ? "scale-95" : ""}`}
      >
        <span className="px-6">{label}</span>
      </button>
    </div>
  );
}

// -------------------------------------------------------------------- final

function FinalPlayer({ view, emit, now }: { view: GameView; emit: Emit; now: () => number }) {
  const me = view.me!;
  const f = view.final!;
  const [wager, setWager] = useState<string>(me.finalWager?.toString() ?? "");
  const [msg, setMsg] = useState<string | null>(null);
  const [answer, setAnswer] = useState<Drawing | null>(me.finalAnswer);
  const [typed, setTyped] = useState(me.finalTyped ?? "");
  const [saved, setSaved] = useState<"idle" | "saving" | "saved" | "error">(me.finalAnswer ? "saved" : "idle");
  const pending = useRef<NodeJS.Timeout | null>(null);
  const left = useCountdown(f.stage === "writing" ? f.endsAt : null, now);

  const submit = useCallback(
    async (d: Drawing | null, t: string) => {
      setSaved("saving");
      const r = await emit("player:finalAnswer", { drawing: d && !isEmptyDrawing(d) ? d : null, typed: t || undefined });
      setSaved(r.ok ? "saved" : "error");
      if (!r.ok) setMsg(r.error);
    },
    [emit],
  );

  // Autosave the drawing shortly after each stroke so nothing is lost at time's up.
  const queue = (d: Drawing | null, t: string) => {
    if (pending.current) clearTimeout(pending.current);
    setSaved("idle");
    pending.current = setTimeout(() => void submit(d, t), 2200);
  };
  useEffect(() => () => {
    if (pending.current) clearTimeout(pending.current);
  }, []);

  // Flush right before time runs out.
  useEffect(() => {
    if (left !== null && left < 900 && left > 0 && saved === "idle") {
      if (pending.current) clearTimeout(pending.current);
      void submit(answer, typed);
    }
  }, [left, saved, answer, typed, submit]);

  if (!me.finalEligible) {
    return (
      <Center>
        <div className="text-5xl">🍿</div>
        <h2 className="text-xl font-bold">You&apos;re sitting out Final Jeopardy</h2>
        <p className="text-white/60">Only players with a positive score play. Watch the big screen!</p>
      </Center>
    );
  }

  if (f.stage === "category" || (f.stage === "clue" && me.finalWager === null)) {
    return (
      <div className="flex flex-col gap-4">
        <div className="rounded-xl bg-[var(--board)] p-4 text-center">
          <div className="text-sm uppercase text-white/60">Final Jeopardy category</div>
          <div className="cat-text mt-1 text-3xl">{f.category}</div>
        </div>
        <label className="flex flex-col gap-1">
          <span className="text-white/70">Your wager (0 – ${me.finalMaxWager.toLocaleString()})</span>
          <input
            className="input text-center font-[family-name:var(--font-display)] text-4xl"
            inputMode="numeric"
            value={wager}
            onChange={(e) => setWager(e.target.value.replace(/[^0-9]/g, "").slice(0, 8))}
            placeholder="0"
          />
        </label>
        <div className="flex gap-2">
          <button className="btn-ghost flex-1" onClick={() => setWager(String(me.finalMaxWager))}>All in</button>
          <button className="btn-ghost flex-1" onClick={() => setWager("0")}>Nothing</button>
        </div>
        {msg && <div className="text-red-300">{msg}</div>}
        <button
          className="btn-primary py-4 text-xl"
          disabled={wager === "" || Number(wager) > me.finalMaxWager}
          onClick={async () => {
            const r = await emit("player:finalWager", { amount: Number(wager) });
            setMsg(r.ok ? null : r.error);
          }}
        >
          {me.finalWager !== null ? `Update wager (locked: $${me.finalWager.toLocaleString()})` : "Lock in wager"}
        </button>
        {me.finalWager !== null && <p className="text-center text-green-400">✓ Wager locked in. Wait for the clue…</p>}
      </div>
    );
  }

  if (f.stage === "clue" || f.stage === "writing") {
    return (
      <div className="flex flex-col gap-3">
        <div className="rounded-xl bg-[var(--board)] p-3 text-center">
          <div className="text-xs uppercase text-white/60">{f.category}</div>
          <div className="mt-1 text-sm">{f.text}</div>
          {f.media && <MediaView media={f.media} className="mx-auto mt-2 max-h-40 rounded" />}
        </div>
        {f.stage === "writing" && view.timer ? (
          <TimerBar startedAt={view.timer.startedAt} endsAt={view.timer.endsAt} now={now} />
        ) : (
          <div className="text-center text-sm text-white/60">Get ready — start writing when the timer starts (you can begin now).</div>
        )}
        <DrawingPad
          width={FINAL_CANVAS.w}
          height={FINAL_CANVAS.h}
          multiColor={view.settings.multiColor}
          initial={me.finalAnswer}
          onChange={(d) => {
            setAnswer(d);
            queue(d, typed);
          }}
          placeholder="Write your answer"
        />
        <input
          className="input"
          placeholder="Or type it (optional)"
          maxLength={200}
          value={typed}
          onChange={(e) => {
            setTyped(e.target.value);
            queue(answer, e.target.value);
          }}
        />
        <button className="btn-primary py-3 text-lg" onClick={() => void submit(answer, typed)} disabled={saved === "saving"}>
          {saved === "saved" ? "✓ Answer saved — tap to resave" : saved === "saving" ? "Saving…" : "Lock in answer"}
        </button>
        {msg && <div className="text-red-300">{msg}</div>}
      </div>
    );
  }

  const r = me.contestantId ? f.revealed[me.contestantId] : null;
  return (
    <Center>
      <div className="text-5xl">{r?.judged === true ? "✅" : r?.judged === false ? "❌" : "🤞"}</div>
      <h2 className="text-xl font-bold">{f.stage === "closed" ? "Pencils down!" : "Watch the big screen"}</h2>
      {me.finalAnswer && <Ink drawing={me.finalAnswer} className="aspect-video w-full max-w-sm rounded-xl bg-[var(--board-deep)]" />}
      {me.finalWager !== null && <p className="text-white/60">Your wager: ${me.finalWager.toLocaleString()}</p>}
    </Center>
  );
}

function Finished({ view }: { view: GameView }) {
  const me = view.me!;
  const ids = view.settings.mode === "team" ? view.teams.map((t) => t.id) : view.players.filter((p) => !p.removed).map((p) => p.id);
  const ranked = [...ids].sort((a, b) => (view.scores[b] ?? 0) - (view.scores[a] ?? 0));
  const place = me.contestantId ? ranked.indexOf(me.contestantId) + 1 : 0;
  return (
    <Center>
      <div className="text-6xl">{place === 1 ? "🏆" : "👏"}</div>
      <h2 className="text-2xl font-bold">{place === 1 ? "You won!" : place ? `You finished #${place}` : "Game over"}</h2>
      <div className="money text-5xl">{formatScore(view.scores[me.contestantId ?? ""] ?? 0)}</div>
      {(view.awards ?? [])
        .filter((a) => a.winnerId === me.playerId || a.winnerId === me.contestantId)
        .map((a) => (
          <div key={a.id} className="w-full max-w-xs rounded-xl bg-white/10 p-3">
            <div className="text-3xl">{a.emoji}</div>
            <div className="font-bold text-gold">{a.title}</div>
            <div className="text-sm text-white/70">{a.detail}</div>
          </div>
        ))}
      <p className="text-white/60">Thanks for playing! Stay here — if the host starts a rematch you&apos;ll be moved automatically.</p>
    </Center>
  );
}
