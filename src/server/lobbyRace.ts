import type { RaceView } from "@/shared/protocol";

/** Taps to cross the finish line. */
export const RACE_GOAL = 40;
export const RACE_COUNTDOWN_MS = 3000;
/** How long the winner stays on screen before the next race can start. */
export const RACE_RESULT_MS = 6000;
/** A race nobody finishes ends by itself. */
export const RACE_MAX_MS = 45_000;
/** Lanes drawn on the big screen. */
export const RACE_LANES = 8;
/** Faster tapping than this is not counted (a script cannot win by sending big numbers). */
const TAPS_PER_SEC = 14;

/**
 * The pig race: a tap game for the lobby. Anyone's first tap starts a countdown, then every
 * tap moves that player's pig; first to RACE_GOAL wins. It lives in memory only: never in
 * the game log, never in the database, and it has no effect on the game.
 */
export class LobbyRace {
  private id = 0;
  private phase: "idle" | "countdown" | "running" | "done" = "idle";
  private startsAt = 0;
  private doneAt = 0;
  private taps = new Map<string, number>();
  private lastTap = new Map<string, number>();
  private winnerId: string | null = null;
  private wins = new Map<string, number>();

  /** Move time-driven steps along. Returns when the next one is due (null when idle). */
  tick(now: number): number | null {
    if (this.phase === "countdown" && now >= this.startsAt) this.phase = "running";
    if (this.phase === "running" && now - this.startsAt >= RACE_MAX_MS) this.phase = "idle";
    if (this.phase === "done" && now - this.doneAt >= RACE_RESULT_MS) this.phase = "idle";
    if (this.phase === "countdown") return this.startsAt;
    if (this.phase === "running") return this.startsAt + RACE_MAX_MS;
    if (this.phase === "done") return this.doneAt + RACE_RESULT_MS;
    return null;
  }

  /** A player tapped `n` times since their last message. Returns true when something changed. */
  tap(playerId: string, n: number, now: number): boolean {
    this.tick(now);
    if (this.phase === "done") return false;
    if (this.phase === "idle") {
      this.id++;
      this.phase = "countdown";
      this.startsAt = now + RACE_COUNTDOWN_MS;
      this.taps = new Map([[playerId, 0]]);
      this.lastTap.clear();
      this.winnerId = null;
      return true;
    }
    if (this.phase === "countdown") {
      // Lining up: taps before the start do not count.
      if (this.taps.has(playerId)) return false;
      this.taps.set(playerId, 0);
      return true;
    }
    const since = now - (this.lastTap.get(playerId) ?? this.startsAt);
    const allowed = Math.max(1, Math.floor((since / 1000) * TAPS_PER_SEC) + 1);
    const add = Math.max(0, Math.min(Math.floor(n), allowed));
    if (!add) return false;
    this.lastTap.set(playerId, now);
    const total = Math.min(RACE_GOAL, (this.taps.get(playerId) ?? 0) + add);
    this.taps.set(playerId, total);
    if (total >= RACE_GOAL) {
      this.phase = "done";
      this.winnerId = playerId;
      this.doneAt = now;
      this.wins.set(playerId, (this.wins.get(playerId) ?? 0) + 1);
    }
    return true;
  }

  /** Someone left the game: their pig leaves the track. */
  drop(playerId: string) {
    this.taps.delete(playerId);
  }

  view(now: number): RaceView | null {
    this.tick(now);
    if (this.phase === "idle") return null;
    const lanes = [...this.taps.entries()]
      .sort((a, b) => b[1] - a[1])
      .slice(0, RACE_LANES)
      .map(([id, taps]) => ({ id, taps, wins: this.wins.get(id) ?? 0 }));
    return { id: this.id, phase: this.phase, startsAt: this.startsAt, goal: RACE_GOAL, lanes, racers: this.taps.size, winnerId: this.winnerId };
  }
}
