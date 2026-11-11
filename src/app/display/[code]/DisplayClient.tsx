"use client";

import { useEffect, useMemo, useRef, useState } from "react";
import confetti from "canvas-confetti";
import { useGame, useTick } from "@/client/useGame";
import { readingTimeMs } from "@/engine/reducer";
import { sound } from "@/client/sound";
import { useWakeLock } from "@/client/useWakeLock";
import type { GameView } from "@/engine/views";
import { TEAM_COLORS, type FxEvent, type PresenceView } from "@/shared/protocol";
import { Ink } from "@/components/Ink";
import {
  APP_NAME,
  ConnBanner,
  MediaView,
  Qr,
  Signature,
  TimerBar,
  contestantName,
  contestants,
  formatScore,
  useCountdown,
  useOrigin,
  type Contestant,
} from "@/components/game";

export default function DisplayClient({ code }: { code: string }) {
  const [soundOn, setSoundOn] = useState(false);
  useWakeLock();
  const viewRef = useRef<GameView | null>(null);

  const [reactions, setReactions] = useState<{ key: number; emoji: string; x: number; name: string }[]>([]);
  const reactionKey = useRef(0);

  const [caption, setCaption] = useState<{ key: number; text: string } | null>(null);
  const captionKey = useRef(0);
  const say = (text: string) => {
    const key = ++captionKey.current;
    setCaption({ key, text });
    setTimeout(() => setCaption((c) => (c?.key === key ? null : c)), 3200);
  };

  const onFx = (fx: FxEvent) => {
    const v = viewRef.current;
    if (v?.settings.captions && fx.cue !== "react") {
      const who = fx.playerId ? (v.players.find((p) => p.id === fx.playerId)?.name ?? "A player") : "";
      const text = fx.cue === "sfx" ? `[${fx.id ?? "sound"}]` : fx.cue === "buzz" ? `[buzz] ${who} buzzed in` : fx.cue === "join" ? `[chime] ${who} joined` : CAPTIONS[fx.cue];
      if (text) say(text);
    }
    if (fx.cue === "react") {
      if (!fx.id || v?.settings.reactions === false) return;
      const key = ++reactionKey.current;
      const name = v?.players.find((p) => p.id === fx.playerId)?.name ?? "";
      setReactions((list) => [...list.slice(-40), { key, emoji: fx.id!, x: 4 + Math.random() * 88, name }]);
      setTimeout(() => setReactions((list) => list.filter((r) => r.key !== key)), 3600);
      return;
    }
    const idx = fx.playerId ? (v?.players.find((p) => p.id === fx.playerId)?.index ?? 0) : undefined;
    if (fx.cue === "sfx" && fx.id) sound().play(fx.id);
    else sound().play(fx.cue, idx);
  };

  const { view, presence, status, error, now } = useGame({
    role: "display",
    code,
    onFx,
    onRedirect: (next) => window.location.replace(`/display/${next}`),
  });
  viewRef.current = view;

  useEffect(() => {
    if (view) sound().apply(view.settings.sound);
  }, [view?.settings.sound]); // eslint-disable-line react-hooks/exhaustive-deps

  // "Time's up" when any timer hits zero (once per timer).
  const timerEnd = view?.timer?.endsAt ?? null;
  const left = useCountdown(timerEnd, now);
  const firedFor = useRef<number | null>(null);
  useEffect(() => {
    if (timerEnd && left === 0 && firedFor.current !== timerEnd) {
      firedFor.current = timerEnd;
      if (view?.timer?.label !== "final") sound().play("timesUp");
      if (view?.settings.captions) say("[beeps] Time is up");
    }
  }, [left, timerEnd, view?.timer?.label]);

  // Upbeat original loop while the room fills; it stops the moment the game starts.
  const inLobby = view?.phase === "lobby";
  useEffect(() => {
    if (!soundOn || !inLobby) return;
    sound().startLobbyMusic();
    return () => sound().stopMusic();
  }, [soundOn, inLobby]);

  if (!view) {
    return (
      <Shell>
        <ConnBanner status={status} error={error} />
        <div className="grid h-full place-items-center text-[4vmin] text-white/70">
          {status === "error" ? (error ?? "Game not found") : "Connecting to game…"}
        </div>
      </Shell>
    );
  }

  return (
    <Shell>
      <ConnBanner status={status} error={error} />
      <Stage view={view} now={now} presence={presence} />
      {caption && (
        <div key={caption.key} className="anim-pop pointer-events-none fixed bottom-[3vmin] left-1/2 z-30 -translate-x-1/2 rounded-[1vmin] bg-black/85 px-[2.4vmin] py-[1vmin] text-[2.8vmin] font-semibold text-white" role="status" aria-live="polite">
          {caption.text}
        </div>
      )}
      {view.screen === "scores" && <ScoresOverlay view={view} />}
      {view.announcement && <Announcement key={view.announcement.at} text={view.announcement.text} />}
      {view.showJoinQr && view.phase !== "lobby" && !view.settings.hideCode && <CornerQr code={view.code} />}
      {view.screen === "none" && (
        <div className="pointer-events-none fixed inset-0 z-20 overflow-hidden" aria-hidden>
          {reactions.map((r) => (
            <div key={r.key} className="anim-react absolute bottom-0 flex flex-col items-center" style={{ left: `${r.x}%` }}>
              <span className="text-[7vmin] leading-none drop-shadow-lg">{r.emoji}</span>
              {r.name && <span className="mt-[0.4vmin] rounded-full bg-black/45 px-[1vmin] text-[1.5vmin] text-white/85">{r.name}</span>}
            </div>
          ))}
        </div>
      )}
      {view.paused && view.screen === "none" && <PausedOverlay />}
      {view.screen === "brb" && <BrbScreen title={view.title} />}
      {view.screen === "blank" && <div className="fixed inset-0 z-40 bg-black" />}
      {!soundOn && (
        <EnableSound
          onEnable={async () => {
            await sound().unlock();
            setSoundOn(true);
          }}
        />
      )}
      <FullscreenButton />
    </Shell>
  );
}

/** Text shown for each sound cue when captions are on. */
const CAPTIONS: Record<string, string> = {
  boardFill: "[chimes] The board fills in",
  clueOpen: "[whoosh] Clue opened",
  buzzersOpen: "[tone] Buzzers are open",
  dailyDouble: "[fanfare] Daily Double",
  correct: "[ding] Correct",
  incorrect: "[buzzer] Incorrect",
  reveal: "[chime] Answer revealed",
  roundTransition: "[fanfare] Next round",
  finalStart: "[chords] Final round",
  think: "[music] Thinking music",
  finalReveal: "[swish] Reveal",
  finalWager: "[rising tones] Wager",
  gameOver: "[fanfare] Game over",
  announce: "[chime] Announcement",
};

function Shell({ children }: { children: React.ReactNode }) {
  return <main className="relative h-dvh w-screen select-none overflow-hidden bg-[var(--board-edge)] text-white">{children}</main>;
}

function Stage({ view, now, presence }: { view: GameView; now: () => number; presence: PresenceView | null }) {
  switch (view.phase) {
    case "lobby":
      return <Lobby view={view} presence={presence} now={now} />;
    case "board":
      return (
        <WithPodiums view={view}>
          <BoardGrid view={view} />
        </WithPodiums>
      );
    case "clue":
      return (
        <WithPodiums view={view}>
          <ClueScreen view={view} now={now} />
        </WithPodiums>
      );
    case "final":
      return <FinalScreen view={view} now={now} />;
    case "finished":
      return <WinnerScreen view={view} />;
  }
}

// ------------------------------------------------------------------- lobby

/** Deterministic little tilt per card so the wall of names looks hand-pinned, not gridded. */
const TILTS = [-2.2, 1.6, -1.1, 2.4, -1.8, 0.9, 2, -2.6, 1.2, -0.7];

/**
 * The room screen everyone sees while people join: where to go, the room code,
 * and a wall of name cards that pop in as each person finishes drawing theirs.
 */
function Lobby({ view, presence, now }: { view: GameView; presence: PresenceView | null; now: () => number }) {
  const origin = useOrigin();
  const joinUrl = `${origin}/join?code=${view.code}`;
  const host = origin.replace(/^https?:\/\//, "");
  const list = view.players.filter((p) => !p.removed);
  const n = list.length;
  // Open seats so the room looks like it is waiting for you.
  const open = view.lobbyLocked ? 0 : n === 0 ? 3 : 1;
  const wall = useRef<HTMLDivElement>(null);
  const fit = useCardFit(wall, n + open);
  const teamOf = (id: string | null) => view.teams.find((t) => t.id === id);

  return (
    <div className="lobby-bg flex h-full flex-col gap-[2vmin] p-[3vmin]">
      <header className="flex items-center gap-[3vmin]">
        <div className="min-w-0 flex-1">
          <div className="cat-text text-[2.6vmin] text-white/60">🐷 {APP_NAME}</div>
          <h1 className="cat-text truncate text-[5.5vmin] leading-tight text-white">{view.title}</h1>
        </div>
        {view.settings.hideCode ? (
          <div className="flex shrink-0 items-center gap-[2vmin] rounded-[2vmin] bg-black/35 px-[2.6vmin] py-[1.8vmin] shadow-xl ring-1 ring-white/10">
            <span className="text-[5vmin]">🤫</span>
            <div>
              <div className="cat-text text-[3vmin] text-gold">Room code hidden</div>
              <div className="text-[2.1vmin] text-white/70">The host will send you the link to join.</div>
            </div>
          </div>
        ) : (
          <div className="flex shrink-0 items-center gap-[2.5vmin] rounded-[2vmin] bg-black/35 p-[1.6vmin] pl-[2.6vmin] shadow-xl ring-1 ring-white/10">
            <div className="flex flex-col gap-[0.6vmin]">
              <div className="text-[2.2vmin] text-white/70">
                On your phone, go to <span className="cat-text text-[2.8vmin] text-gold">{host}/join</span>
              </div>
              <div className="flex items-center gap-[1.6vmin]">
                <span className="text-[2vmin] font-semibold uppercase tracking-[0.25em] text-white/60">Room code</span>
                <div className="flex gap-[0.8vmin]" aria-label={`Room code ${view.code}`}>
                  {view.code.split("").map((ch, i) => (
                    <span key={i} className="money grid h-[10vmin] w-[7.6vmin] place-items-center rounded-[1.2vmin] bg-white text-[8vmin] leading-none text-[var(--board-edge)] shadow-lg">
                      {ch}
                    </span>
                  ))}
                </div>
              </div>
            </div>
            {origin && <Qr value={joinUrl} className="w-[15vmin] shrink-0 rounded-[1vmin] bg-white p-[0.6vmin] [&>svg]:h-auto [&>svg]:w-full" />}
          </div>
        )}
      </header>

      <div ref={wall} className="grid min-h-0 flex-1 place-content-center overflow-hidden" style={{ gridTemplateColumns: `repeat(${fit.cols}, ${fit.w}px)`, gap: fit.gap, fontSize: fit.w * 0.075 }}>
        {list.map((p) => {
          const color = (view.settings.mode === "team" && teamOf(p.teamId)?.color) || TEAM_COLORS[p.index % TEAM_COLORS.length];
          const away = !p.bot && presence?.players[p.id] !== undefined && presence.players[p.id] !== "online";
          return (
            <div key={p.id} className="anim-pop">
              <div
                className={`anim-bob relative flex flex-col rounded-[0.7em] bg-[var(--board)] p-[0.4em] transition-opacity ${away ? "opacity-45" : ""}`}
                style={{ rotate: `${TILTS[p.index % TILTS.length]}deg`, animationDelay: `${(p.index % 7) * -0.45}s`, boxShadow: `0 0 0 0.2em ${color}, 0 0.5em 1.2em rgba(0,0,0,.45)` }}
              >
                <div className="aspect-[5/2] w-full rounded-[0.45em] bg-[var(--board-deep)] p-[0.2em] text-[1.5em]">
                  <Signature player={p} className="h-full w-full" />
                </div>
                {p.avatar && (
                  <div className="absolute -right-[0.6em] -top-[0.6em] h-[2.9em] w-[2.9em] rounded-full bg-[var(--board-deep)] p-[0.1em]" style={{ boxShadow: `0 0 0 0.15em ${color}` }}>
                    <Ink drawing={p.avatar} className="h-full w-full" />
                  </div>
                )}
                {view.vipId === p.id && (
                  <span className="absolute -left-[0.5em] -top-[0.8em] text-[1.5em] leading-none drop-shadow" title="Can start the game from their phone">
                    👑
                  </span>
                )}
                <div className="mt-[0.3em] flex h-[1.4em] items-center justify-center gap-[0.4em] text-[0.85em] font-semibold leading-none">
                  <span className="h-[0.6em] w-[0.6em] shrink-0 rounded-full" style={{ background: color }} />
                  <span className="truncate">{p.name}</span>
                  {p.bot && <span className="rounded bg-white/15 px-[0.3em] text-[0.8em] font-normal text-white/70">bot</span>}
                  {view.settings.mode === "team" && <span className="truncate font-normal text-white/60">· {teamOf(p.teamId)?.name ?? "no team yet"}</span>}
                  {away && <span className="font-normal text-white/60">· away</span>}
                </div>
              </div>
            </div>
          );
        })}
        {Array.from({ length: open }, (_, i) => (
          <div key={`open${i}`} className="flex flex-col rounded-[0.7em] border-[0.15em] border-dashed border-white/15 p-[0.4em]">
            <div className="grid aspect-[5/2] w-full place-items-center text-[0.9em] text-white/30">{i === 0 ? "Your name here" : ""}</div>
            <div className="mt-[0.3em] h-[1.19em]" />
          </div>
        ))}
      </div>

      <footer className="flex items-center justify-between gap-[3vmin] text-[2.6vmin]">
        <div className="text-white/80">
          <span className="money text-[3.6vmin] text-gold">{n}</span> {n === 1 ? "player is" : "players are"} in
          {view.crowd.count > 0 && <span className="text-white/60"> · {view.crowd.count} watching</span>}
        </div>
        {view.lobbyLocked ? (
          <div className="rounded-full bg-red-600 px-[2vmin] py-[0.6vmin] text-[2.2vmin] font-bold">ROOM LOCKED · starting soon</div>
        ) : (
          <div className="animate-pulse text-white/70">
            {n === 0 ? "Waiting for the first player…" : view.vipId ? `Draw your name to join. 👑 ${list.find((p) => p.id === view.vipId)?.name ?? "The host"} starts when everybody is in.` : "Draw your name to join. The host starts when everybody is in."}
          </div>
        )}
      </footer>
      {view.startingAt && <StartCountdown at={view.startingAt} now={now} />}
    </div>
  );
}

/** "Starting in 3… 2… 1…" over the room screen, with a tick each second. */
function StartCountdown({ at, now }: { at: number; now: () => number }) {
  const left = useCountdown(at, now) ?? 0;
  const sec = Math.max(1, Math.ceil(left / 1000));
  useEffect(() => {
    sound().play("tick");
  }, [sec]);
  return (
    <div className="pointer-events-none fixed inset-0 z-10 grid place-items-center bg-black/55">
      <div className="text-center">
        <div className="cat-text text-[5vmin] text-white/85">Get ready! Starting in</div>
        <div key={sec} className="anim-pop money text-[34vmin] leading-none">{sec}</div>
        <div className="text-[2.6vmin] text-white/70">Last chance to join</div>
      </div>
    </div>
  );
}

/** Width / height of one name card, including its label (kept a little generous so tilted cards never clip). */
const CARD_RATIO = 1.62;

/**
 * Pick the column count and card width that make `count` cards as large as
 * possible inside the element, so 3 players and 300 players both fill the wall.
 */
function useCardFit(ref: React.RefObject<HTMLDivElement | null>, count: number) {
  const [fit, setFit] = useState({ cols: 3, w: 200, gap: 16 });
  useEffect(() => {
    const el = ref.current;
    if (!el) return;
    const measure = () => {
      const W = el.clientWidth;
      const H = el.clientHeight;
      if (!W || !H) return;
      const total = Math.max(1, count);
      let best = { cols: 1, w: 0, gap: 8 };
      for (let cols = 1; cols <= total; cols++) {
        const rows = Math.ceil(total / cols);
        // The gap scales with the card, so solve for the width that fits both ways (gap = 9% of width).
        const byW = W / (cols + (cols + 1) * 0.09);
        const byH = (H / (rows + (rows + 1) * 0.09 * CARD_RATIO)) * CARD_RATIO;
        const w = Math.min(byW, byH, Math.min(W, H) * 0.62);
        if (w > best.w) best = { cols, w, gap: w * 0.09 };
      }
      setFit((f) => (f.cols === best.cols && Math.abs(f.w - best.w) < 0.5 ? f : { cols: best.cols, w: Math.floor(best.w), gap: Math.floor(best.gap) }));
    };
    measure();
    const ro = new ResizeObserver(measure);
    ro.observe(el);
    return () => ro.disconnect();
  }, [ref, count]);
  return fit;
}

// -------------------------------------------------------------------- board

function BoardGrid({ view }: { view: GameView }) {
  const board = view.board;
  if (!board) return null;
  const cols = board.categories.length;
  const rows = board.values.length;
  return (
    <div className="h-full p-[1vmin]">
      <div className="mb-[0.8vmin] text-center text-[2.2vmin] text-white/60 uppercase tracking-widest">{view.rounds[view.roundIndex]?.name}</div>
      <div
        key={view.roundIndex}
        className="grid h-[calc(100%-3.5vmin)] gap-[0.6vmin] bg-black p-[0.6vmin]"
        style={{ gridTemplateColumns: `repeat(${cols}, minmax(0, 1fr))`, gridTemplateRows: `1.25fr repeat(${rows}, minmax(0, 1fr))` }}
      >
        {board.categories.map((cat, ci) => (
          <div key={cat.id} className="board-cell anim-fill grid place-items-center overflow-hidden px-[0.8vmin] text-center" style={{ animationDelay: `${ci * 60}ms` }}>
            <span className="cat-text" style={{ fontSize: `${Math.min(3.6, 22 / Math.max(cols, 3))}vmin` }}>{cat.name}</span>
          </div>
        ))}
        {Array.from({ length: rows }).flatMap((_, ri) =>
          board.categories.map((cat, ci) => {
            const cell = cat.clues[ri];
            const show = cell && cell.playable && !cell.used;
            return (
              <div key={`${cat.id}-${ri}`} className="board-cell anim-fill grid place-items-center" style={{ animationDelay: `${200 + ((ri * cols + ci) * 37) % 900}ms` }}>
                {show && <span className="money" style={{ fontSize: `${Math.min(7, 40 / Math.max(cols, 4))}vmin` }}>${cell.value}</span>}
              </div>
            );
          }),
        )}
      </div>
    </div>
  );
}

// --------------------------------------------------------------------- clue

function ClueScreen({ view, now }: { view: GameView; now: () => number }) {
  const c = view.clue!;
  const ddPending = c.dailyDouble && c.dailyDouble.wager === null;
  const answering = view.players.find((p) => p.id === c.answering);
  return (
    <div key={c.id} className="board-cell anim-clue relative flex h-full flex-col items-center justify-center gap-[3vmin] p-[5vmin] text-center">
      {!c.dailyDouble && !c.allPlay && <BuzzLights clue={c} now={now} />}
      <div className="absolute left-[3vmin] top-[2vmin] cat-text text-[2.6vmin] text-white/70">
        {c.category} · <span className="text-gold">${c.dailyDouble?.wager ?? c.value}</span>
      </div>
      {ddPending ? (
        <div className="anim-dd">
          <div className="cat-text text-[13vmin] leading-none text-gold">Daily Double!</div>
          <div className="mt-[3vmin] text-[3.5vmin] text-white/80">{contestantName(view, c.dailyDouble!.contestantId)} — make your wager</div>
        </div>
      ) : (
        <>
          {c.dailyDouble && <div className="cat-text text-[3vmin] text-gold">Daily Double · {contestantName(view, c.dailyDouble.contestantId)} wagered ${c.dailyDouble.wager}</div>}
          {c.media && <MediaView media={c.media} autoPlay className="max-h-[42vh] max-w-[85vw] rounded-[1vmin]" />}
          <div className="clue-text max-w-[90vw]" style={{ fontSize: `${clueSize(c.text ?? "", !!c.media) * (c.allPlay?.stage === "judging" ? 0.6 : 1)}vmin` }}>{c.text}</div>
          {c.allPlay && <AllPlayPanel view={view} />}
          {c.stage === "revealed" && (
            <div className="anim-pop mt-[1vmin] rounded-[1.5vmin] bg-black/35 px-[4vmin] py-[2vmin]">
              {c.answerMedia && <MediaView media={c.answerMedia} autoPlay className="mx-auto mb-[1.5vmin] max-h-[30vh] rounded-[1vmin]" />}
              <div className="clue-text text-[5vmin] text-gold">{c.answer}</div>
              {c.nobody && <div className="mt-[1vmin] text-[2.4vmin] text-white/70">Nobody got it</div>}
            </div>
          )}
        </>
      )}
      <div className="absolute inset-x-[10vmin] bottom-[3vmin] flex flex-col items-center gap-[1.2vmin]">
        {c.stage === "open" && !c.allPlay && <div className="rounded-full bg-green-600/90 px-[2.5vmin] py-[0.6vmin] text-[2.4vmin] font-bold">BUZZERS OPEN</div>}
        {answering && <div className="cat-text text-[3.2vmin] text-gold">{answering.name}</div>}
        {view.timer && <TimerBar startedAt={view.timer.startedAt} endsAt={view.timer.endsAt} now={now} className="h-[1.2vmin] w-full" />}
      </div>
    </div>
  );
}

/**
 * Light bars down both edges of the clue, like the lights around a studio board:
 * they fill while the clue is being read (when buzzers open automatically),
 * turn solid green the instant buzzers open, and gold while someone answers.
 */
function BuzzLights({ clue, now }: { clue: NonNullable<GameView["clue"]>; now: () => number }) {
  const counting = clue.stage === "reading" && !!clue.autoUnlockAt;
  useTick(80, counting);
  const SEGMENTS = 9;
  let lit = 0;
  let tone = "bg-white/10";
  if (clue.stage === "open") {
    lit = SEGMENTS;
    tone = "bg-green-400 shadow-[0_0_2.5vmin_0.6vmin_rgba(74,222,128,0.85)]";
  } else if (clue.stage === "answering") {
    lit = SEGMENTS;
    tone = "bg-[var(--gold)] shadow-[0_0_2vmin_0.4vmin_rgba(255,207,63,0.7)]";
  } else if (counting) {
    const total = readingTimeMs(clue.text ?? "");
    const frac = 1 - Math.min(1, Math.max(0, (clue.autoUnlockAt! - now()) / total));
    lit = Math.floor(frac * SEGMENTS);
    tone = "bg-white/80 shadow-[0_0_1.2vmin_0.2vmin_rgba(255,255,255,0.5)]";
  }
  if (clue.stage === "revealed") return null;
  const bar = (side: string) => (
    <div className={`absolute inset-y-[2vmin] ${side} flex w-[1.6vmin] flex-col-reverse gap-[0.8vmin]`} aria-hidden>
      {Array.from({ length: SEGMENTS }, (_, i) => (
        <div key={i} className={`flex-1 rounded-full transition-colors duration-100 ${i < lit ? tone : "bg-white/10"}`} />
      ))}
    </div>
  );
  return (
    <>
      {bar("left-[1.2vmin]")}
      {bar("right-[1.2vmin]")}
    </>
  );
}

/** All-play clue: who has answered while writing, then each answer as the host rules on it. */
function AllPlayPanel({ view }: { view: GameView }) {
  const c = view.clue!;
  const ap = c.allPlay!;
  const list = contestants(view);
  if (ap.stage === "writing" && c.stage !== "revealed") {
    return (
      <div>
        <div className="cat-text text-[3.4vmin] text-gold">Everybody plays! Write your answer on your phone</div>
        <SubmittedRow view={view} flags={Object.fromEntries(list.map((x) => [x.id, !!ap.hasAnswer[x.id]]))} label="answered" />
      </div>
    );
  }
  const answered = list.filter((x) => ap.hasAnswer[x.id]);
  if (!answered.length) return <div className="text-[3vmin] text-white/70">Nobody wrote an answer</div>;
  const w = answered.length <= 3 ? 26 : answered.length <= 6 ? 20 : 15;
  return (
    <div className="flex max-w-[94vw] flex-wrap justify-center gap-[1.6vmin]">
      {answered.map((x) => {
        const judged = ap.judged[x.id];
        const shown = !!ap.answers[x.id] || ap.typed[x.id] !== undefined;
        return (
          <div key={x.id} className="relative flex flex-col items-center" style={{ width: `${w}vmin` }}>
            <div
              className={`aspect-[16/9] w-full rounded-[1vmin] bg-[var(--board-deep)] p-[0.6vmin] shadow-xl ring-[0.4vmin] ${
                judged === true ? "ring-green-400" : judged === false ? "ring-red-500/80" : "ring-white/15"
              }`}
            >
              {!shown ? (
                <div className="grid h-full place-items-center text-[4vmin] text-white/40">?</div>
              ) : ap.answers[x.id] ? (
                <Ink drawing={ap.answers[x.id]} className="h-full w-full" />
              ) : (
                <div className="clue-text grid h-full place-items-center px-[0.5vmin] text-[2.2vmin] leading-tight">{ap.typed[x.id] || "(blank)"}</div>
              )}
            </div>
            {judged !== undefined && (
              <div className={`anim-pop absolute right-[-1vmin] top-[-1vmin] grid h-[4.5vmin] w-[4.5vmin] place-items-center rounded-full text-[2.8vmin] font-black ${judged ? "bg-green-500" : "bg-red-500"}`}>
                {judged ? "✓" : "✗"}
              </div>
            )}
            <div className="mt-[0.5vmin] max-w-full truncate text-[2vmin]" style={{ color: x.color }}>{x.name}{judged === true && <span className="money ml-[0.8vmin]">+{c.value}</span>}</div>
          </div>
        );
      })}
    </div>
  );
}

function clueSize(text: string, hasMedia: boolean) {
  const len = text.length;
  const base = len < 60 ? 7.5 : len < 120 ? 6 : len < 200 ? 5 : 4;
  return hasMedia ? base * 0.7 : base;
}

// ------------------------------------------------------------------ podiums

function WithPodiums({ view, children }: { view: GameView; children: React.ReactNode }) {
  const list = contestants(view);
  return (
    <div className="flex h-full flex-col">
      <div className="min-h-0 flex-1">{children}</div>
      {list.length > 0 && <PodiumRow view={view} list={list} />}
    </div>
  );
}

/** More podiums than this do not fit legibly across a TV. */
const MAX_PODIUMS = 10;

function PodiumRow({ view, list: everyone }: { view: GameView; list: Contestant[] }) {
  const answeringPlayer = view.clue?.answering ?? null;
  const ddId = view.clue?.dailyDouble?.contestantId ?? null;
  let list = everyone;
  if (everyone.length > MAX_PODIUMS) {
    // Big room: the leaders, plus whoever is in the spotlight right now.
    const ranked = [...everyone].sort((a, b) => (view.scores[b.id] ?? 0) - (view.scores[a.id] ?? 0));
    const spot = everyone.filter((c) => c.id === ddId || c.id === view.controlId || (!!answeringPlayer && c.players.some((p) => p.id === answeringPlayer)));
    const picked = new Set(spot.map((c) => c.id));
    for (const c of ranked) {
      if (picked.size >= MAX_PODIUMS - 1) break;
      picked.add(c.id);
    }
    list = ranked.filter((c) => picked.has(c.id));
  }
  const hidden = everyone.length - list.length;
  return (
    <div className="flex h-[19vh] shrink-0 items-stretch justify-center gap-[1.2vmin] bg-gradient-to-b from-[#3a2a0a] to-[#1a1204] px-[1vmin] py-[1vmin]">
      {hidden > 0 && (
        <div className="order-last flex shrink-0 flex-col items-center justify-center px-[1.5vmin] text-center text-white/70">
          <div className="money text-[3.4vmin] text-gold">+{hidden}</div>
          <div className="text-[1.7vmin]">more playing</div>
        </div>
      )}
      {list.map((c) => {
        const buzzed = !!answeringPlayer && c.players.some((p) => p.id === answeringPlayer);
        const score = view.scores[c.id] ?? 0;
        const isTeam = view.settings.mode === "team";
        const attempted = view.clue?.attempted.includes(c.id);
        return (
          <div
            key={c.id}
            className={`flex min-w-0 max-w-[30vmin] flex-1 flex-col overflow-hidden rounded-[1vmin] border-[0.3vmin] bg-[var(--board-deep)] transition ${buzzed || ddId === c.id ? "podium-buzzed border-gold" : "border-[#6b5a2a]"} ${attempted ? "opacity-50" : ""}`}
          >
            <div className={`money grid h-[36%] place-items-center bg-[var(--board)] text-[3.6vmin] ${score < 0 ? "!text-red-400" : ""}`}>{formatScore(score)}</div>
            <div className="relative min-h-0 flex-1 p-[0.5vmin] text-[2.4vmin]">
              {isTeam ? (
                <div className="flex h-full flex-col items-center justify-center">
                  <div className="cat-text text-[2.6vmin]" style={{ color: c.color }}>{c.name}</div>
                  <div className="flex h-[55%] w-full justify-center gap-[0.4vmin]">
                    {c.players.slice(0, 4).map((p) => (
                      <Signature key={p.id} player={p} className={`h-full min-w-0 flex-1 text-[1.4vmin] ${answeringPlayer === p.id ? "rounded bg-gold/30" : ""}`} />
                    ))}
                  </div>
                </div>
              ) : (
                <Signature player={c.players[0]} className="h-full w-full" />
              )}
              {!isTeam && c.players[0]?.avatar && (
                <div className="absolute left-[0.3vmin] top-[0.3vmin] h-[3.6vmin] w-[3.6vmin] rounded-full bg-black/45">
                  <Ink drawing={c.players[0].avatar} className="h-full w-full" />
                </div>
              )}
              {view.controlId === c.id && view.phase === "board" && <div className="absolute right-[0.5vmin] top-[0.3vmin] text-[1.8vmin] text-gold">●</div>}
            </div>
          </div>
        );
      })}
    </div>
  );
}

// -------------------------------------------------------------------- final

function FinalScreen({ view, now }: { view: GameView; now: () => number }) {
  const f = view.final!;
  const current = f.current;
  const cur = current ? contestants(view).find((c) => c.id === current) : null;
  const r = current ? f.revealed[current] : null;
  return (
    <div className="flex h-full flex-col">
      <div className="board-cell relative flex min-h-0 flex-1 flex-col items-center justify-center gap-[2.5vmin] p-[4vmin] text-center">
        <div className="cat-text text-[3vmin] tracking-widest text-gold">Final Jeopardy!</div>
        {f.stage === "category" && (
          <div className="anim-clue">
            <div className="cat-text text-[9vmin]">{f.category}</div>
            <div className="mt-[3vmin] text-[3vmin] text-white/75">Enter your wager on your phone</div>
            <SubmittedRow view={view} flags={f.hasWager} label="wagered" />
          </div>
        )}
        {(f.stage === "clue" || f.stage === "writing") && (
          <>
            <div className="cat-text text-[3.5vmin] text-white/70">{f.category}</div>
            {f.media && <MediaView media={f.media} autoPlay className="max-h-[38vh] rounded-[1vmin]" />}
            <div className="clue-text anim-clue max-w-[90vw]" style={{ fontSize: `${clueSize(f.text ?? "", !!f.media)}vmin` }}>{f.text}</div>
            {f.stage === "writing" && view.timer && <TimerBar startedAt={view.timer.startedAt} endsAt={view.timer.endsAt} now={now} className="h-[1.2vmin] w-[70%]" />}
            <SubmittedRow view={view} flags={f.hasAnswer} label="answered" />
          </>
        )}
        {f.stage === "closed" && (
          <div className="anim-pop">
            <div className="cat-text text-[8vmin]">Pencils down!</div>
            <div className="mt-[2vmin] text-[3vmin] text-white/70">Let&apos;s see the answers…</div>
          </div>
        )}
        {(f.stage === "reveal" || f.stage === "done") && cur && r && (
          <div key={cur.id} className="anim-pop flex w-full flex-col items-center gap-[2vmin]">
            <div className="cat-text text-[5vmin]" style={{ color: cur.color }}>{cur.name}</div>
            <div className="relative aspect-[16/9] w-[min(70vw,120vh)] rounded-[1.5vmin] bg-[var(--board-deep)] p-[1vmin] shadow-2xl">
              {f.answers[cur.id] ? (
                <Ink drawing={f.answers[cur.id]} className="h-full w-full" />
              ) : (
                <div className="clue-text grid h-full place-items-center text-[6vmin]">{f.typed[cur.id] || "(no answer)"}</div>
              )}
              {r.judged !== null && (
                <div className={`absolute right-[-2vmin] top-[-2vmin] grid h-[10vmin] w-[10vmin] place-items-center rounded-full text-[6vmin] font-black shadow-xl anim-pop ${r.judged ? "bg-green-500" : "bg-red-500"}`}>
                  {r.judged ? "✓" : "✗"}
                </div>
              )}
            </div>
            <div className="flex items-center gap-[4vmin] text-[4vmin]">
              <span className="text-white/60">Wager:</span>
              <span className="money">{r.wager ? `$${(f.wagers[cur.id] ?? 0).toLocaleString()}` : "???"}</span>
              <span className="text-white/60">Score:</span>
              <span className={`money ${(view.scores[cur.id] ?? 0) < 0 ? "!text-red-400" : ""}`}>{formatScore(view.scores[cur.id] ?? 0)}</span>
            </div>
          </div>
        )}
        {f.answer && (f.stage === "done" || f.stage === "reveal") && (
          <div className="rounded-[1vmin] bg-black/35 px-[3vmin] py-[1vmin] text-[3vmin]">
            Correct response: <span className="clue-text text-gold">{f.answer}</span>
          </div>
        )}
      </div>
      <PodiumRow view={view} list={contestants(view)} />
    </div>
  );
}

function SubmittedRow({ view, flags, label }: { view: GameView; flags: Record<string, boolean>; label: string }) {
  const ids = Object.keys(flags);
  if (!ids.length) return null;
  return (
    <div className="mt-[2vmin] flex flex-wrap justify-center gap-[1.5vmin] text-[2.2vmin]">
      {ids.map((id) => (
        <span key={id} className={`rounded-full px-[1.8vmin] py-[0.5vmin] ${flags[id] ? "bg-green-600" : "bg-white/10 text-white/60"}`}>
          {contestantName(view, id)} {flags[id] ? `✓ ${label}` : "…"}
        </span>
      ))}
    </div>
  );
}

// ------------------------------------------------------------------- winner

function WinnerScreen({ view }: { view: GameView }) {
  const ranked = useMemo(() => [...contestants(view)].sort((a, b) => (view.scores[b.id] ?? 0) - (view.scores[a.id] ?? 0)), [view]);
  const top = ranked[0];
  const winners = ranked.filter((c) => (view.scores[c.id] ?? 0) === (view.scores[top?.id ?? ""] ?? 0));
  const rest = ranked.slice(winners.length);
  const origin = useOrigin();
  useEffect(() => {
    const end = Date.now() + 4500;
    const colors = ["#ffcf3f", "#ffffff", "#4ff0b1", "#ff5d73", "#7bdff2"];
    let raf = 0;
    const frame = () => {
      confetti({ particleCount: 5, angle: 60, spread: 70, origin: { x: 0, y: 0.7 }, colors });
      confetti({ particleCount: 5, angle: 120, spread: 70, origin: { x: 1, y: 0.7 }, colors });
      if (Date.now() < end) raf = requestAnimationFrame(frame);
    };
    frame();
    return () => cancelAnimationFrame(raf);
  }, []);
  return (
    <div className="flex h-full flex-col items-center justify-center gap-[2.2vmin] overflow-hidden bg-gradient-to-b from-[var(--board)] to-[var(--board-edge)] p-[3vmin]">
      <div className="cat-text text-[4vmin] text-white/70">{winners.length > 1 ? "It's a tie!" : "Our champion"}</div>
      <div className="flex gap-[3vmin]">
        {winners.map((w) => (
          <div key={w.id} className="anim-pop flex flex-col items-center">
            <div className="aspect-[5/2] w-[42vmin] rounded-[1.5vmin] bg-[var(--board-deep)] p-[1vmin] text-[6vmin] shadow-2xl ring-[0.5vmin] ring-gold">
              {view.settings.mode === "team" ? <div className="cat-text grid h-full place-items-center" style={{ color: w.color }}>{w.name}</div> : <Signature player={w.players[0]} className="h-full w-full" />}
            </div>
            <div className="money mt-[1vmin] text-[6.5vmin]">{formatScore(view.scores[w.id] ?? 0)}</div>
          </div>
        ))}
      </div>
      {!!view.awards?.length && (
        <div className="flex max-w-[96vw] flex-wrap justify-center gap-[1.6vmin]">
          {view.awards.map((a, i) => (
            <div key={a.id} className="anim-pop flex w-[30vmin] flex-col items-center rounded-[1.4vmin] bg-black/30 px-[1.5vmin] py-[1.4vmin] text-center ring-1 ring-white/15" style={{ animationDelay: `${1.2 + i * 0.5}s` }}>
              <div className="text-[5vmin] leading-none">{a.emoji}</div>
              <div className="cat-text mt-[0.6vmin] text-[2.2vmin] text-gold">{a.title}</div>
              <div className="text-[2.6vmin] font-bold">{a.name}</div>
              <div className="text-[1.6vmin] text-white/65">{a.detail}</div>
            </div>
          ))}
        </div>
      )}
      <div className="flex max-w-[96vw] flex-wrap items-stretch justify-center gap-[1.4vmin]">
        {rest.slice(0, GALLERY_MAX).map((c, i) => (
          <div key={c.id} className="anim-pop flex w-[20vmin] flex-col rounded-[1.2vmin] bg-[var(--board-deep)] p-[0.7vmin] ring-1 ring-white/15" style={{ animationDelay: `${0.4 + i * 0.12}s` }}>
            <div className="relative aspect-[5/2] w-full rounded-[0.8vmin] bg-black/25 text-[2.2vmin]">
              {view.settings.mode === "team" || !c.players[0] ? (
                <div className="cat-text grid h-full place-items-center" style={{ color: c.color }}>{c.name}</div>
              ) : (
                <Signature player={c.players[0]} className="h-full w-full" />
              )}
              {c.players[0]?.avatar && view.settings.mode !== "team" && (
                <div className="absolute -right-[0.8vmin] -top-[0.8vmin] h-[4.4vmin] w-[4.4vmin] rounded-full bg-[var(--board-deep)] ring-1 ring-white/30">
                  <Ink drawing={c.players[0].avatar} className="h-full w-full" />
                </div>
              )}
            </div>
            <div className="mt-[0.5vmin] flex items-baseline gap-[0.8vmin] text-[1.8vmin]">
              <span className="text-white/50">#{i + winners.length + 1}</span>
              <span className="min-w-0 flex-1 truncate font-semibold">{c.name}</span>
              <span>{(view.awards ?? []).filter((a) => a.winnerId === c.id || c.players.some((p) => p.id === a.winnerId)).map((a) => a.emoji).join("")}</span>
              <span className={`money ${(view.scores[c.id] ?? 0) < 0 ? "!text-red-400" : ""}`}>{formatScore(view.scores[c.id] ?? 0)}</span>
            </div>
          </div>
        ))}
        {rest.length > GALLERY_MAX && <div className="grid place-items-center px-[2vmin] text-[2.2vmin] text-white/60">+{rest.length - GALLERY_MAX} more</div>}
      </div>
      {origin && view.gameId && !view.settings.hideCode && (
        <div className="fixed bottom-[2vmin] right-[2vmin] z-10 flex items-center gap-[1.2vmin] rounded-[1.2vmin] bg-black/55 p-[1vmin] pr-[1.6vmin]">
          <Qr value={`${origin}/r/${view.gameId}`} className="w-[11vmin] rounded-[0.6vmin] bg-white p-[0.4vmin] [&>svg]:h-auto [&>svg]:w-full" />
          <div className="text-[1.8vmin] leading-snug text-white/80">
            Scan to keep
            <br />
            the results
          </div>
        </div>
      )}
    </div>
  );
}

/** Runner-up cards shown under the champion before it turns into a count. */
const GALLERY_MAX = 21;

// ----------------------------------------------------------------- overlays

function ScoresOverlay({ view }: { view: GameView }) {
  const ranked = [...contestants(view)].sort((a, b) => (view.scores[b.id] ?? 0) - (view.scores[a.id] ?? 0));
  return (
    <div className="fixed inset-0 z-30 flex flex-col items-center justify-center gap-[2vmin] bg-[var(--board-edge)]/95 p-[4vmin]">
      <div className="cat-text mb-[2vmin] text-[6vmin] text-gold">Scoreboard</div>
      {ranked.map((c, i) => (
        <div key={c.id} className="anim-pop flex w-[min(90vw,140vh)] items-center gap-[3vmin] rounded-[1.5vmin] bg-[var(--board)] px-[3vmin] py-[1.2vmin]" style={{ animationDelay: `${i * 80}ms` }}>
          <div className="cat-text w-[6vmin] text-[4vmin] text-white/60">{i + 1}</div>
          <div className="h-[9vmin] min-w-0 flex-1 text-[4vmin]">
            {view.settings.mode === "team" ? <div className="cat-text flex h-full items-center" style={{ color: c.color }}>{c.name}</div> : <Signature player={c.players[0]} className="h-full w-full" />}
          </div>
          <div className={`money text-[6vmin] ${(view.scores[c.id] ?? 0) < 0 ? "!text-red-400" : ""}`}>{formatScore(view.scores[c.id] ?? 0)}</div>
        </div>
      ))}
    </div>
  );
}

function Announcement({ text }: { text: string }) {
  return (
    <div className="anim-pop fixed inset-x-[5vw] top-[5vh] z-40 rounded-[2vmin] border-[0.4vmin] border-gold bg-black/85 px-[4vmin] py-[3vmin] text-center text-[5vmin] font-bold shadow-2xl">
      {text}
    </div>
  );
}

function CornerQr({ code }: { code: string }) {
  const origin = useOrigin();
  if (!origin) return null;
  return (
    <div className="fixed right-[1.5vmin] top-[1.5vmin] z-20 flex flex-col items-center rounded-[1vmin] bg-black/70 p-[1vmin]">
      <Qr value={`${origin}/join?code=${code}`} className="w-[13vmin] [&>svg]:h-auto [&>svg]:w-full" />
      <div className="money mt-[0.5vmin] text-[2.6vmin] tracking-widest text-white">{code}</div>
    </div>
  );
}

function PausedOverlay() {
  return (
    <div className="fixed inset-0 z-30 grid place-items-center bg-black/70">
      <div className="cat-text text-[10vmin] text-gold">Paused</div>
    </div>
  );
}

function BrbScreen({ title }: { title: string }) {
  return (
    <div className="fixed inset-0 z-40 flex flex-col items-center justify-center gap-[2vmin] bg-gradient-to-b from-[var(--board)] to-[var(--board-edge)]">
      <div className="cat-text text-[11vmin] text-gold">Be right back</div>
      <div className="text-[3vmin] text-white/70">{title}</div>
    </div>
  );
}

function EnableSound({ onEnable }: { onEnable: () => void }) {
  return (
    <button onClick={onEnable} className="fixed inset-0 z-[60] flex flex-col items-center justify-center gap-[2vmin] bg-black/80 text-white">
      <span className="text-[10vmin]">🔊</span>
      <span className="cat-text text-[5vmin]">Click to enable sound</span>
      <span className="text-[2.4vmin] text-white/60">Browsers need one click before a page can play audio.</span>
    </button>
  );
}

function FullscreenButton() {
  const [fs, setFs] = useState(false);
  useEffect(() => {
    const on = () => setFs(!!document.fullscreenElement);
    document.addEventListener("fullscreenchange", on);
    return () => document.removeEventListener("fullscreenchange", on);
  }, []);
  return (
    <button
      onClick={() => (fs ? document.exitFullscreen() : document.documentElement.requestFullscreen?.())}
      className="fixed bottom-[1vmin] right-[1vmin] z-50 rounded-lg bg-black/40 px-3 py-1.5 text-sm text-white/40 opacity-30 transition hover:opacity-100"
      title="Toggle fullscreen (F)"
    >
      {fs ? "Exit fullscreen" : "⛶ Fullscreen"}
    </button>
  );
}
