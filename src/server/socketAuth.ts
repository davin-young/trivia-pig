import type { HostRole } from "@prisma/client";
import { handshakeSchema } from "@/shared/protocol";
import { parseCookies, sha256 } from "./crypto";
import { capGrantRole, grantCookieName } from "./pairing";
import { SESSION_COOKIE } from "./auth";

export interface GameRef {
  id: string;
  code: string;
  ownerId: string;
}

export interface SocketAuthDeps {
  findGame(code: string): Promise<GameRef | null>;
  userIdFromSession(token: string): Promise<string | null>;
  hostRoleFor(userId: string, ownerId: string): Promise<HostRole | null>;
  verifyGrant(token: string, gameId: string): Promise<{ userId: string; role: HostRole } | null>;
  playerIdForToken(gameId: string, tokenHash: string): Promise<string | null>;
  /** The game's "spectators" setting: may people follow along through the watch link? */
  spectatorsAllowed(gameId: string): Promise<boolean>;
}

export type SocketIdentity =
  | { role: "display"; game: GameRef; spectator: boolean }
  | { role: "host"; game: GameRef; userId: string; hostRole: HostRole }
  | { role: "player"; game: GameRef; playerId: string | null };

export class SocketAuthError extends Error {}

/**
 * Decide who a connecting socket is. Host identity comes ONLY from the
 * httpOnly session cookie or a game-scoped pairing grant cookie — never
 * from anything the client puts in the handshake payload.
 */
export async function authorizeSocket(rawAuth: unknown, cookieHeader: string | undefined, deps: SocketAuthDeps): Promise<SocketIdentity> {
  const parsed = handshakeSchema.safeParse(rawAuth);
  if (!parsed.success) throw new SocketAuthError("Bad handshake");
  const { role, playerToken } = parsed.data;
  const code = parsed.data.code.toUpperCase();
  const game = await deps.findGame(code);
  if (!game) throw new SocketAuthError("Game not found");

  if (role === "display") {
    const spectator = parsed.data.watch === true;
    // The browser shows a notice too, but the setting has to hold for a client that ignores it.
    if (spectator && !(await deps.spectatorsAllowed(game.id))) throw new SocketAuthError("Not authorized: watching is turned off for this game");
    return { role, game, spectator };
  }

  if (role === "player") {
    const playerId = playerToken ? await deps.playerIdForToken(game.id, sha256(playerToken)) : null;
    return { role, game, playerId };
  }

  const cookies = parseCookies(cookieHeader);
  const session = cookies[SESSION_COOKIE];
  if (session) {
    const userId = await deps.userIdFromSession(session);
    if (userId) {
      const hostRole = await deps.hostRoleFor(userId, game.ownerId);
      if (hostRole) return { role: "host", game, userId, hostRole };
    }
  }
  const grant = cookies[grantCookieName(code)];
  if (grant) {
    const g = await deps.verifyGrant(grant, game.id);
    // A grant outlives the membership it was made from, so check that again on every connect.
    const hostRole = g && capGrantRole(g.role, await deps.hostRoleFor(g.userId, game.ownerId));
    if (g && hostRole) return { role: "host", game, userId: g.userId, hostRole };
  }
  throw new SocketAuthError("Not authorized to host this game");
}
