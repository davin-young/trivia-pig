"use client";

import { useCallback, useEffect, useRef, useState } from "react";
import Link from "next/link";
import confetti from "canvas-confetti";
import { getPlayerToken, setPlayerToken, clearPlayerToken, useGame } from "@/client/useGame";
import { sound } from "@/client/sound";
import { useWakeLock } from "@/client/useWakeLock";
import { DrawingPad } from "@/components/DrawingPad";
import { Ink } from "@/components/Ink";
import { ConnBanner, MediaView, StatusDot, TimerBar, contestantName, contestants, formatDelta, formatScore, ordinal, playerName, useAnimatedNumber, useCountdown, useBoardTheme, useDelta } from "@/components/game";
import type { GameView } from "@/engine/views";
import { AVATAR_CANVAS, FINAL_CANVAS, NAME_CANVAS, isEmptyDrawing, type Drawing } from "@/shared/strokes";
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
  useBoardTheme(view?.theme);

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

  if (me?.audience) {
    return (
      <main className="flex min-h-dvh flex-col bg-[var(--board-edge)] pb-[env(safe-area-inset-bottom)]">
        <ConnBanner status={status} error={error} />
        <AudienceStage view={view} emit={emit} />
      </main>
    );
  }

  if (!me || !myPlayer || myPlayer.removed) {
    return (
      <>
        <ConnBanner status={status} error={error} />
        <JoinForm view={view} emit={emit} code={code} rejoinName={myPlayer?.name} />
      </>
    );
  }

  return (
    <main className="flex min-h-dvh flex-col overflow-x-clip bg-[var(--board-edge)] pb-[env(safe-area-inset-bottom)]">
      <ConnBanner status={status} error={error} />
      <header className="flex items-center gap-3 border-b border-white/10 bg-[var(--board-deep)] px-4 py-2">
        <div className="h-10 w-24 shrink-0">
          {myPlayer.signature ? <Ink drawing={myPlayer.signature} className="h-full w-full" /> : <span className="font-bold">{myPlayer.name}</span>}
        </div>
        <div className="min-w-0 flex-1 truncate text-sm text-white/60">
          {view.settings.mode === "team" && me.contestantId ? contestantName(view, me.contestantId) : view.title}
        </div>
        <MyScore score={view.scores[me.contestantId ?? ""] ?? 0} />
        <StatusDot status={status} />
      </header>
      <ScoreToast score={view.scores[me.contestantId ?? ""] ?? 0} streak={view.streaks[me.contestantId ?? ""] ?? 0} />
      {flash && <div className="bg-red-600 py-2 text-center font-semibold">{flash}</div>}
      <div className="flex flex-1 flex-col p-4">
        <PlayerStage view={view} emit={emit} now={now} onFlash={setFlash} />
      </div>
    </main>
  );
}

type Emit = ReturnType<typeof useGame>["emit"];

/** Your score in the header: it counts to the new value instead of jumping. */
function MyScore({ score }: { score: number }) {
  const shown = useAnimatedNumber(score);
  return <div className={`money text-2xl tabular-nums ${shown < 0 ? "!text-red-400" : ""}`}>{formatScore(shown)}</div>;
}

/** The moment your score changes: a banner with the points, a streak callout, and a buzz in the hand. */
function ScoreToast({ score, streak }: { score: number; streak: number }) {
  const delta = useDelta(score, 2600);
  const key = delta?.key;
  const up = (delta?.amount ?? 0) > 0;
  useEffect(() => {
    if (key === undefined) return;
    navigator.vibrate?.(up ? [40, 50, 90] : [160]);
  }, [key, up]);
  if (!delta) return null;
  return (
    <div key={delta.key} role="status" aria-live="polite" className={`anim-pop flex items-center justify-center gap-3 py-2.5 text-center font-bold ${up ? "bg-green-600" : "bg-red-600"}`}>
      <span className="text-2xl">{up ? "🎉" : "😬"}</span>
      <span className="text-2xl tabular-nums">{formatDelta(delta.amount)}</span>
      {up && streak >= 2 && <span className="rounded-full bg-black/25 px-2 py-0.5 text-sm">🔥 {streak} in a row</span>}
    </div>
  );
}

/**
 * Between clues there is nothing to press, so show the things players ask out loud:
 * where am I, who is ahead, and whose turn is it to pick.
 */
function BetweenClues({ view }: { view: GameView }) {
  const me = view.me!;
  const ranked = [...contestants(view)].sort((a, b) => (view.scores[b.id] ?? 0) - (view.scores[a.id] ?? 0));
  const scoreOf = (id: string) => view.scores[id] ?? 0;
  const mine = scoreOf(me.contestantId ?? "");
  const place = 1 + ranked.filter((c) => scoreOf(c.id) > mine).length;
  const tied = ranked.filter((c) => scoreOf(c.id) === mine).length > 1;
  const ahead = [...ranked].reverse().find((c) => scoreOf(c.id) > mine);
  const runnerUp = ranked.find((c) => c.id !== me.contestantId);
  let standing = "";
  if (ranked.length > 1 && me.contestantId) {
    if (place === 1) standing = tied ? "Tied for the lead" : `In the lead by ${formatScore(mine - scoreOf(runnerUp?.id ?? ""))}`;
    else standing = `${tied ? "Tied for " : ""}${ordinal(place)} · ${formatScore(scoreOf(ahead!.id) - mine)} behind ${ahead!.name}`;
  }
  const myPick = !!view.controlId && view.controlId === me.contestantId;
  const top = ranked.slice(0, 5);
  const rows = top.some((c) => c.id === me.contestantId) || !me.contestantId ? top : [...top.slice(0, 4), ranked.find((c) => c.id === me.contestantId)!];
  return (
    <div className="flex flex-1 flex-col gap-3">
      {view.paused ? (
        <div className="card text-center text-lg font-semibold">⏸ Paused</div>
      ) : view.roundComplete ? (
        <div className="card text-center text-lg font-semibold">Round complete! The next one is coming up.</div>
      ) : myPick ? (
        <div className="anim-pop rounded-2xl bg-gold p-4 text-center text-black">
          <div className="text-3xl">🎯</div>
          <div className="text-2xl font-black">Your pick!</div>
          <div className="text-sm font-medium">Call out a category and an amount.</div>
        </div>
      ) : (
        <div className="card text-center text-white/70">{view.controlId ? `${contestantName(view, view.controlId)} picks the next clue.` : view.clue ? "Next clue coming up…" : "Waiting for the next clue…"}</div>
      )}
      {standing && (
        <div className="text-center">
          <div className="text-xs uppercase tracking-wide text-white/50">Your standing</div>
          <div className="text-xl font-bold">{place === 1 ? "🥇 " : ""}{standing}</div>
        </div>
      )}
      <ol className="flex flex-col gap-1.5">
        {rows.map((c) => {
          const isMe = c.id === me.contestantId;
          const streak = view.streaks[c.id] ?? 0;
          return (
            <li key={c.id} className={`flex items-center gap-3 rounded-xl px-3 py-2 ${isMe ? "bg-gold/15 ring-1 ring-gold" : "bg-white/5"}`}>
              <span className="w-6 text-center font-bold text-white/60">{1 + ranked.filter((x) => scoreOf(x.id) > scoreOf(c.id)).length}</span>
              <span className="min-w-0 flex-1 truncate font-semibold" style={c.color ? { color: c.color } : undefined}>
                {c.name}
                {isMe && <span className="ml-1.5 text-xs font-normal text-white/60">you</span>}
              </span>
              {streak >= 3 && <span className="text-sm">🔥{streak}</span>}
              <span className={`money text-lg tabular-nums ${scoreOf(c.id) < 0 ? "!text-red-400" : ""}`}>{formatScore(scoreOf(c.id))}</span>
            </li>
          );
        })}
      </ol>
      {ranked.length > rows.length && <div className="text-center text-xs text-white/40">+{ranked.length - rows.length} more playing</div>}
    </div>
  );
}

function Center({ children }: { children: React.ReactNode }) {
  return <main className="flex min-h-dvh flex-col items-center justify-center gap-4 p-6 text-center">{children}</main>;
}

// --------------------------------------------------------------------- join

function JoinForm({ view, emit, code, rejoinName }: { view: GameView; emit: Emit; code: string; rejoinName?: string }) {
  const [name, setName] = useState(rejoinName ?? "");
  const [drawing, setDrawing] = useState<Drawing | null>(null);
  const [avatar, setAvatar] = useState<Drawing | null>(null);
  const [showAvatar, setShowAvatar] = useState(false);
  const [teamId, setTeamId] = useState<string | null>(null);
  const [busy, setBusy] = useState(false);
  const [err, setErr] = useState<string | null>(null);
  const [seats, setSeats] = useState<{ id: string; name: string }[]>([]);
  const closed = view.lobbyLocked || (view.phase !== "lobby" && !view.settings.allowLateJoin);
  const canWatch = view.settings.audience;
  // An audience link (?audience=1) opens straight on "join the audience".
  const [watchOnly, setWatchOnly] = useState(false);
  useEffect(() => setWatchOnly(new URLSearchParams(window.location.search).get("audience") === "1"), []);
  const asWatcher = watchOnly && canWatch && !closed;

  // Seats whose phone dropped off: let the person take theirs back by name.
  const playerCount = view.players.length;
  useEffect(() => {
    if (rejoinName || !view.settings.reclaimSeats) return;
    let live = true;
    void emit("player:seats", {}).then((r) => {
      if (live && r.ok) setSeats((r.data as { seats: { id: string; name: string }[] }).seats ?? []);
    });
    return () => {
      live = false;
    };
  }, [emit, rejoinName, playerCount, view.settings.reclaimSeats]);

  function done(res: Awaited<ReturnType<Emit>>) {
    setBusy(false);
    if (!res.ok) return setErr(res.error);
    const data = res.data as { playerToken?: string };
    if (data.playerToken) setPlayerToken(code, data.playerToken);
  }
  async function submit(asAudience = false) {
    setBusy(true);
    setErr(null);
    done(
      await emit("player:join", {
        name: name.trim(),
        signature: !asAudience && drawing && !isEmptyDrawing(drawing) ? drawing : null,
        avatar: !asAudience && avatar && !isEmptyDrawing(avatar) ? avatar : null,
        teamId,
        audience: asAudience || undefined,
      }),
    );
  }
  async function reclaim(playerId: string) {
    setBusy(true);
    setErr(null);
    done(await emit("player:reclaim", { playerId }));
  }

  const nameField = (
    <label className="flex flex-col gap-1">
      <span className="text-sm text-white/70">Your name</span>
      <input className="input text-lg" value={name} maxLength={24} onChange={(e) => setName(e.target.value)} placeholder="Type your name" autoComplete="nickname" />
    </label>
  );
  const seatPicker = seats.length > 0 && !rejoinName && (
    <div className="rounded-xl border border-line bg-white/5 p-3">
      <div className="mb-2 text-sm text-white/70">Already playing and lost your connection? Tap your name to take your seat back.</div>
      <div className="flex flex-wrap gap-2">
        {seats.map((seat) => (
          <button key={seat.id} type="button" className="btn-ghost !py-2" disabled={busy} onClick={() => reclaim(seat.id)}>
            {seat.name}
          </button>
        ))}
      </div>
    </div>
  );

  return (
    <main className="mx-auto flex min-h-dvh max-w-xl flex-col gap-4 p-4">
      <div className="text-center">
        <div className="text-sm text-white/50">Joining</div>
        <h1 className="cat-text text-3xl">{view.title}</h1>
        <div className="money text-xl tracking-widest">{code}</div>
      </div>
      {(closed || asWatcher) && !rejoinName ? (
        <>
          {asWatcher ? (
            <div className="card text-center">
              You&apos;re joining the audience.
              <button type="button" className="mt-1 block w-full text-sm text-white/60 underline" onClick={() => setWatchOnly(false)}>I want to play instead</button>
            </div>
          ) : (
            <>
              <div className="card text-center">{view.lobbyLocked ? "The host has locked the room." : "This game has already started and isn't accepting new players."}</div>
              {seatPicker}
            </>
          )}
          {canWatch && (
            <>
              <p className="text-center text-sm text-white/70">{asWatcher ? "Send reactions to the big screen and cheer for a player." : "You can still watch: send reactions to the big screen and cheer for a player."}</p>
              {nameField}
              {err && <div className="rounded-lg bg-red-600/20 p-3 text-red-300">{err}</div>}
              <button className="btn-primary py-4 text-xl" disabled={busy || !name.trim()} onClick={() => submit(true)}>
                {busy ? "Joining…" : "👀 Join the audience"}
              </button>
            </>
          )}
          {!canWatch && err && <div className="rounded-lg bg-red-600/20 p-3 text-red-300">{err}</div>}
        </>
      ) : (
        <>
          {seatPicker}
          {nameField}
          <div>
            <div className="mb-1 flex items-baseline justify-between">
              <span className="text-sm text-white/70">Sign your name ✍️</span>
              <span className="text-xs text-white/40">optional — shown on the big screen</span>
            </div>
            <DrawingPad width={NAME_CANVAS.w} height={NAME_CANVAS.h} multiColor={view.settings.multiColor} onChange={setDrawing} placeholder="Draw your name here" />
          </div>
          {view.settings.avatars &&
            (showAvatar ? (
              <div>
                <div className="mb-1 flex items-baseline justify-between">
                  <span className="text-sm text-white/70">Doodle yourself 🎨</span>
                  <button type="button" className="text-xs text-white/50 underline" onClick={() => { setShowAvatar(false); setAvatar(null); }}>
                    Skip it
                  </button>
                </div>
                <div className="mx-auto max-w-[16rem]">
                  <DrawingPad width={AVATAR_CANVAS.w} height={AVATAR_CANVAS.h} multiColor={view.settings.multiColor} onChange={setAvatar} placeholder="A face, a pig, anything" />
                </div>
              </div>
            ) : (
              <button type="button" className="btn-ghost" onClick={() => setShowAvatar(true)}>
                🎨 Add a doodle avatar (optional)
              </button>
            ))}
          {view.settings.familyMode && <p className="text-xs text-white/50">Family mode is on: the host approves drawings before they appear on the big screen.</p>}
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
          <button className="btn-primary py-4 text-xl" disabled={busy || !name.trim()} onClick={() => submit(false)}>
            {busy ? "Joining…" : rejoinName ? "Rejoin game" : "Join game"}
          </button>
          {canWatch && !rejoinName && (
            <button type="button" className="text-sm text-white/60 underline disabled:opacity-40" disabled={busy || !name.trim()} onClick={() => submit(true)}>
              Just watching? Join the audience instead
            </button>
          )}
        </>
      )}
    </main>
  );
}

// ----------------------------------------------------------------- audience

/** Watching only: follow along, send reactions, and cheer for a contestant. */
function AudienceStage({ view, emit }: { view: GameView; emit: Emit }) {
  const me = view.me!;
  const [msg, setMsg] = useState<string | null>(null);
  const ranked = [...contestants(view)].sort((a, b) => (view.scores[b.id] ?? 0) - (view.scores[a.id] ?? 0));
  const c = view.clue;
  const f = view.final;
  async function cheer(id: string) {
    const r = await emit("player:cheer", { contestantId: me.cheerFor === id ? null : id });
    setMsg(r.ok ? null : r.error);
  }
  return (
    <>
      <header className="flex items-center gap-3 border-b border-white/10 bg-[var(--board-deep)] px-4 py-2">
        <span className="rounded-full bg-white/15 px-2 py-0.5 text-xs font-semibold">👀 AUDIENCE</span>
        <span className="min-w-0 flex-1 truncate font-semibold">{me.name}</span>
        <span className="truncate text-sm text-white/60">{view.title}</span>
      </header>
      <div className="flex flex-1 flex-col gap-4 p-4">
        <div className="card text-center">
          {view.phase === "lobby" && <p>You&apos;re in the audience. Watch the big screen: the game starts soon.</p>}
          {view.phase === "board" && <p className="text-white/70">Waiting for the next clue…</p>}
          {view.phase === "clue" && c && (
            <>
              <div className="text-sm text-white/60">{c.category} · {formatScore(c.value)}</div>
              <p className="mt-1 text-lg font-semibold">{c.text ?? "Daily Double! Waiting for the wager…"}</p>
              {c.answer && <p className="mt-2 text-gold">{c.answer}</p>}
            </>
          )}
          {view.phase === "final" && f && (
            <>
              <div className="text-sm text-white/60">Final · {f.category}</div>
              {f.text && <p className="mt-1 text-lg font-semibold">{f.text}</p>}
              {f.answer && <p className="mt-2 text-gold">{f.answer}</p>}
            </>
          )}
          {view.phase === "finished" && <p className="text-lg font-semibold">🏁 Game over! {ranked[0] ? `${ranked[0].name} wins.` : ""}</p>}
        </div>

        {ranked.length > 0 && (
          <div>
            <div className="mb-2 flex items-baseline justify-between">
              <h2 className="font-semibold">📣 Who are you cheering for?</h2>
              <span className="text-xs text-white/50">The most-cheered player wins Crowd Favorite</span>
            </div>
            <div className="flex flex-col gap-2">
              {ranked.map((r) => (
                <button
                  key={r.id}
                  type="button"
                  aria-pressed={me.cheerFor === r.id}
                  disabled={view.phase === "finished"}
                  onClick={() => cheer(r.id)}
                  className={`flex items-center gap-3 rounded-xl border px-3 py-2.5 text-left ${me.cheerFor === r.id ? "border-gold bg-gold/15" : "border-line bg-white/5"}`}
                >
                  <span className="text-xl">{me.cheerFor === r.id ? "📣" : "🤍"}</span>
                  <span className="min-w-0 flex-1 truncate font-semibold" style={{ color: r.color }}>{r.name}</span>
                  {(view.crowd.cheers[r.id] ?? 0) > 0 && <span className="text-xs text-white/60">{view.crowd.cheers[r.id]} cheering</span>}
                  <span className={`money ${(view.scores[r.id] ?? 0) < 0 ? "!text-red-400" : ""}`}>{formatScore(view.scores[r.id] ?? 0)}</span>
                </button>
              ))}
            </div>
            {msg && <div className="mt-2 text-sm text-red-300">{msg}</div>}
          </div>
        )}
        <div className="mt-auto">{view.settings.reactions && <ReactionBar emit={emit} />}</div>
      </div>
    </>
  );
}

// -------------------------------------------------------------------- stage

function PlayerStage({ view, emit, now, onFlash }: { view: GameView; emit: Emit; now: () => number; onFlash: (s: string) => void }) {
  if (view.phase === "lobby") return <LobbyWait view={view} emit={emit} now={now} />;
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
      ) : view.phase === "board" && !view.clue ? (
        <BetweenClues view={view} />
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

function LobbyWait({ view, emit, now }: { view: GameView; emit: Emit; now: () => number }) {
  const left = useCountdown(view.startingAt, now);
  const isVip = view.vipId === view.me!.playerId;
  const others = view.players.filter((x) => !x.removed).length - 1;
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
      <div className="relative aspect-[5/2] w-full max-w-sm rounded-xl bg-[var(--board)] p-2">
        {p.signature ? <Ink drawing={p.signature} className="h-full w-full" /> : <div className="cat-text grid h-full place-items-center text-3xl">{p.name}</div>}
        {p.avatar && (
          <div className="absolute -right-3 -top-3 h-16 w-16 rounded-full bg-[var(--board-deep)] ring-2 ring-white/40">
            <Ink drawing={p.avatar} className="h-full w-full" />
          </div>
        )}
      </div>
      {p.signatureHidden && (
        <div className="text-sm text-yellow-300">
          {view.settings.familyMode ? "Your drawing shows on the big screen once the host approves it." : "The host hid your drawing — try redrawing it."}
        </div>
      )}
      <button className="btn-ghost" onClick={() => setRedraw(true)}>✏️ Redraw my name</button>
      {left !== null ? (
        <div className="w-full max-w-sm rounded-2xl border border-gold/60 bg-gold/10 p-4">
          <div className="text-sm text-white/70">Starting in</div>
          <div className="money text-6xl">{Math.max(1, Math.ceil(left / 1000))}</div>
          {isVip && (
            <button className="btn-ghost mt-2 w-full" onClick={async () => { const r = await emit("player:start", { cancel: true }); setMsg(r.ok ? null : r.error); }}>
              Wait, not yet
            </button>
          )}
        </div>
      ) : isVip ? (
        <div className="w-full max-w-sm rounded-2xl border border-gold/60 bg-gold/10 p-4">
          <div className="mb-2 text-sm text-white/80">👑 You were first in, so you can start the game.</div>
          <button
            className="btn-primary w-full py-4 text-xl"
            onClick={async () => {
              if (others < 1 && !confirm("You are the only player so far. Start anyway?")) return;
              const r = await emit("player:start", {});
              setMsg(r.ok ? null : r.error);
            }}
          >
            Everybody&apos;s in!
          </button>
          {msg && <div className="mt-2 text-sm text-red-300">{msg}</div>}
        </div>
      ) : (
        <p className="text-white/60">
          Watch the big screen. {view.vipId ? `${view.players.find((x) => x.id === view.vipId)?.name ?? "The host"} starts the game when everybody is in.` : "The game will start soon."}
        </p>
      )}
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

  // A tap in the hand when it is time to act: buzzers just opened, or it is your turn to answer.
  const canPress = !!c && !c.dailyDouble && c.stage === "open" && !c.answering && !attempted && !view.paused;
  useEffect(() => {
    if (canPress) navigator.vibrate?.(25);
  }, [canPress]);
  useEffect(() => {
    if (answeringMe) navigator.vibrate?.([70, 40, 70]);
  }, [answeringMe]);

  let label = "Waiting for a clue…";
  let tone = "bg-neutral-700 text-white/50";
  let enabled = false;
  if (view.paused) label = "Paused";
  else if (c?.dailyDouble) label = `Daily Double for ${contestantName(view, c.dailyDouble.contestantId)}`;
  else if (c) {
    if (c.stage === "revealed") label = "Answer revealed";
    else if (answeringMe) {
      label = "You're in! Answer now";
      tone = "bg-gold text-black podium-buzzed";
    } else if (answeringOther) {
      label = `Locked — ${playerName(view, c.answering)} buzzed in`;
      tone = "bg-neutral-800 text-white/60";
    } else if (attempted) label = "You already answered this one";
    else if (locked) {
      label = "Too early — locked";
      tone = "bg-red-900 text-white/70";
    } else if (c.stage === "open") {
      label = "BUZZ!";
      tone = "bg-red-600 text-white anim-buzz-ready";
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
      {/* Nothing to press once the answer is out: show the standings instead of a dead button. */}
      {c?.stage === "revealed" && !c.dailyDouble ? <BetweenClues view={view} /> : (
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
      )}
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
            className="input text-center font-[family-name:var(--f-display)] text-4xl"
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
  const won = place === 1;
  useEffect(() => {
    if (!won || window.matchMedia?.("(prefers-reduced-motion: reduce)").matches) return;
    navigator.vibrate?.([60, 60, 60, 60, 200]);
    void confetti({ particleCount: 140, spread: 80, origin: { y: 0.35 } });
    const t = setTimeout(() => void confetti({ particleCount: 90, spread: 110, origin: { y: 0.5 } }), 700);
    return () => clearTimeout(t);
  }, [won]);
  const medals = ["🥇", "🥈", "🥉"];
  return (
    <Center>
      <div className="text-6xl">{won ? "🏆" : place === 2 ? "🥈" : place === 3 ? "🥉" : "👏"}</div>
      <h2 className="text-2xl font-bold">{won ? "You won!" : place ? `You finished ${ordinal(place)} of ${ranked.length}` : "Game over"}</h2>
      <div className="money text-5xl">{formatScore(view.scores[me.contestantId ?? ""] ?? 0)}</div>
      {ranked.length > 1 && (
        <ol className="flex w-full max-w-xs flex-col gap-1.5 text-left">
          {ranked.slice(0, 3).map((id, i) => (
            <li key={id} className={`flex items-center gap-3 rounded-xl px-3 py-2 ${id === me.contestantId ? "bg-gold/15 ring-1 ring-gold" : "bg-white/5"}`}>
              <span className="text-xl">{medals[i]}</span>
              <span className="min-w-0 flex-1 truncate font-semibold">{contestantName(view, id)}</span>
              <span className="money text-lg tabular-nums">{formatScore(view.scores[id] ?? 0)}</span>
            </li>
          ))}
        </ol>
      )}
      {(view.awards ?? [])
        .filter((a) => a.winnerId === me.playerId || a.winnerId === me.contestantId)
        .map((a) => (
          <div key={a.id} className="w-full max-w-xs rounded-xl bg-white/10 p-3">
            <div className="text-3xl">{a.emoji}</div>
            <div className="font-bold text-gold">{a.title}</div>
            <div className="text-sm text-white/70">{a.detail}</div>
          </div>
        ))}
      {view.gameId && (
        <a href={`/r/${view.gameId}`} className="btn-ghost w-full max-w-xs">See the full results</a>
      )}
      <p className="text-white/60">Thanks for playing! Stay here — if the host starts a rematch you&apos;ll be moved automatically.</p>
    </Center>
  );
}
