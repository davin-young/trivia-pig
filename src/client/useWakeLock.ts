"use client";

import { useEffect } from "react";

/**
 * Keep the screen awake while a game view is open (TV display, host tablet,
 * player phones). Uses the Screen Wake Lock API where available and silently
 * does nothing elsewhere. The lock is re-acquired when the tab becomes visible
 * again, because browsers release it whenever the page is hidden.
 */
export function useWakeLock(active = true) {
  useEffect(() => {
    if (!active || typeof navigator === "undefined" || !("wakeLock" in navigator)) return;
    let lock: WakeLockSentinel | null = null;
    let cancelled = false;

    const acquire = async () => {
      if (cancelled || document.visibilityState !== "visible") return;
      try {
        lock = await navigator.wakeLock.request("screen");
      } catch {
        // denied (battery saver, permissions policy): nothing to do
      }
    };
    const onVisible = () => {
      if (document.visibilityState === "visible") void acquire();
    };

    void acquire();
    document.addEventListener("visibilitychange", onVisible);
    return () => {
      cancelled = true;
      document.removeEventListener("visibilitychange", onVisible);
      void lock?.release().catch(() => {});
    };
  }, [active]);
}
