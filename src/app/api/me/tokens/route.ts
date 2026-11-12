import { z } from "zod";
import { prisma } from "@/server/db";
import { apiUser, err, json } from "@/server/session";
import { MAX_TOKENS, createApiToken } from "@/server/apiTokens";
import { hit } from "@/server/rateLimit";

/** Tokens are managed from a signed-in browser only: a token can never list or mint tokens. */
export async function GET() {
  const user = await apiUser();
  if (user instanceof Response) return user;
  const tokens = await prisma.apiToken.findMany({
    where: { userId: user.id },
    orderBy: { createdAt: "desc" },
    select: { id: true, name: true, hint: true, lastUsedAt: true, createdAt: true },
  });
  return json({ tokens });
}

const body = z.object({ name: z.string().trim().min(1).max(60) });

export async function POST(req: Request) {
  const user = await apiUser();
  if (user instanceof Response) return user;
  const parsed = body.safeParse(await req.json().catch(() => null));
  if (!parsed.success) return err("Give the token a name (1 to 60 characters)");
  if (!hit(`tokens:${user.id}`, 20, 60 * 60_000)) return err("Too many new tokens. Try again later.", 429);
  const made = await createApiToken(user.id, parsed.data.name);
  if (!made) return err(`You can have ${MAX_TOKENS} tokens. Revoke one first.`, 409);
  // The only time the token itself is ever sent.
  return json({ id: made.id, token: made.token });
}
