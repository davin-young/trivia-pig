import { OAUTH_CORS, protectedResourceMetadata, oauthJson } from "@/server/oauth";

export const dynamic = "force-dynamic";

/** Protected resource metadata (RFC 9728): tells an MCP client where to sign in for /mcp. */
export function GET() {
  return oauthJson(protectedResourceMetadata());
}
export function OPTIONS() {
  return new Response(null, { status: 204, headers: OAUTH_CORS });
}
