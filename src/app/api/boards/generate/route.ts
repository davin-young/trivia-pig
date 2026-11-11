import type { Prisma } from "@prisma/client";
import { prisma } from "@/server/db";
import { apiUser, err, json } from "@/server/session";
import { AiDraftError, draftRequestSchema, generateDraft } from "@/server/aiDraft";
import { env } from "@/server/env";
import { hit } from "@/server/rateLimit";

export const maxDuration = 300;

/** Whether the "Draft with AI" button should be offered. */
export async function GET() {
  const user = await apiUser();
  if (user instanceof Response) return user;
  return json({ enabled: env.aiEnabled });
}

/** Draft a board on a topic with Claude and save it as a new board for the signed-in host. */
export async function POST(req: Request) {
  const user = await apiUser();
  if (user instanceof Response) return user;
  if (!env.aiEnabled) return err("AI drafts are not set up on this server", 503);
  const parsed = draftRequestSchema.safeParse(await req.json().catch(() => null));
  if (!parsed.success) return err("Describe a topic (2 to 300 characters)");
  // Each draft costs real money on the server owner's API key.
  if (!hit(`ai:${user.id}`, env.aiDraftsPerHour, 60 * 60_000)) return err(`Limit reached: ${env.aiDraftsPerHour} AI drafts per hour. Try again later.`, 429);
  try {
    const draft = await generateDraft(parsed.data);
    const board = await prisma.board.create({
      data: {
        ownerId: user.id,
        title: draft.title,
        description: `AI draft about: ${parsed.data.topic}. Check every clue before you play.`.slice(0, 1000),
        tags: ["ai-draft"],
        content: draft.content as unknown as Prisma.InputJsonValue,
      },
    });
    return json({ id: board.id });
  } catch (e) {
    if (e instanceof AiDraftError) return err(e.message, e.status);
    console.error("[ai draft]", e);
    return err("Couldn't create a draft", 500);
  }
}
