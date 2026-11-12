"use client";

import { useEffect, useRef } from "react";
import { sound } from "@/client/sound";
import { useTick } from "@/client/useGame";
import { PartyScreen } from "./PartyScreen";
import { useCountdown } from "@/components/game";
import type { GameView } from "@/engine/views";
import { TEAM_COLORS } from "@/shared/protocol";
import { CLOCK_TARGET_MS, CLOCK_VISIBLE_MS, LOBBY_GAME_INFO, TUG_SIDES, type MiniRound } from "@/shared/minigames";

/** Where each pig stands in Count the pigs: the same on every screen for a given round. */
function pigSpots(seed: number, n: number): { x: number; y: number; flip: boolean; size: number }[] {
  let s = (seed * 2654435761) >>> 0;
  const next = () => ((s = (s * 1664525 + 1013904223) >>> 0) / 4294967296);
  // A loose grid, each pig nudged inside its own cell, so no two sit on top of each other.
  const cols = 7;
  const cells = Array.from({ length: cols * 3 }, (_, i) => i);
  for (let i = cells.length - 1; i > 0; i--) {
    const j = Math.floor(next() * (i + 1));
    [cells[i], cells[j]] = [cells[j], cells[i]];
  }
  return cells.slice(0, n).map((c) => ({
    x: ((c % cols) + 0.2 + next() * 0.6) / cols,
    y: (Math.floor(c / cols) + 0.2 + next() * 0.6) / 3,
    flip: next() > 0.5,
    size: 0.85 + next() * 0.4,
  }));
}

/**
 * Sound for the lobby games, played on the big screen only. Each cue fires on a change in
 * the round (a new phase, somebody out, a pig passing a quarter of the track), never per tap.
 */
function useMiniSounds(round: MiniRound, countdownSec: number, now: () => number) {
  const { id, kind, phase } = round;
  // The countdown: a beep each second.
  useEffect(() => {
    if (phase === "countdown") sound().play("miniBeep");
  }, [id, phase, countdownSec]);
  // The round starts and ends.
  useEffect(() => {
    if (phase === "running") sound().play(kind === "reflex" ? "miniHold" : kind === "count" ? "miniPop" : "miniGo");
    if (phase === "done") sound().play(round.winnerId || (kind === "tug" && round.pull !== 0) ? "miniWin" : "miniDraw");
    // Only the phase matters here; the winner is already known when "done" arrives.
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [id, phase]);
  // Quick draw: GO.
  const go = kind === "reflex" && phase === "running" && !!round.go;
  useEffect(() => {
    if (go) sound().play("miniGo");
  }, [id, go]);
  // Somebody is out (tapped early, wrong number), or stopped the clock.
  const out = round.out ?? 0;
  const stopped = round.stopped ?? 0;
  useEffect(() => {
    if (out > 0 && phase === "running") sound().play("miniOut");
  }, [id, out, phase]);
  useEffect(() => {
    if (stopped > 0 && phase === "running") sound().play("miniStop");
  }, [id, stopped, phase]);
  // Stop the clock: a tick each second while the clock is still showing.
  const clockSec = kind === "clock" && phase === "running" ? Math.min(2, Math.floor(Math.max(0, now() - round.startsAt) / 1000)) : -1;
  useEffect(() => {
    if (clockSec >= 0 && clockSec < 2) sound().play("tick");
  }, [id, clockSec]);
  // Pig race: an oink whenever the leading pig passes another quarter of the track.
  const lead = kind === "race" ? Math.floor((Math.max(0, ...(round.lanes ?? []).map((l) => l.taps)) / (round.goal ?? 1)) * 4) : 0;
  // Tug of war: a heave each time the rope moves another notch either way.
  const notch = kind === "tug" ? Math.trunc((round.pull ?? 0) * 5) : 0;
  const last = useRef({ id: 0, lead: 0, notch: 0 });
  useEffect(() => {
    if (last.current.id !== id) last.current = { id, lead: 0, notch: 0 };
    if (phase === "running" && lead > last.current.lead && lead < 4) sound().play("oink", lead);
    if (phase === "running" && notch !== last.current.notch) sound().play("miniHeave", notch > last.current.notch ? 1 : 0);
    last.current.lead = lead;
    last.current.notch = notch;
  }, [id, phase, lead, notch]);
}

/** The lobby game on the big screen. */
export function MiniScreen({ view, round, now }: { view: GameView; round: MiniRound; now: () => number }) {
  const info = LOBBY_GAME_INFO[round.kind];
  const left = useCountdown(round.phase === "countdown" ? round.startsAt : null, now);
  useTick(50, round.kind === "clock" && round.phase === "running");
  const player = (id: string | null) => view.players.find((p) => p.id === id);
  const colorOf = (id: string | null) => TEAM_COLORS[(player(id)?.index ?? 0) % TEAM_COLORS.length];
  const done = round.phase === "done";
  useMiniSounds(round, Math.max(1, Math.ceil((left ?? 0) / 1000)), now);

  return (
    <section className="rounded-[2vmin] bg-black/40 p-[1.6vmin] shadow-xl ring-1 ring-white/10" aria-label={info.name}>
      <div className="mb-[1vmin] flex items-baseline gap-[2vmin]">
        <h2 className="cat-text shrink-0 text-[3vmin] text-gold">
          {info.emoji} {info.name}
        </h2>
        <div className="min-w-0 flex-1 truncate text-[2.2vmin] text-white/80">
          {round.phase === "countdown" && (
            <>
              Starts in <span className="money text-[3.4vmin] text-gold">{Math.max(1, Math.ceil((left ?? 0) / 1000))}</span>. Tap “I&apos;m in” on your phone! {info.how}
            </>
          )}
          {round.phase === "running" && info.how}
          {done && (
            <span className="anim-pop inline-block font-bold text-white">
              {round.winnerId ? `🏆 ${player(round.winnerId)?.name ?? "Someone"} wins!${round.winnerText ? ` (${round.winnerText})` : ""}` : `🏁 ${round.winnerText ?? "Nobody won"}`}
            </span>
          )}
        </div>
        <div className="shrink-0 text-[1.9vmin] text-white/50">{round.players} playing</div>
      </div>

      <PartyScreen view={view} round={round} now={now} />

      {round.kind === "race" && (
        <div className="flex flex-col gap-[0.6vmin]">
          {/* Lanes keep their place (join order) so pigs move along the track, not up and down it. */}
          {[...(round.lanes ?? [])]
            .sort((a, b) => (player(a.id)?.index ?? 0) - (player(b.id)?.index ?? 0))
            .map((lane) => {
              const pct = Math.min(1, lane.taps / (round.goal ?? 1));
              return (
                <div key={lane.id} className="flex items-center gap-[1.2vmin]">
                  <div className="w-[18vmin] shrink-0 truncate text-right text-[2vmin] font-semibold" style={{ color: colorOf(lane.id) }}>
                    {lane.wins > 0 && <span className="mr-[0.6vmin] text-white/70">🏆{lane.wins > 1 ? lane.wins : ""}</span>}
                    {player(lane.id)?.name ?? "Player"}
                  </div>
                  <div className="relative h-[3.6vmin] flex-1 rounded-full bg-white/10">
                    <div className="absolute inset-y-0 left-0 rounded-full opacity-40 transition-[width] duration-150 ease-linear" style={{ width: `${pct * 100}%`, background: colorOf(lane.id) }} />
                    <span className="absolute top-1/2 text-[3.4vmin] leading-none transition-[left] duration-150 ease-linear" style={{ left: `calc(${pct} * (100% - 4vmin))`, transform: "translateY(-50%) scaleX(-1)" }}>
                      🐖
                    </span>
                  </div>
                  <span className="text-[2.6vmin] leading-none">{round.winnerId === lane.id ? "🏆" : "🏁"}</span>
                </div>
              );
            })}
        </div>
      )}

      {round.kind === "reflex" && (
        <div className="flex items-center gap-[2vmin]">
          <div
            className={`cat-text grid h-[14vmin] flex-1 place-items-center rounded-[2vmin] text-[7vmin] text-white transition-colors duration-75 ${
              done ? "bg-white/10" : round.phase === "running" && round.go ? "bg-green-600" : "bg-red-700"
            }`}
          >
            {done ? (round.winnerId ? "⚡" : "🙈") : round.phase === "countdown" ? "Get ready…" : round.go ? "GO! TAP!" : "Wait for it…"}
          </div>
          {(round.out ?? 0) > 0 && <div className="shrink-0 text-[2.2vmin] text-white/70">{round.out} jumped the gun</div>}
        </div>
      )}

      {round.kind === "clock" && (
        <div className="flex items-center gap-[3vmin]">
          <div className="money grid h-[14vmin] w-[40vmin] shrink-0 place-items-center rounded-[2vmin] bg-black/50 text-[10vmin] tabular-nums">
            {(() => {
              if (done) return (CLOCK_TARGET_MS / 1000).toFixed(2);
              if (round.phase === "countdown") return "0.00";
              const elapsed = now() - round.startsAt;
              return elapsed < CLOCK_VISIBLE_MS ? (Math.max(0, elapsed) / 1000).toFixed(2) : "?.??";
            })()}
          </div>
          {done ? (
            <ol className="flex min-w-0 flex-1 flex-col gap-[0.4vmin] text-[2.2vmin]">
              {(round.results ?? []).map((r, i) => (
                <li key={r.id} className="flex gap-[1.5vmin]">
                  <span className="w-[3vmin] text-white/50">{i === 0 ? "🏆" : i + 1}</span>
                  <span className="min-w-0 flex-1 truncate font-semibold" style={{ color: colorOf(r.id) }}>{player(r.id)?.name ?? "Player"}</span>
                  <span className="money tabular-nums">{(r.ms / 1000).toFixed(2)} s</span>
                </li>
              ))}
            </ol>
          ) : (
            <div className="text-[2.6vmin] text-white/80">
              Stop the clock at <span className="money text-gold">{(CLOCK_TARGET_MS / 1000).toFixed(2)}</span>
              <div className="text-[2vmin] text-white/50">{round.stopped ?? 0} of {round.players} have stopped</div>
            </div>
          )}
        </div>
      )}

      {round.kind === "count" && (
        <div className="relative h-[20vmin] overflow-hidden rounded-[2vmin] bg-black/30">
          {round.phase === "countdown" ? (
            <div className="cat-text grid h-full place-items-center text-[5vmin] text-white/70">Pigs incoming…</div>
          ) : (
            pigSpots(round.id, round.count ?? 0).map((p, i) => (
              <span key={i} className="absolute leading-none" style={{ left: `${p.x * 92}%`, top: `${p.y * 66}%`, fontSize: `${5 * p.size}vmin`, transform: p.flip ? "scaleX(-1)" : undefined }}>
                🐖
              </span>
            ))
          )}
          {done && round.count != null && (
            <div className="absolute inset-0 grid place-items-center bg-black/55">
              <span className="money anim-pop text-[11vmin]">{round.count}</span>
            </div>
          )}
        </div>
      )}

      {round.kind === "tug" && (
        <div className="flex items-center gap-[2vmin]">
          <div className="w-[16vmin] shrink-0 text-right text-[2.4vmin] font-bold" style={{ color: TUG_SIDES[0].color }}>
            {TUG_SIDES[0].name} · {round.sides?.[0] ?? 0}
          </div>
          <div className="relative h-[8vmin] flex-1 rounded-full" style={{ background: `linear-gradient(90deg, ${TUG_SIDES[0].color}55, transparent 35%, transparent 65%, ${TUG_SIDES[1].color}55)` }}>
            <div className="absolute inset-y-[3.6vmin] left-[2%] right-[2%] rounded-full bg-[#c8a36b]" />
            <div className="absolute inset-y-0 left-1/2 w-[0.4vmin] -translate-x-1/2 bg-white/40" />
            <span className="absolute top-1/2 text-[6vmin] leading-none transition-[left] duration-150 ease-linear" style={{ left: `${50 + (round.pull ?? 0) * 46}%`, transform: "translate(-50%, -50%)" }}>
              🐖
            </span>
          </div>
          <div className="w-[16vmin] shrink-0 text-[2.4vmin] font-bold" style={{ color: TUG_SIDES[1].color }}>
            {round.sides?.[1] ?? 0} · {TUG_SIDES[1].name}
          </div>
        </div>
      )}
    </section>
  );
}
