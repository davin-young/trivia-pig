import { gameNow } from "@/shared/clock";
/** Token bucket: `capacity` burst, refilling `perSecond` tokens per second. */
export class TokenBucket {
  private tokens: number;
  private last: number;
  constructor(
    private capacity: number,
    private perSecond: number,
    now = gameNow(),
  ) {
    this.tokens = capacity;
    this.last = now;
  }
  take(cost = 1, now = gameNow()): boolean {
    // Time never counts backwards here: a clock that steps back must not drain the bucket.
    this.tokens = Math.min(this.capacity, this.tokens + (Math.max(0, now - this.last) / 1000) * this.perSecond);
    this.last = now;
    if (this.tokens < cost) return false;
    this.tokens -= cost;
    return true;
  }
}

/** Keyed fixed-window limiter for HTTP routes (login, uploads, joins). */
const windows = new Map<string, { count: number; resetAt: number }>();
export function hit(key: string, limit: number, windowMs: number, now = gameNow()): boolean {
  const w = windows.get(key);
  if (!w || w.resetAt <= now) {
    windows.set(key, { count: 1, resetAt: now + windowMs });
    if (windows.size > 10_000) for (const [k, v] of windows) if (v.resetAt <= now) windows.delete(k);
    return true;
  }
  w.count++;
  return w.count <= limit;
}

type Headers1 = Record<string, string | string[] | undefined>;
const one = (v: string | string[] | undefined) => (Array.isArray(v) ? v[0] : v)?.trim() || "";

/**
 * The address a request really came from. Behind a trusted proxy (TRUST_PROXY=true) that is
 * Cloudflare's header, else the right-most X-Forwarded-For hop (the one our proxy added;
 * anything to its left is whatever the client sent). Otherwise forwarding headers are ignored
 * and the socket's own address is used.
 */
export function resolveClientIp(headers: Headers1, remoteAddress: string | undefined, trustProxy: boolean): string {
  if (trustProxy) {
    const cf = one(headers["cf-connecting-ip"]);
    if (cf) return cf;
    const hop = one(headers["x-forwarded-for"]).split(",").pop()?.trim();
    if (hop) return hop;
  }
  return remoteAddress || "direct";
}

/** Header that server.ts sets on every request to the resolved address, replacing whatever the client sent. */
export const CLIENT_IP_HEADER = "x-client-ip";

/** Key for per-client limits in route handlers (they cannot see the socket; server.ts resolves it). */
export function clientIp(req: Request): string {
  return req.headers.get(CLIENT_IP_HEADER)?.trim() || "direct";
}
