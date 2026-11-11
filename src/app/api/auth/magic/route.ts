import { z } from "zod";
import { NextResponse } from "next/server";
import { consumeMagicLink, createMagicLink, sendMail } from "@/server/auth";
import { env } from "@/server/env";
import { clientIp, err, startSession } from "@/server/session";
import { hit } from "@/server/rateLimit";

const body = z.object({ email: z.string().email().max(200) });

/** Request a sign-in link by email. */
export async function POST(req: Request) {
  if (!hit(`magic:${clientIp(req)}`, 5, 10 * 60_000)) return err("Too many requests, try later", 429);
  const parsed = body.safeParse(await req.json().catch(() => null));
  if (!parsed.success) return err("Enter a valid email");
  const url = await createMagicLink(parsed.data.email);
  const sent = await sendMail(parsed.data.email, "Your Jeppidy sign-in link", `Sign in to Jeppidy:\n\n${url}\n\nThis link expires in 15 minutes.`);
  // Without SMTP configured, the link is printed to the server log (see README).
  return NextResponse.json({ ok: true, sent, devLink: !sent && !env.isProd ? url : undefined });
}

/** Follow a sign-in link. */
export async function GET(req: Request) {
  const token = new URL(req.url).searchParams.get("token") ?? "";
  const user = await consumeMagicLink(token);
  if (!user) return NextResponse.redirect(`${env.appUrl}/login?error=link`);
  return startSession(NextResponse.redirect(`${env.appUrl}/dashboard`), user.id);
}
