import "server-only";
import { cookies } from "next/headers";
import type { NextResponse } from "next/server";
import { Prisma, type PlayerProfile } from "@prisma/client";
import type { Drawing } from "@/shared/strokes";
import { randomToken, sha256 } from "./crypto";
import { prisma } from "./db";
import { totals } from "./playerResults";
import { cookieOptions, currentUser } from "./session";

/** The cookie that lets a device find its saved player again. Holds a random secret; only its hash is stored. */
export const PLAYER_COOKIE = "tp_player";
const PLAYER_COOKIE_DAYS = 400;

async function deviceProfile(): Promise<PlayerProfile | null> {
  const token = (await cookies()).get(PLAYER_COOKIE)?.value;
  if (!token || token.length < 20 || token.length > 100) return null;
  return prisma.playerProfile.findUnique({ where: { tokenHash: sha256(token) } });
}

/** Fold one profile into another: results and seats move over, the emptied one is deleted. */
async function merge(from: PlayerProfile, into: PlayerProfile) {
  const have = new Set((await prisma.playerResult.findMany({ where: { profileId: into.id }, select: { gameId: true } })).map((r) => r.gameId));
  await prisma.$transaction([
    prisma.playerResult.updateMany({ where: { profileId: from.id, gameId: { notIn: [...have] } }, data: { profileId: into.id } }),
    prisma.gamePlayer.updateMany({ where: { profileId: from.id }, data: { profileId: into.id } }),
    prisma.playerProfile.delete({ where: { id: from.id } }),
  ]);
}

/**
 * The saved player for this request, if there is one. Signed in: the account's player (a
 * player saved on this device before signing in is attached to the account, or folded into
 * the account's existing one). Signed out: the player remembered by this device's cookie.
 */
export async function currentProfile(): Promise<PlayerProfile | null> {
  const [user, device] = await Promise.all([currentUser(), deviceProfile()]);
  if (!user) return device;
  const mine = await prisma.playerProfile.findUnique({ where: { userId: user.id } });
  if (!mine) {
    if (device && !device.userId) return prisma.playerProfile.update({ where: { id: device.id }, data: { userId: user.id } });
    return null;
  }
  if (device && device.id !== mine.id && !device.userId) await merge(device, mine);
  return mine;
}

export interface ProfileInput {
  name: string;
  /** undefined leaves it as it is; null removes it. */
  signature?: Drawing | null;
  avatar?: Drawing | null;
}

const jsonOrNull = (d: Drawing | null) => (d === null ? Prisma.DbNull : (d as unknown as Prisma.InputJsonValue));

/** Create or update the saved player. A new one gets a device cookie: call `setCookie` on the response. */
export async function saveProfile(input: ProfileInput): Promise<{ profile: PlayerProfile; setCookie: (res: NextResponse) => void }> {
  const data = {
    name: input.name,
    ...(input.signature !== undefined ? { signature: jsonOrNull(input.signature) } : {}),
    ...(input.avatar !== undefined ? { avatar: jsonOrNull(input.avatar) } : {}),
  };
  const existing = await currentProfile();
  if (existing) {
    const profile = await prisma.playerProfile.update({ where: { id: existing.id }, data: { ...data, lastSeenAt: new Date() } });
    return { profile, setCookie: () => {} };
  }
  const user = await currentUser();
  const token = randomToken();
  const profile = await prisma.playerProfile.create({ data: { tokenHash: sha256(token), userId: user?.id ?? null, ...data } });
  return { profile, setCookie: (res) => res.cookies.set(PLAYER_COOKIE, token, cookieOptions(PLAYER_COOKIE_DAYS * 86400)) };
}

export async function forgetProfile(res: NextResponse): Promise<void> {
  const profile = await currentProfile();
  if (profile) await prisma.playerProfile.delete({ where: { id: profile.id } });
  res.cookies.set(PLAYER_COOKIE, "", cookieOptions(0));
}

/** What the player's own pages get to see. */
export async function profileView(profile: PlayerProfile) {
  const rows = await prisma.playerResult.findMany({ where: { profileId: profile.id }, orderBy: { finishedAt: "desc" } });
  return {
    name: profile.name,
    signature: (profile.signature ?? null) as Drawing | null,
    avatar: (profile.avatar ?? null) as Drawing | null,
    account: !!profile.userId,
    since: profile.createdAt.toISOString(),
    stats: totals(rows),
    recent: rows.slice(0, 12).map((r) => ({ title: r.boardTitle, score: r.score, place: r.place, contestants: r.contestants, right: r.right, wrong: r.wrong, team: r.team, at: r.finishedAt.toISOString() })),
  };
}
export type ProfileView = Awaited<ReturnType<typeof profileView>>;
