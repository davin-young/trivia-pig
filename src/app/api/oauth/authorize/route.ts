import { approve, checkAuthorize, deny, oauthOrigin } from "@/server/oauth";
import { currentUser } from "@/server/session";

export const dynamic = "force-dynamic";

/**
 * The answer to the consent screen. Only a form posted from this site by a signed-in
 * person counts: the Origin header must be ours (a cross-site form cannot fake it).
 */
export async function POST(req: Request) {
  const origin = req.headers.get("origin");
  if (!origin || origin.replace(/\/+$/, "") !== oauthOrigin()) return new Response("Bad origin", { status: 403 });
  const user = await currentUser();
  if (!user) return new Response("Not signed in", { status: 401 });
  const form = Object.fromEntries(new URLSearchParams((await req.text()).slice(0, 20_000)));
  const check = await checkAuthorize(form);
  if (!check.ok) return "redirect" in check ? Response.redirect(check.redirect, 303) : new Response(check.show, { status: 400 });
  const to = form.decision === "allow" ? await approve(user.id, check.request) : deny(check.request);
  return new Response(null, { status: 303, headers: { location: to, "cache-control": "no-store" } });
}
