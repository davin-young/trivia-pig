import { z } from "zod";
import { prisma } from "@/server/db";
import { apiUser, err, json } from "@/server/session";
import { hostRoleFor } from "@/server/access";
import { pairing } from "@/server/pairingStore";
import { env } from "@/server/env";

const body = z.object({ role: z.enum(["HOST", "COHOST", "SCOREKEEPER"]).default("HOST") });

/** Issue a 5-minute, single-use pairing token for handing host controls to another device. */
export async function POST(req: Request, ctx: { params: Promise<{ id: string }> }) {
  const user = await apiUser();
  if (user instanceof Response) return user;
  const { id } = await ctx.params;
  const game = await prisma.game.findUnique({ where: { id } });
  if (!game) return err("Game not found", 404);
  const myRole = await hostRoleFor(user.id, game.ownerId);
  if (!myRole) return err("Not your game", 403);
  const parsed = body.safeParse(await req.json().catch(() => ({})));
  if (!parsed.success) return err("Bad role");
  // You can hand out your own level of access or lower, never higher.
  const rank = { HOST: 3, COHOST: 2, SCOREKEEPER: 1 } as const;
  const role = rank[parsed.data.role] <= rank[myRole] ? parsed.data.role : myRole;
  const { token, expiresAt } = await pairing.issue(game.id, user.id, role);
  return json({ url: `${env.appUrl}/pair/${token}`, expiresAt, role });
}
