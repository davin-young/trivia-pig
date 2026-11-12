import { OAUTH_CORS, oauthError, oauthJson, registerClient } from "@/server/oauth";
import { hit } from "@/server/rateLimit";
import { clientIp } from "@/server/session";

export const dynamic = "force-dynamic";

/** Dynamic client registration (RFC 7591): an AI app introduces itself before sending anyone to sign in. */
export async function POST(req: Request) {
  if (!hit(`oauthreg:${clientIp(req)}`, 20, 60 * 60_000)) return oauthError("temporarily_unavailable", "Too many registrations. Try again later.", 429);
  let body: unknown = null;
  try {
    body = JSON.parse((await req.text()).slice(0, 20_000));
  } catch {
    return oauthError("invalid_client_metadata", "Send JSON.");
  }
  const made = await registerClient(body);
  if ("error" in made) return oauthError(made.error, made.description);
  return oauthJson(
    { ...made, token_endpoint_auth_method: "none", grant_types: ["authorization_code", "refresh_token"], response_types: ["code"], client_id_issued_at: Math.floor(Date.now() / 1000) },
    201,
  );
}
export function OPTIONS() {
  return new Response(null, { status: 204, headers: OAUTH_CORS });
}
