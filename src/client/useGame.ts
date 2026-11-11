"use client";

import { useCallback, useEffect, useRef, useState } from "react";
import { io, type Socket } from "socket.io-client";
import type { GameView } from "@/engine/views";
import type { Ack, ClientEvent, ClientPayload, FxEvent, PresenceView } from "@/shared/protocol";

export type ConnStatus = "connecting" | "online" | "reconnecting" | "offline" | "error";

export function playerTokenKey(code: string) {
  return `jp:player:${code.toUpperCase()}`;
}
export function getPlayerToken(code: string): string | undefined {
  try {
    return localStorage.getItem(playerTokenKey(code)) ?? undefined;
  } catch {
    return undefined;
  }
}
export function setPlayerToken(code: string, token: string) {
  try {
    localStorage.setItem(playerTokenKey(code), token);
  } catch {}
}
export function clearPlayerToken(code: string) {
  try {
    localStorage.removeItem(playerTokenKey(code));
  } catch {}
}

interface Options {
  role: "display" | "host" | "player";
  code: string;
  onFx?: (fx: FxEvent) => void;
  onRedirect?: (code: string) => void;
  onKicked?: (reason: string) => void;
}

/**
 * One Socket.IO connection to a game. Auto-reconnects forever; the server
 * re-sends the full state on every (re)connect so the UI always resumes.
 */
export function useGame({ role, code, onFx, onRedirect, onKicked }: Options) {
  const [view, setView] = useState<GameView | null>(null);
  const [presence, setPresence] = useState<PresenceView | null>(null);
  const [status, setStatus] = useState<ConnStatus>("connecting");
  const [error, setError] = useState<string | null>(null);
  const [clockOffset, setClockOffset] = useState(0);
  const socketRef = useRef<Socket | null>(null);
  const cbs = useRef({ onFx, onRedirect, onKicked });
  useEffect(() => {
    cbs.current = { onFx, onRedirect, onKicked };
  });
  const [epoch, setEpoch] = useState(0);

  useEffect(() => {
    const socket = io({
      path: "/socket.io",
      transports: ["websocket", "polling"],
      withCredentials: true,
      reconnection: true,
      reconnectionDelay: 500,
      reconnectionDelayMax: 4000,
      auth: (cb) => cb({ role, code: code.toUpperCase(), playerToken: role === "player" ? getPlayerToken(code) : undefined }),
    });
    socketRef.current = socket;

    socket.on("connect", () => {
      setStatus("online");
      setError(null);
    });
    socket.on("disconnect", (reason) => setStatus(reason === "io client disconnect" ? "offline" : "reconnecting"));
    socket.io.on("reconnect_attempt", () => setStatus("reconnecting"));
    socket.on("connect_error", (e) => {
      setError(e.message);
      const fatal = /not found|not authorized|bad handshake/i.test(e.message);
      setStatus(fatal ? "error" : "reconnecting");
      if (fatal) socket.disconnect();
    });
    socket.on("state", (v: GameView) => {
      setClockOffset(v.serverNow - Date.now());
      setView(v);
    });
    socket.on("presence", (p: PresenceView) => setPresence(p));
    socket.on("fx", (fx: FxEvent) => cbs.current.onFx?.(fx));
    socket.on("redirect", ({ code: next }: { code: string }) => cbs.current.onRedirect?.(next));
    socket.on("kicked", ({ reason }: { reason: string }) => cbs.current.onKicked?.(reason));

    const ping = setInterval(() => socket.connected && socket.emit("presence:ping", {}), 15_000);
    const onVisible = () => {
      if (document.visibilityState === "visible" && !socket.connected) socket.connect();
    };
    document.addEventListener("visibilitychange", onVisible);
    return () => {
      clearInterval(ping);
      document.removeEventListener("visibilitychange", onVisible);
      socket.removeAllListeners();
      socket.disconnect();
    };
  }, [role, code, epoch]);

  const emit = useCallback(<E extends ClientEvent>(event: E, payload: ClientPayload<E>): Promise<Ack> => {
    const socket = socketRef.current;
    if (!socket?.connected) return Promise.resolve({ ok: false, error: "Not connected — reconnecting…" });
    return new Promise((resolve) => {
      socket.timeout(8000).emit(event, payload, (e: Error | null, ack: Ack) => resolve(e ? { ok: false, error: "No response from server" } : ack));
    });
  }, []);

  /** Reconnect with fresh auth (e.g. after a player gets a token). */
  const reconnect = useCallback(() => setEpoch((n) => n + 1), []);

  const now = useCallback(() => Date.now() + clockOffset, [clockOffset]);

  return { view, presence, status, error, emit, reconnect, now };
}

/** Re-render every `ms` (for countdowns). */
export function useTick(ms = 200, active = true) {
  const [, set] = useState(0);
  useEffect(() => {
    if (!active) return;
    const t = setInterval(() => set((n) => n + 1), ms);
    return () => clearInterval(t);
  }, [ms, active]);
}
