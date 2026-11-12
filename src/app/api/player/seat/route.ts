import { z } from "zod";
import { sha256 } from "@/server/crypto";
import { prisma } from "@/server/db";
import { currentProfile } from "@/server/playerProfile";
import { hit } from "@/server/rateLimit";
import { clientIp, err, json } from "@/server/session";

const body = z.object({ playerToken: z.string().min(10).max(100) });

/**
 * Tie a seat in a game to the saved player, so the result counts toward their stats. The
 * seat is proved by its own secret token (the one the phone got when it joined).
 */
export async function POST(req: Request) {
  if (!hit(`player-seat:${clientIp(req)}`, 30, 60_000)) return err("Slow down a little and try again", 429);
  const parsed = body.safeParse(await req.json().catch(() => null));
  if (!parsed.success) return err("Bad request");
  const profile = await currentProfile();
  if (!profile) return err("No saved player on this device", 404);
  const { count } = await prisma.gamePlayer.updateMany({ where: { tokenHash: sha256(parsed.data.playerToken) }, data: { profileId: profile.id } });
  return count ? json({ ok: true }) : err("Seat not found", 404);
}
