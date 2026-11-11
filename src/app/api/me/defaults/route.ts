import type { Prisma } from "@prisma/client";
import { prisma } from "@/server/db";
import { apiUser, err, json } from "@/server/session";
import { settingsSchema } from "@/engine/types";

/** Save game settings as this host's defaults for new games. */
export async function PUT(req: Request) {
  const user = await apiUser();
  if (user instanceof Response) return user;
  const parsed = settingsSchema.safeParse(await req.json().catch(() => null));
  if (!parsed.success) return err("Invalid settings");
  await prisma.user.update({ where: { id: user.id }, data: { gameDefaults: parsed.data as unknown as Prisma.InputJsonValue } });
  return json({ ok: true });
}
