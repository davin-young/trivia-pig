import { OAUTH_CORS, oauthJson, readForm, revoke } from "@/server/oauth";

export const dynamic = "force-dynamic";

/** Token revocation (RFC 7009): an app disconnecting itself. */
export async function POST(req: Request) {
  await revoke((await readForm(req)).token ?? "");
  return oauthJson({});
}
export function OPTIONS() {
  return new Response(null, { status: 204, headers: OAUTH_CORS });
}
