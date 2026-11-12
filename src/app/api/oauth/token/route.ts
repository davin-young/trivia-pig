import { OAUTH_CORS, exchange, oauthError, readForm } from "@/server/oauth";
import { hit } from "@/server/rateLimit";
import { clientIp } from "@/server/session";

export const dynamic = "force-dynamic";

/** Token endpoint: swap a one-time code (with its PKCE verifier) or a refresh token for an access token. */
export async function POST(req: Request) {
  if (!hit(`oauthtok:${clientIp(req)}`, 120, 60_000)) return oauthError("temporarily_unavailable", "Too many requests.", 429);
  return exchange(await readForm(req));
}
export function OPTIONS() {
  return new Response(null, { status: 204, headers: OAUTH_CORS });
}
