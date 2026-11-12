import { prisma } from "@/server/db";
import { apiUser, json } from "@/server/session";

/** Apps connected through sign-in (OAuth). Managed from a signed-in browser only. */
export async function GET() {
  const user = await apiUser();
  if (user instanceof Response) return user;
  const grants = await prisma.oAuthGrant.findMany({
    where: { userId: user.id, refreshExpiresAt: { gt: new Date() } },
    orderBy: { createdAt: "desc" },
    select: { id: true, createdAt: true, lastUsedAt: true, client: { select: { name: true } } },
  });
  return json({ apps: grants.map((g) => ({ id: g.id, name: g.client.name, createdAt: g.createdAt, lastUsedAt: g.lastUsedAt })) });
}
