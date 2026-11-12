import { OAUTH_CORS, authServerMetadata, oauthJson } from "@/server/oauth";

export const dynamic = "force-dynamic";

/** OAuth authorization server metadata (RFC 8414). Clients may append the issuer path, so any suffix answers the same. */
export function GET() {
  return oauthJson(authServerMetadata());
}
export function OPTIONS() {
  return new Response(null, { status: 204, headers: OAUTH_CORS });
}
