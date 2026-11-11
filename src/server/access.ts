import type { HostRole } from "@prisma/client";
import { prisma } from "./db";

/** What a signed-in user may do in a given owner's game. */
export async function hostRoleFor(userId: string, ownerId: string): Promise<HostRole | null> {
  if (userId === ownerId) return "HOST";
  const m = await prisma.membership.findUnique({ where: { ownerId_memberId: { ownerId, memberId: userId } } });
  if (!m) return null;
  return m.role === "COHOST" ? "COHOST" : "SCOREKEEPER";
}

/** Owners and co-hosts can edit boards; scorekeepers cannot. */
export async function canEditBoard(userId: string, ownerId: string): Promise<boolean> {
  if (userId === ownerId) return true;
  const m = await prisma.membership.findUnique({ where: { ownerId_memberId: { ownerId, memberId: userId } } });
  return m?.role === "COHOST";
}

/** Owner ids whose boards/games this user can see (themselves + anyone who invited them). */
export async function visibleOwnerIds(userId: string): Promise<{ ownerId: string; role: HostRole }[]> {
  const ms = await prisma.membership.findMany({ where: { memberId: userId } });
  return [{ ownerId: userId, role: "HOST" as HostRole }, ...ms.map((m) => ({ ownerId: m.ownerId, role: m.role as HostRole }))];
}
