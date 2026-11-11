"use client";

import { useEffect, useState } from "react";
import QRCode from "qrcode";
import type { GameView, PlayerView } from "@/engine/views";
import type { Media } from "@/shared/board";
import type { PresenceStatus } from "@/shared/protocol";
import type { ConnStatus } from "@/client/useGame";
import { useTick } from "@/client/useGame";
import { Ink } from "./Ink";
import { themeVars, type BoardTheme } from "@/shared/theme";

export { APP_NAME } from "@/shared/app";
import { APP_NAME } from "@/shared/app";

/** Apply a board's colours and lettering to the whole page while this screen is mounted. */
export function useBoardTheme(theme: BoardTheme | null | undefined) {
  const key = theme ? `${theme.board}|${theme.accent}|${theme.font}` : "";
  useEffect(() => {
    const vars = themeVars(theme);
    const root = document.documentElement;
    for (const [k, v] of Object.entries(vars)) root.style.setProperty(k, v);
    return () => {
      for (const k of Object.keys(vars)) root.style.removeProperty(k);
    };
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [key]);
}

export function Qr({ value, className }: { value: string; className?: string }) {
  const [svg, setSvg] = useState("");
  useEffect(() => {
    QRCode.toString(value, { type: "svg", margin: 1, errorCorrectionLevel: "M", color: { dark: "#000000", light: "#ffffff" } })
      .then(setSvg)
      .catch(() => setSvg(""));
  }, [value]);
  return <div className={className} dangerouslySetInnerHTML={{ __html: svg }} />;
}

export function useOrigin() {
  const [origin, setOrigin] = useState("");
  useEffect(() => setOrigin(window.location.origin), []);
  return origin;
}

const DOT: Record<string, string> = {
  online: "bg-green-500",
  connecting: "bg-yellow-400 animate-pulse",
  reconnecting: "bg-yellow-400 animate-pulse",
  offline: "bg-neutral-500",
  error: "bg-red-500",
};

export function StatusDot({ status, className }: { status: ConnStatus | PresenceStatus; className?: string }) {
  return <span title={status} className={`inline-block h-2.5 w-2.5 shrink-0 rounded-full ${DOT[status] ?? "bg-neutral-500"} ${className ?? ""}`} />;
}

export function ConnBanner({ status, error }: { status: ConnStatus; error: string | null }) {
  if (status === "online") return null;
  const text =
    status === "error" ? (error ?? "Can't connect") : status === "connecting" ? "Connecting…" : "Connection lost — reconnecting…";
  return (
    <div className={`fixed inset-x-0 top-0 z-50 flex items-center justify-center gap-2 py-1.5 text-sm font-semibold ${status === "error" ? "bg-red-600" : "bg-yellow-500 text-black"}`}>
      <StatusDot status={status} /> {text}
    </div>
  );
}

// ------------------------------------------------------------ contestants

export interface Contestant {
  id: string;
  name: string;
  color?: string;
  players: PlayerView[];
}

export function contestants(view: GameView): Contestant[] {
  if (view.settings.mode === "team") {
    return view.teams.map((t) => ({ id: t.id, name: t.name, color: t.color, players: view.players.filter((p) => p.teamId === t.id && !p.removed) }));
  }
  return view.players.filter((p) => !p.removed).map((p) => ({ id: p.id, name: p.name, players: [p] }));
}

export function contestantName(view: GameView, id: string | null | undefined): string {
  if (!id) return "—";
  return view.teams.find((t) => t.id === id)?.name ?? view.players.find((p) => p.id === id)?.name ?? "—";
}

export function playerName(view: GameView, id: string | null | undefined): string {
  return view.players.find((p) => p.id === id)?.name ?? "—";
}

export function formatScore(n: number): string {
  return (n < 0 ? "-$" : "$") + Math.abs(n).toLocaleString();
}

// ------------------------------------------------------------------ podium

export function Signature({ player, className }: { player: PlayerView; className?: string }) {
  if (player.signature && player.signature.strokes.length) return <Ink drawing={player.signature} className={className} title={player.name} />;
  return (
    <div className={`grid place-items-center ${className ?? ""}`}>
      <span className="font-[family-name:var(--f-display)] text-[1em] uppercase">{player.name}</span>
    </div>
  );
}

// ------------------------------------------------------------------- media

export function youtubeId(url: string): string | null {
  const m = url.match(/(?:youtu\.be\/|v=|embed\/|shorts\/)([\w-]{11})/);
  return m ? m[1] : null;
}

export function MediaView({ media, className, autoPlay }: { media: Media | null | undefined; className?: string; autoPlay?: boolean }) {
  if (!media?.url) return null;
  const cls = className ?? "max-h-[40vh] max-w-full rounded-lg";
  switch (media.type) {
    case "image":
      return <img src={media.url} alt="" className={`${cls} object-contain`} />;
    case "video":
      return <video src={media.url} className={cls} controls autoPlay={autoPlay} playsInline />;
    case "audio":
      return <audio src={media.url} controls autoPlay={autoPlay} />;
    case "youtube": {
      const id = youtubeId(media.url);
      if (!id) return null;
      return (
        <iframe
          className={`${cls} aspect-video w-[min(80vw,1100px)]`}
          src={`https://www.youtube-nocookie.com/embed/${id}?autoplay=${autoPlay ? 1 : 0}&rel=0`}
          allow="autoplay; encrypted-media; picture-in-picture"
          allowFullScreen
        />
      );
    }
  }
}

// ------------------------------------------------------------------- timer

export function useCountdown(endsAt: number | null | undefined, now: () => number) {
  useTick(100, !!endsAt);
  if (!endsAt) return null;
  return Math.max(0, endsAt - now());
}

export function TimerBar({ startedAt, endsAt, now, className }: { startedAt: number; endsAt: number; now: () => number; className?: string }) {
  const left = useCountdown(endsAt, now) ?? 0;
  const total = Math.max(1, endsAt - startedAt);
  const frac = left / total;
  return (
    <div className={`h-2 overflow-hidden rounded-full bg-white/15 ${className ?? ""}`}>
      <div
        className={`h-full rounded-full transition-[width] duration-100 ${frac < 0.25 ? "bg-red-500" : "bg-gold"}`}
        style={{ width: `${frac * 100}%` }}
      />
    </div>
  );
}
