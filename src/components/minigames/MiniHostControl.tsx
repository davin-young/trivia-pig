"use client";

import { useState } from "react";
import type { useGame } from "@/client/useGame";
import { LOBBY_GAMES, LOBBY_GAME_INFO, type LobbyGameKind, type MiniView } from "@/shared/minigames";

type Emit = ReturnType<typeof useGame>["emit"];

/** The host's controls for lobby games: pick one, shuffle them, start a fresh round, stop. */
export function MiniHostControl({ mini, emit }: { mini: MiniView | null; emit: Emit }) {
  const [err, setErr] = useState<string | null>(null);
  if (!mini) return null;
  const send = async (payload: { kind?: LobbyGameKind; mix?: boolean; restart?: boolean; stop?: boolean; hide?: string }) => {
    const r = await emit("host:minigame", payload);
    setErr(r.ok ? null : r.error);
  };
  const info = LOBBY_GAME_INFO[mini.kind];
  const phase = mini.round?.phase;
  return (
    <div className="card flex flex-col gap-3">
      <div className="flex flex-wrap items-baseline gap-x-3">
        <h3 className="font-semibold">Lobby games</h3>
        <span className="text-sm text-white/60">
          {phase === "countdown" ? `${info.name} is about to start` : phase === "running" ? `${info.name} is being played` : phase === "done" ? `${info.name} just finished` : `Up next: ${info.name}. Any player can start it from their phone.`}
        </span>
      </div>
      <div className="flex flex-wrap gap-2" role="group" aria-label="Choose the lobby game">
        {LOBBY_GAMES.map((k) => (
          <button key={k} type="button" aria-pressed={mini.kind === k} className={`btn-ghost !py-2 ${mini.kind === k ? "!border-gold !text-gold" : ""}`} onClick={() => send({ kind: k })}>
            {LOBBY_GAME_INFO[k].emoji} {LOBBY_GAME_INFO[k].name}
            {(LOBBY_GAME_INFO[k].min ?? 1) > 1 && <span className="ml-1 text-xs font-normal text-white/50">{LOBBY_GAME_INFO[k].min}+</span>}
          </button>
        ))}
      </div>
      <div className="text-xs text-white/50">{info.how}</div>
      <div className="flex flex-wrap items-center gap-2">
        <button type="button" className="btn-primary !py-2" onClick={() => send({ restart: true })}>
          {mini.round ? "↻ Restart this round" : "▶ Start a round"}
        </button>
        <button type="button" className="btn-ghost !py-2" onClick={() => send({ kind: LOBBY_GAMES[(LOBBY_GAMES.indexOf(mini.kind) + 1) % LOBBY_GAMES.length] })}>
          ⏭ Next game
        </button>
        <button type="button" className="btn-ghost !py-2" disabled={!mini.round} onClick={() => send({ stop: true })}>
          ■ Stop
        </button>
        <label className="ml-auto flex items-center gap-2 text-sm text-white/70">
          <input type="checkbox" className="h-5 w-5" checked={mini.mix} onChange={(e) => send({ mix: e.target.checked })} />
          Shuffle: a different game after each round
        </label>
      </div>
      {(mini.round?.hideable?.length ?? 0) > 0 && (
        <div className="flex flex-col gap-1 border-t border-line pt-2">
          <div className="text-xs text-white/60">On the big screen now. Remove anything that should not be there:</div>
          {mini.round!.hideable!.map((h) => (
            <div key={h.key} className="flex items-center gap-2 text-sm">
              <span className="min-w-0 flex-1 truncate">{h.label}</span>
              <button type="button" className="btn-ghost !px-2 !py-1 text-xs" onClick={() => send({ hide: h.key })}>
                ✕ Remove
              </button>
            </div>
          ))}
        </div>
      )}
      {err && <div className="text-sm text-red-300">{err}</div>}
    </div>
  );
}
