import type { HostRole } from "@prisma/client";
import { randomToken, sha256 } from "./crypto";

/**
 * Device hand-off: a signed-in host shows a QR code containing a short-lived,
 * single-use pairing token. Scanning it on an iPad exchanges the token for a
 * game-scoped "host grant" cookie, so nobody types a password on the iPad.
 */
export const PAIRING_TTL_MS = 5 * 60_000;
export const GRANT_TTL_MS = 18 * 3600_000;

export interface PairingRecord {
  tokenHash: string;
  gameId: string;
  userId: string;
  role: HostRole;
  expiresAt: Date;
  usedAt: Date | null;
}
export interface GrantRecord {
  tokenHash: string;
  gameId: string;
  userId: string;
  role: HostRole;
  expiresAt: Date;
}

export interface PairingStore {
  createPairing(rec: PairingRecord): Promise<void>;
  findPairing(tokenHash: string): Promise<PairingRecord | null>;
  /** Atomically mark used; returns false if it was already used. */
  markPairingUsed(tokenHash: string, at: Date): Promise<boolean>;
  createGrant(rec: GrantRecord): Promise<void>;
  findGrant(tokenHash: string): Promise<GrantRecord | null>;
}

export class PairingService {
  constructor(
    private store: PairingStore,
    private now: () => number = Date.now,
  ) {}

  async issue(gameId: string, userId: string, role: HostRole): Promise<{ token: string; expiresAt: Date }> {
    const token = randomToken(24);
    const expiresAt = new Date(this.now() + PAIRING_TTL_MS);
    await this.store.createPairing({ tokenHash: sha256(token), gameId, userId, role, expiresAt, usedAt: null });
    return { token, expiresAt };
  }

  /** Exchange a pairing token for a long-lived (per game) grant token. */
  async redeem(token: string): Promise<{ grantToken: string; gameId: string; role: HostRole; expiresAt: Date } | null> {
    if (!token || token.length > 100) return null;
    const hash = sha256(token);
    const rec = await this.store.findPairing(hash);
    if (!rec || rec.usedAt || rec.expiresAt.getTime() < this.now()) return null;
    if (!(await this.store.markPairingUsed(hash, new Date(this.now())))) return null;
    const grantToken = randomToken();
    const expiresAt = new Date(this.now() + GRANT_TTL_MS);
    await this.store.createGrant({ tokenHash: sha256(grantToken), gameId: rec.gameId, userId: rec.userId, role: rec.role, expiresAt });
    return { grantToken, gameId: rec.gameId, role: rec.role, expiresAt };
  }

  async verifyGrant(grantToken: string | undefined | null, gameId: string): Promise<GrantRecord | null> {
    if (!grantToken || grantToken.length > 100) return null;
    const g = await this.store.findGrant(sha256(grantToken));
    if (!g || g.gameId !== gameId || g.expiresAt.getTime() < this.now()) return null;
    return g;
  }
}

const ROLE_RANK: Record<HostRole, number> = { SCOREKEEPER: 0, COHOST: 1, HOST: 2 };

/**
 * What a grant is worth today: never more than the role its user still holds for the game's
 * owner, and nothing once that role is gone.
 */
export function capGrantRole(granted: HostRole, current: HostRole | null): HostRole | null {
  if (!current) return null;
  return ROLE_RANK[current] < ROLE_RANK[granted] ? current : granted;
}

export function grantCookieName(code: string): string {
  return `jp_grant_${code.toUpperCase()}`;
}

export class MemoryPairingStore implements PairingStore {
  pairings = new Map<string, PairingRecord>();
  grants = new Map<string, GrantRecord>();
  async createPairing(rec: PairingRecord) {
    this.pairings.set(rec.tokenHash, { ...rec });
  }
  async findPairing(h: string) {
    return this.pairings.get(h) ?? null;
  }
  async markPairingUsed(h: string, at: Date) {
    const r = this.pairings.get(h);
    if (!r || r.usedAt) return false;
    r.usedAt = at;
    return true;
  }
  async createGrant(rec: GrantRecord) {
    this.grants.set(rec.tokenHash, { ...rec });
  }
  async findGrant(h: string) {
    return this.grants.get(h) ?? null;
  }
}
