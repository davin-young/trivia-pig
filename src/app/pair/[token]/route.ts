import { NextResponse } from "next/server";
import { prisma } from "@/server/db";
import { pairing } from "@/server/pairingStore";
import { grantCookieName, GRANT_TTL_MS } from "@/server/pairing";
import { cookieOptions } from "@/server/session";
import { env } from "@/server/env";

/** Scanned from the host's QR: swap the one-time token for a game-scoped host cookie. */
export async function GET(_req: Request, ctx: { params: Promise<{ token: string }> }) {
  const { token } = await ctx.params;
  const result = await pairing.redeem(token);
  if (!result) return NextResponse.redirect(`${env.appUrl}/pair-expired`);
  const game = await prisma.game.findUnique({ where: { id: result.gameId }, select: { code: true } });
  if (!game) return NextResponse.redirect(`${env.appUrl}/pair-expired`);
  const res = NextResponse.redirect(`${env.appUrl}/host/${game.code}`);
  res.cookies.set(grantCookieName(game.code), result.grantToken, cookieOptions(GRANT_TTL_MS / 1000));
  return res;
}
