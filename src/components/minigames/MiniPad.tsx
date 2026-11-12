"use client";

import { useCallback, useEffect, useRef, useState } from "react";
import type { useGame } from "@/client/useGame";
import { useCountdown } from "@/components/game";
import type { GameView } from "@/engine/views";
import { COUNT_MAX, COUNT_MIN, LOBBY_GAME_INFO, TUG_SIDES, type MiniView, type TapResult } from "@/shared/minigames";

type Emit = ReturnType<typeof useGame>["emit"];

/**
 * Lobby games on the phone: something to do while the room fills up. Anyone's first tap
 * starts a countdown for everyone; the round itself plays out on the big screen.
 */
export function MiniPad({ view, mini, emit, now }: { view: GameView; mini: MiniView | null; emit: Emit; now: () => number }) {
  const myId = view.me!.playerId;
  const round = mini?.round ?? null;
  const [taps, setTaps] = useState(0);
  const [me, setMe] = useState<TapResult>({});
  const pending = useRef(0);
  const roundId = round?.id ?? 0;
  useEffect(() => {
    setTaps(0);
    setMe({});
    pending.current = 0;
  }, [roundId]);

  const send = useCallback(
    async (payload: { n?: number; pick?: number }) => {
      const r = await emit("player:tap", payload);
      if (r.ok && r.data) setMe((prev) => ({ ...prev, ...(r.data as TapResult) }));
    },
    [emit],
  );

  // Tapping games send their taps in small batches, not one message per tap.
  const batching = round?.phase === "running" && (round.kind === "race" || round.kind === "tug");
  useEffect(() => {
    if (!batching) return;
    const t = setInterval(() => {
      const n = Math.min(10, pending.current);
      if (n > 0) {
        pending.current -= n;
        void send({ n });
      }
    }, 250);
    return () => clearInterval(t);
  }, [batching, send]);

  const left = useCountdown(round?.phase === "countdown" ? round.startsAt : null, now);
  if (!mini) return null;
  const info = LOBBY_GAME_INFO[round?.kind ?? mini.kind];
  const nameOf = (id: string | null) => view.players.find((p) => p.id === id)?.name ?? "Someone";
  const mySide = me.side !== undefined ? TUG_SIDES[me.side] : null;

  if (!round) {
    return (
      <div className="w-full max-w-sm">
        <button type="button" className="btn-ghost w-full py-3" onClick={() => void send({ n: 1 })}>
          {info.emoji} Play {info.name} while you wait
        </button>
        <div className="mt-1 text-xs text-white/50">{info.how}</div>
      </div>
    );
  }

  const tapButton = "w-full select-none rounded-2xl py-8 text-3xl font-black transition-transform active:scale-95 disabled:opacity-50";
  return (
    <div className="w-full max-w-sm rounded-2xl border border-line bg-white/5 p-3">
      <div className="mb-2 text-sm font-semibold">
        {info.emoji} {info.name}
      </div>

      {round.phase === "countdown" && (
        <>
          <div className="text-sm text-white/70">Starts in</div>
          <div className="money text-5xl">{Math.max(1, Math.ceil((left ?? 0) / 1000))}</div>
          <div className="my-2 text-sm text-white/70">{info.how}</div>
          {mySide && <div className="mb-2 font-bold" style={{ color: mySide.color }}>You are on the {mySide.name} side</div>}
          <button type="button" className="btn-ghost w-full py-3" onClick={() => void send({ n: 1 })}>
            I&apos;m in {info.emoji}
          </button>
        </>
      )}

      {round.phase === "running" && round.kind === "race" && (
        <>
          <div className="mb-2 h-3 overflow-hidden rounded-full bg-black/40" role="progressbar" aria-valuemin={0} aria-valuemax={round.goal ?? 1} aria-valuenow={taps} aria-label="Your pig">
            <div className="h-full rounded-full bg-gold transition-[width] duration-100" style={{ width: `${Math.min(1, Math.max(taps, round.lanes?.find((l) => l.id === myId)?.taps ?? 0) / (round.goal ?? 1)) * 100}%` }} />
          </div>
          <button
            type="button"
            className={`${tapButton} bg-gold text-black`}
            style={{ touchAction: "manipulation" }}
            onPointerDown={() => {
              if (taps >= (round.goal ?? 0)) return;
              pending.current++;
              setTaps((n) => n + 1);
            }}
          >
            TAP! 🐖
          </button>
        </>
      )}

      {round.phase === "running" && round.kind === "tug" && (
        <>
          {mySide && <div className="mb-2 font-bold" style={{ color: mySide.color }}>You pull for the {mySide.name} side</div>}
          <button
            type="button"
            className={`${tapButton} text-black`}
            style={{ touchAction: "manipulation", background: mySide?.color ?? "#ffffff" }}
            onPointerDown={() => {
              pending.current++;
              setTaps((n) => n + 1);
            }}
          >
            PULL! 🪢
          </button>
        </>
      )}

      {round.phase === "running" && round.kind === "reflex" && (
        <button
          type="button"
          disabled={me.out}
          className={`${tapButton} text-white ${me.out ? "bg-white/10" : round.go ? "bg-green-600" : "bg-red-700"}`}
          style={{ touchAction: "manipulation" }}
          onPointerDown={() => !me.out && void send({ n: 1 })}
        >
          {me.out ? "Too early! You're out 🙈" : round.go ? "TAP! ⚡" : "Wait for it…"}
        </button>
      )}

      {round.phase === "running" && round.kind === "clock" &&
        (me.ms !== undefined ? (
          <div className="py-4">
            <div className="text-sm text-white/70">You stopped at</div>
            <div className="money text-5xl">{(me.ms / 1000).toFixed(2)}</div>
            <div className="text-xs text-white/50">Waiting for the others…</div>
          </div>
        ) : (
          <button type="button" className={`${tapButton} bg-gold text-black`} style={{ touchAction: "manipulation" }} onPointerDown={() => void send({ n: 1 })}>
            STOP at 7.00 ⏱️
          </button>
        ))}

      {round.phase === "running" && round.kind === "count" &&
        (me.out ? (
          <div className="py-4 text-lg font-bold">Not that many! You&apos;re out 🙈</div>
        ) : (
          <>
            <div className="mb-2 text-sm text-white/70">How many pigs are on the big screen?</div>
            <div className="grid grid-cols-5 gap-2">
              {Array.from({ length: COUNT_MAX - COUNT_MIN + 1 }, (_, i) => COUNT_MIN + i).map((n) => (
                <button key={n} type="button" className="rounded-xl bg-gold py-3 text-xl font-black text-black active:scale-95" onClick={() => void send({ pick: n })}>
                  {n}
                </button>
              ))}
            </div>
          </>
        ))}

      {round.phase === "running" && <div className="mt-1 text-xs text-white/50">{round.players} playing · watch the big screen</div>}

      {round.phase === "done" && (
        <div className="py-2">
          {round.winnerId ? (
            <>
              <div className="text-4xl">{round.winnerId === myId ? "🏆" : "🏁"}</div>
              <div className="text-lg font-bold">{round.winnerId === myId ? "You won!" : `${nameOf(round.winnerId)} won`}</div>
              {round.winnerText && <div className="text-sm text-white/70">{round.winnerText}</div>}
            </>
          ) : (
            <>
              <div className="text-4xl">{mySide && round.winnerText?.startsWith(mySide.name) ? "🏆" : "🏁"}</div>
              <div className="text-lg font-bold">{mySide && round.winnerText?.startsWith(mySide.name) ? "Your side won!" : round.winnerText}</div>
            </>
          )}
          <div className="text-xs text-white/50">Next game in a moment…</div>
        </div>
      )}
    </div>
  );
}
