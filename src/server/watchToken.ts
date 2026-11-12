import { createHmac, timingSafeEqual } from "node:crypto";
import { env } from "./env";

/**
 * The watch token stands in for the room code in links meant for viewers (watch link, score
 * overlay, audience link). It is the game's id followed by a signature, so it needs no storage,
 * and it lets its holder watch or join the audience but never play: the room code is not in it
 * and is not sent to anyone who connects with it.
 *
 * Tokens are compared without regard to case, because pages upper-case the code in their URL.
 */
const MAC_LENGTH = 20;
/** Room codes are 4 to 6 characters; anything longer in a code's place is a watch token. */
export const MAX_ROOM_CODE_LENGTH = 6;

function mac(gameId: string, secret: string): string {
  return createHmac("sha256", secret).update(`watch:${gameId}`).digest("hex").slice(0, MAC_LENGTH);
}

export function watchTokenFor(gameId: string, secret: string = env.secret): string {
  return `${gameId}${mac(gameId, secret)}`.toLowerCase();
}

export function isWatchToken(code: string): boolean {
  return code.length > MAX_ROOM_CODE_LENGTH;
}

/** The game id a watch token was made for, or null when its signature does not match. */
export function gameIdFromWatchToken(token: string, secret: string = env.secret): string | null {
  const t = token.toLowerCase();
  if (t.length <= MAC_LENGTH) return null;
  const gameId = t.slice(0, -MAC_LENGTH);
  const given = Buffer.from(t.slice(-MAC_LENGTH));
  const expected = Buffer.from(mac(gameId, secret));
  return given.length === expected.length && timingSafeEqual(given, expected) ? gameId : null;
}
