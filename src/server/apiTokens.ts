import "server-only";
import type { User } from "@prisma/client";
import { prisma } from "./db";
import { randomToken, sha256 } from "./crypto";
import { apiUser, err } from "./session";
import { hit } from "./rateLimit";

/**
 * Personal access tokens for the board API and the MCP server.
 *
 * A token stands in for its owner, but only for that person's own boards: it can never
 * reach a live game, another host's boards, the account itself, or the token list.
 * Only a SHA-256 of the token is stored, so it is shown once, when it is made.
 */
export const TOKEN_PREFIX = "tp_";
export const MAX_TOKENS = 10;
/** Requests per minute for one token. */
const PER_MINUTE = 120;

export async function createApiToken(userId: string, name: string): Promise<{ id: string; token: string } | null> {
  if ((await prisma.apiToken.count({ where: { userId } })) >= MAX_TOKENS) return null;
  const token = TOKEN_PREFIX + randomToken(30);
  const row = await prisma.apiToken.create({ data: { userId, name, tokenHash: sha256(token), hint: token.slice(-4) } });
  return { id: row.id, token };
}

function bearer(req: Request): string | null {
  const h = req.headers.get("authorization");
  if (!h) return null;
  const m = /^Bearer\s+(\S+)$/i.exec(h.trim());
  return m ? m[1] : "";
}

export type ApiAuth = { user: User; via: "session" } | { user: User; via: "token"; tokenId: string };

/**
 * Who is calling a board API route: a signed-in browser (cookie) or a token.
 * A request that sends an Authorization header is judged on that header alone.
 */
export async function apiAuth(req: Request): Promise<ApiAuth | Response> {
  const token = bearer(req);
  if (token === null) {
    const user = await apiUser();
    return user instanceof Response ? user : { user, via: "session" };
  }
  const unauthorized = () =>
    new Response(JSON.stringify({ error: "Invalid or revoked token" }), {
      status: 401,
      headers: { "content-type": "application/json", "www-authenticate": 'Bearer realm="Trivia Pig"' },
    });
  if (!token.startsWith(TOKEN_PREFIX) || token.length > 200) return unauthorized();
  const row = await prisma.apiToken.findUnique({ where: { tokenHash: sha256(token) }, include: { user: true } });
  if (!row) return unauthorized();
  if (!hit(`apitoken:${row.id}`, PER_MINUTE, 60_000)) return err("Too many requests. Wait a minute and try again.", 429);
  // Good enough for "last used": at most one write a minute per token.
  if (!row.lastUsedAt || Date.now() - row.lastUsedAt.getTime() > 60_000) {
    void prisma.apiToken.update({ where: { id: row.id }, data: { lastUsedAt: new Date() } }).catch(() => {});
  }
  return { user: row.user, via: "token", tokenId: row.id };
}
