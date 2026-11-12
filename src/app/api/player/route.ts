import { z } from "zod";
import { compactDrawing, drawingSchema, isEmptyDrawing } from "@/shared/strokes";
import { cleanName, containsProfanity } from "@/server/profanity";
import { currentProfile, forgetProfile, profileView, saveProfile } from "@/server/playerProfile";
import { hit } from "@/server/rateLimit";
import { clientIp, err, json } from "@/server/session";

const body = z.object({
  name: z.string().trim().min(1).max(24),
  signature: drawingSchema.nullable().optional(),
  avatar: drawingSchema.nullable().optional(),
});

const tidy = (d: z.infer<typeof drawingSchema> | null | undefined) => (d === undefined ? undefined : d && !isEmptyDrawing(d) ? compactDrawing(d) : null);

/** The saved player for this device or account (null when there is none). */
export async function GET() {
  const profile = await currentProfile();
  return json({ profile: profile ? await profileView(profile) : null });
}

/** Save the player's name and drawings. The first save on a device sets the cookie that remembers it. */
export async function PUT(req: Request) {
  if (!hit(`player:${clientIp(req)}`, 30, 60_000)) return err("Slow down a little and try again", 429);
  const parsed = body.safeParse(await req.json().catch(() => null));
  if (!parsed.success) return err("Enter a name (24 characters at most)");
  const name = cleanName(parsed.data.name);
  if (!name) return err("Enter a name");
  if (containsProfanity(name)) return err("Please choose a different name");
  const { profile, setCookie } = await saveProfile({ name, signature: tidy(parsed.data.signature), avatar: tidy(parsed.data.avatar) });
  const res = json({ profile: await profileView(profile) });
  setCookie(res);
  return res;
}

/** Forget the player: the name, drawings and results are deleted and the cookie is cleared. */
export async function DELETE() {
  const res = json({ ok: true });
  await forgetProfile(res);
  return res;
}
