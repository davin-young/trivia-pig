"use client";

import { useEffect, useMemo, useRef, useState } from "react";
import confetti from "canvas-confetti";
import { useGame } from "@/client/useGame";
import { sound } from "@/client/sound";
import { useWakeLock } from "@/client/useWakeLock";
import type { GameView } from "@/engine/views";
import type { FxEvent } from "@/shared/protocol";
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

  const onFx = (fx: FxEvent) => {
    const v = viewRef.current;
    const idx = fx.playerId ? (v?.players.find((p) => p.id === fx.playerId)?.index ?? 0) : undefined;
    if (fx.cue === "sfx" && fx.id) sound().play(fx.id);
    else sound().play(fx.cue, idx);
  };

  const { view, status, error, now } = useGame({
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
    }
  }, [left, timerEnd, view?.timer?.label]);

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
      <Stage view={view} now={now} />
      {view.screen === "scores" && <ScoresOverlay view={view} />}
      {view.announcement && <Announcement key={view.announcement.at} text={view.announcement.text} />}
      {view.showJoinQr && view.phase !== "lobby" && <CornerQr code={view.code} />}
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

function Shell({ children }: { children: React.ReactNode }) {
  return <main className="relative h-dvh w-screen select-none overflow-hidden bg-[var(--board-edge)] text-white">{children}</main>;
}

function Stage({ view, now }: { view: GameView; now: () => number }) {
  switch (view.phase) {
    case "lobby":
      return <Lobby view={view} />;
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

function Lobby({ view }: { view: GameView }) {
  const origin = useOrigin();
  const joinUrl = `${origin}/join?code=${view.code}`;
  const list = view.players.filter((p) => !p.removed);
  return (
    <div className="flex h-full flex-col bg-gradient-to-b from-[var(--board-deep)] to-[var(--board-edge)] p-[3vmin]">
      <header className="flex items-start justify-between gap-[3vmin]">
        <div>
          <div className="cat-text text-[3vmin] text-white/60">{APP_NAME}</div>
          <h1 className="cat-text text-[6vmin] text-white">{view.title}</h1>
        </div>
        {view.lobbyLocked && <div className="rounded-full bg-red-600 px-[2vmin] py-[0.8vmin] text-[2.2vmin] font-bold">LOBBY LOCKED</div>}
      </header>
      <div className="mt-[2vmin] flex flex-1 gap-[4vmin] overflow-hidden">
        <div className="flex w-[38%] shrink-0 flex-col items-center justify-center gap-[2vmin] rounded-[2vmin] bg-white/5 p-[3vmin]">
          <div className="text-[2.6vmin] text-white/70">Join on your phone at</div>
          <div className="cat-text text-[4vmin] text-gold">{origin.replace(/^https?:\/\//, "")}/join</div>
          <div className="text-[2.6vmin] text-white/70">with code</div>
          <div className="money rounded-[1.5vmin] bg-black/40 px-[3vmin] py-[1vmin] text-[13vmin] leading-none tracking-[0.15em] text-white">{view.code}</div>
          {origin && <Qr value={joinUrl} className="w-[24vmin] rounded-[1vmin] bg-white p-[0.6vmin] [&>svg]:h-auto [&>svg]:w-full" />}
        </div>
        <div className="flex flex-1 flex-col overflow-hidden">
          <div className="mb-[2vmin] text-[3vmin] text-white/70">
            {list.length ? `${list.length} player${list.length === 1 ? "" : "s"} signed in` : "Waiting for players…"}
          </div>
          <div className="grid flex-1 auto-rows-min grid-cols-3 gap-[2vmin] overflow-hidden">
            {list.map((p) => (
              <div key={p.id} className="anim-pop flex flex-col items-center rounded-[1.5vmin] bg-[var(--board)] p-[1.2vmin] shadow-lg">
                <div className="aspect-[5/2] w-full rounded-[1vmin] bg-[var(--board-deep)] p-[0.5vmin] text-[3vmin]">
                  <Signature player={p} className="h-full w-full" />
                </div>
                {view.settings.mode === "team" && (
                  <div className="mt-[0.6vmin] text-[1.8vmin] font-semibold" style={{ color: view.teams.find((t) => t.id === p.teamId)?.color }}>
                    {view.teams.find((t) => t.id === p.teamId)?.name ?? "No team yet"}
                  </div>
                )}
              </div>
            ))}
          </div>
        </div>
      </div>
    </div>
  );
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
          <div className="clue-text max-w-[90vw]" style={{ fontSize: `${clueSize(c.text ?? "", !!c.media)}vmin` }}>{c.text}</div>
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
        {c.stage === "open" && <div className="rounded-full bg-green-600/90 px-[2.5vmin] py-[0.6vmin] text-[2.4vmin] font-bold">BUZZERS OPEN</div>}
        {answering && <div className="cat-text text-[3.2vmin] text-gold">{answering.name}</div>}
        {view.timer && <TimerBar startedAt={view.timer.startedAt} endsAt={view.timer.endsAt} now={now} className="h-[1.2vmin] w-full" />}
      </div>
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

function PodiumRow({ view, list }: { view: GameView; list: Contestant[] }) {
  const answeringPlayer = view.clue?.answering ?? null;
  const ddId = view.clue?.dailyDouble?.contestantId ?? null;
  return (
    <div className="flex h-[19vh] shrink-0 items-stretch justify-center gap-[1.2vmin] bg-gradient-to-b from-[#3a2a0a] to-[#1a1204] px-[1vmin] py-[1vmin]">
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
    <div className="flex h-full flex-col items-center justify-center gap-[3vmin] bg-gradient-to-b from-[var(--board)] to-[var(--board-edge)] p-[4vmin]">
      <div className="cat-text text-[4vmin] text-white/70">{winners.length > 1 ? "It's a tie!" : "Our champion"}</div>
      <div className="flex gap-[3vmin]">
        {winners.map((w) => (
          <div key={w.id} className="anim-pop flex flex-col items-center">
            <div className="aspect-[5/2] w-[50vmin] rounded-[1.5vmin] bg-[var(--board-deep)] p-[1vmin] text-[6vmin] shadow-2xl ring-[0.5vmin] ring-gold">
              {view.settings.mode === "team" ? <div className="cat-text grid h-full place-items-center" style={{ color: w.color }}>{w.name}</div> : <Signature player={w.players[0]} className="h-full w-full" />}
            </div>
            <div className="money mt-[2vmin] text-[8vmin]">{formatScore(view.scores[w.id] ?? 0)}</div>
          </div>
        ))}
      </div>
      <div className="mt-[2vmin] flex flex-wrap justify-center gap-[2vmin]">
        {ranked.slice(winners.length).map((c, i) => (
          <div key={c.id} className="rounded-[1vmin] bg-white/10 px-[2vmin] py-[1vmin] text-[2.6vmin]">
            <span className="text-white/50">#{i + winners.length + 1}</span> {c.name} <span className="money ml-[1vmin]">{formatScore(view.scores[c.id] ?? 0)}</span>
          </div>
        ))}
      </div>
    </div>
  );
}

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
