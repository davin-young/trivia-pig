/**
 * Latency-fair buzzing.
 *
 * "First packet to arrive wins" punishes players on slow Wi-Fi or mobile data.
 * Instead, the server measures each phone's round-trip time itself (so clients
 * can't lie about it), estimates when the button was actually pressed
 * (arrival − RTT/2, capped at the hold window), and holds the first buzz for a short window so a
 * slightly-later packet from an earlier press can still win.
 */

/** How long the first buzz waits for competing buzzes before a winner is picked. */
export const BUZZ_WINDOW_MS = 80;
/**
 * Never credit a player with more than this much one-way latency. It equals the window, so a
 * buzz that only just made the window can never be dated before the buzz that opened it.
 */
export const MAX_COMPENSATION_MS = BUZZ_WINDOW_MS;

export interface PendingBuzz<T = unknown> {
  playerId: string;
  /** Server clock when the packet arrived. */
  arrivedAt: number;
  /** Server-measured round trip in ms (0 if unknown). */
  rttMs: number;
  /** Arrival order, to break exact ties deterministically. */
  order: number;
  payload: T;
}

/** Estimated moment the player pressed the button, on the server's clock. */
export function pressedAt(arrivedAt: number, rttMs: number, floor = 0): number {
  const oneWay = Math.min(MAX_COMPENSATION_MS, Math.max(0, rttMs) / 2);
  return Math.max(floor, Math.round(arrivedAt - oneWay));
}

/** Sort a window of buzzes by estimated press time (earliest first). */
export function orderBuzzes<T>(pending: PendingBuzz<T>[], floor = 0): (PendingBuzz<T> & { at: number })[] {
  return pending
    .map((b) => ({ ...b, at: pressedAt(b.arrivedAt, b.rttMs, floor) }))
    .sort((a, b) => a.at - b.at || a.order - b.order);
}

/**
 * Rolling round-trip estimate: the smallest of the last few samples. A phone can answer a
 * probe late but never early, so the minimum is the hardest figure to inflate.
 */
export class RttTracker {
  private samples: number[] = [];
  constructor(private size = 5) {}
  add(ms: number) {
    if (!Number.isFinite(ms) || ms < 0 || ms > 5000) return;
    this.samples.push(ms);
    if (this.samples.length > this.size) this.samples.shift();
  }
  get value(): number {
    return this.samples.length ? Math.min(...this.samples) : 0;
  }
}
