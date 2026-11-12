import { approve, checkAuthorize, deny, oauthOrigin } from "@/server/oauth";
import { currentUser } from "@/server/session";

export const dynamic = "force-dynamic";

/**
 * The answer to the consent screen. Only a request made from this site by a signed-in
 * person counts: the Origin header must be ours (another site cannot fake it).
 * Replies with where to send the browser next; the page does the navigation itself,
 * because the site's content security policy stops forms from ending up on another site.
 */
const reply = (data: unknown, status = 200) => new Response(JSON.stringify(data), { status, headers: { "content-type": "application/json", "cache-control": "no-store" } });

export async function POST(req: Request) {
  const origin = req.headers.get("origin");
  if (!origin || origin.replace(/\/+$/, "") !== oauthOrigin()) return reply({ error: "This request did not come from the consent screen." }, 403);
  const user = await currentUser();
  if (!user) return reply({ error: "You are signed out. Sign in and connect the app again." }, 401);
  const form = Object.fromEntries(new URLSearchParams((await req.text()).slice(0, 20_000)));
  const check = await checkAuthorize(form);
  if (!check.ok) return "redirect" in check ? reply({ to: check.redirect }) : reply({ error: check.show }, 400);
  return reply({ to: form.decision === "allow" ? await approve(user.id, check.request) : deny(check.request) });
}
