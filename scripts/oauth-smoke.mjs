/**
 * End-to-end check of OAuth sign-in for the MCP server against a running local server.
 *   BASE_URL=http://localhost:3000 node scripts/oauth-smoke.mjs
 * BASE_URL must be the server's own APP_URL (the consent form checks the Origin header).
 * It makes a throwaway user with a browser session straight in the database, walks the whole
 * flow as an app would, and removes everything again. Tokens are never printed.
 */
import { createHash, randomBytes } from "node:crypto";
import { PrismaClient } from "@prisma/client";

const BASE = (process.env.BASE_URL ?? "http://localhost:3000").replace(/\/+$/, "");
const prisma = new PrismaClient();
let failed = 0;
const check = (name, ok, extra = "") => {
  if (!ok) failed++;
  console.log(`${ok ? "ok  " : "FAIL"} ${name}${ok ? "" : ` ${extra}`}`);
};
const sha = (s) => createHash("sha256").update(s).digest("hex");

const user = await prisma.user.create({ data: { email: `oauth-smoke-${Date.now()}@example.test`, name: "OAuth Smoke" } });
const session = randomBytes(32).toString("base64url");
await prisma.session.create({ data: { tokenHash: sha(session), userId: user.id, expiresAt: new Date(Date.now() + 3600_000) } });
const cookie = `jp_session=${session}`;
const REDIRECT = "http://127.0.0.1:53999/callback";
let clientId = null;

const json = async (r) => {
  try {
    return await r.json();
  } catch {
    return null;
  }
};
const form = (o) => new URLSearchParams(o).toString();
const pkce = () => {
  const verifier = randomBytes(40).toString("base64url");
  return { verifier, challenge: createHash("sha256").update(verifier).digest("base64url") };
};
const authQuery = (challenge, extra = {}) => ({ client_id: clientId, redirect_uri: REDIRECT, response_type: "code", code_challenge: challenge, code_challenge_method: "S256", state: "st-1", ...extra });
const consent = (fields, { origin = BASE, withCookie = true, decision = "allow" } = {}) =>
  fetch(`${BASE}/api/oauth/authorize`, {
    method: "POST",
    redirect: "manual",
    headers: { "content-type": "application/x-www-form-urlencoded", ...(origin ? { origin } : {}), ...(withCookie ? { cookie } : {}) },
    body: form({ ...fields, decision }),
  });
const token = (fields) => fetch(`${BASE}/api/oauth/token`, { method: "POST", headers: { "content-type": "application/x-www-form-urlencoded" }, body: form(fields) });
const mcp = (access) =>
  fetch(`${BASE}/mcp`, { method: "POST", headers: { "content-type": "application/json", ...(access ? { authorization: `Bearer ${access}` } : {}) }, body: JSON.stringify({ jsonrpc: "2.0", id: 1, method: "tools/list" }) });
/** The consent answer is JSON: { to: "<where the browser goes next>" }. */
const toOf = async (res) => (await json(res))?.to ?? "";
const codeFrom = async (res) => new URL((await toOf(res)) || "http://x/").searchParams;

try {
  // ---- discovery
  const noAuth = await mcp(null);
  check("mcp without a token: 401 that points at the sign-in", noAuth.status === 401 && (noAuth.headers.get("www-authenticate") ?? "").includes("resource_metadata="));
  const prm = await json(await fetch(`${BASE}/.well-known/oauth-protected-resource`));
  check("protected resource metadata", prm?.resource === `${BASE}/mcp` && prm?.authorization_servers?.[0] === BASE);
  check("protected resource metadata with a path suffix", (await fetch(`${BASE}/.well-known/oauth-protected-resource/mcp`)).status === 200);
  const asm = await json(await fetch(`${BASE}/.well-known/oauth-authorization-server`));
  check("authorization server metadata", asm?.issuer === BASE && asm?.code_challenge_methods_supported?.includes("S256") && !!asm?.registration_endpoint);

  // ---- registration
  const reg = (body) => fetch(`${BASE}/api/oauth/register`, { method: "POST", headers: { "content-type": "application/json" }, body: JSON.stringify(body) });
  check("register: javascript: address refused", (await reg({ client_name: "x", redirect_uris: ["javascript:alert(1)"] })).status === 400);
  check("register: plain http to another host refused", (await reg({ client_name: "x", redirect_uris: ["http://example.com/cb"] })).status === 400);
  check("register: no addresses refused", (await reg({ client_name: "x" })).status === 400);
  check("register: client secrets refused", (await reg({ client_name: "x", redirect_uris: [REDIRECT], token_endpoint_auth_method: "client_secret_post" })).status === 400);
  const made = await reg({ client_name: "Smoke <b>App</b>", redirect_uris: [REDIRECT] });
  const client = await json(made);
  clientId = client?.client_id ?? null;
  check("register: ok, name stripped of markup", made.status === 201 && !!clientId && client.client_name === "Smoke bApp/b", JSON.stringify(client));

  // ---- consent screen
  const p1 = pkce();
  const page = (q, withCookie = true) => fetch(`${BASE}/oauth/authorize?${form(q)}`, { redirect: "manual", headers: withCookie ? { cookie } : {} });
  const signedOut = await page(authQuery(p1.challenge), false);
  check("consent: signed out goes to login", [302, 303, 307, 308].includes(signedOut.status) && (signedOut.headers.get("location") ?? "").includes("/login"));
  const shown = await page(authQuery(p1.challenge));
  const html = await shown.text();
  check("consent: shows the app and where it returns to", shown.status === 200 && html.includes("Smoke bApp/b") && html.includes("an app on this computer"));
  const wrongRedirect = await page(authQuery(p1.challenge, { redirect_uri: "https://evil.example/cb" }));
  check("consent: unregistered return address is shown as an error, never followed", wrongRedirect.status === 200 && !(wrongRedirect.headers.get("location") ?? "") && (await wrongRedirect.text()).includes("did not register"));
  const noPkce = await page({ client_id: clientId, redirect_uri: REDIRECT, response_type: "code", state: "st-1" });
  check("consent: PKCE is required", (noPkce.headers.get("location") ?? "").includes("error=invalid_request"));

  // ---- answering the consent screen
  check("consent post: no Origin header refused", (await consent(authQuery(p1.challenge), { origin: null })).status === 403);
  check("consent post: another site's Origin refused", (await consent(authQuery(p1.challenge), { origin: "https://evil.example" })).status === 403);
  check("consent post: signed out refused", (await consent(authQuery(p1.challenge), { withCookie: false })).status === 401);
  const denied = await consent(authQuery(p1.challenge), { decision: "deny" });
  check("consent post: Cancel returns access_denied", denied.status === 200 && (await codeFrom(denied)).get("error") === "access_denied");
  const allowed = await consent(authQuery(p1.challenge));
  const to1 = await toOf(allowed);
  const q1 = new URL(to1 || "http://x/").searchParams;
  check("consent post: Allow returns a code and the state", allowed.status === 200 && !!q1.get("code") && q1.get("state") === "st-1" && to1.startsWith(REDIRECT));
  const swapped = await consent(authQuery(p1.challenge, { redirect_uri: "https://evil.example/cb" }));
  check("consent post: unregistered return address gets no code", swapped.status === 400 && !(await toOf(swapped)));

  // ---- token
  const badVerifier = await token({ grant_type: "authorization_code", code: q1.get("code"), redirect_uri: REDIRECT, client_id: clientId, code_verifier: pkce().verifier });
  check("token: wrong PKCE verifier refused", badVerifier.status === 400 && (await json(badVerifier))?.error === "invalid_grant");
  const burned = await token({ grant_type: "authorization_code", code: q1.get("code"), redirect_uri: REDIRECT, client_id: clientId, code_verifier: p1.verifier });
  check("token: a code that was tried once is gone", burned.status === 400);

  const p2 = pkce();
  const code2 = (await codeFrom(await consent(authQuery(p2.challenge)))).get("code");
  const otherClient = await token({ grant_type: "authorization_code", code: code2, redirect_uri: REDIRECT, client_id: "tpc_someone_else", code_verifier: p2.verifier });
  check("token: another app cannot redeem the code", otherClient.status === 400);

  const p3 = pkce();
  const code3 = (await codeFrom(await consent(authQuery(p3.challenge)))).get("code");
  const good = await token({ grant_type: "authorization_code", code: code3, redirect_uri: REDIRECT, client_id: clientId, code_verifier: p3.verifier });
  const t1 = await json(good);
  check("token: ok", good.status === 200 && t1?.token_type === "Bearer" && t1?.access_token?.startsWith("tpo_") && !!t1?.refresh_token && t1?.expires_in > 0);
  check("token: response is not cacheable", good.headers.get("cache-control") === "no-store");
  check("token: code cannot be used twice", (await token({ grant_type: "authorization_code", code: code3, redirect_uri: REDIRECT, client_id: clientId, code_verifier: p3.verifier })).status === 400);

  // ---- using it
  const tools = await json(await mcp(t1.access_token));
  check("mcp with the access token", tools?.result?.tools?.length === 7);
  check("board API with the access token", (await fetch(`${BASE}/api/v1/boards`, { headers: { authorization: `Bearer ${t1.access_token}` } })).status === 200);
  check("refresh token is not an access token", (await mcp(t1.refresh_token)).status === 401);
  check("made-up token refused", (await mcp("tpo_" + randomBytes(30).toString("base64url"))).status === 401);

  // ---- refresh
  const refreshed = await token({ grant_type: "refresh_token", refresh_token: t1.refresh_token, client_id: clientId });
  const t2 = await json(refreshed);
  check("refresh: ok, new pair", refreshed.status === 200 && t2?.access_token !== t1.access_token && t2?.refresh_token !== t1.refresh_token);
  check("refresh: old refresh token is dead", (await token({ grant_type: "refresh_token", refresh_token: t1.refresh_token, client_id: clientId })).status === 400);
  check("refresh: old access token is dead", (await mcp(t1.access_token)).status === 401);
  check("refresh: new access token works", (await mcp(t2.access_token)).status === 200);

  // ---- expiry
  await prisma.oAuthGrant.updateMany({ where: { userId: user.id }, data: { accessExpiresAt: new Date(Date.now() - 1000) } });
  check("expired access token refused", (await mcp(t2.access_token)).status === 401);
  const t3 = await json(await token({ grant_type: "refresh_token", refresh_token: t2.refresh_token, client_id: clientId }));
  check("expired access token can be refreshed", (await mcp(t3?.access_token)).status === 200);

  // ---- disconnecting
  const apps = await json(await fetch(`${BASE}/api/me/apps`, { headers: { cookie } }));
  check("connected apps lists one app", apps?.apps?.length === 1 && apps.apps[0].name === "Smoke bApp/b");
  check("connected apps cannot be read with a token", (await fetch(`${BASE}/api/me/apps`, { headers: { authorization: `Bearer ${t3.access_token}` } })).status === 401);
  check("disconnect", (await fetch(`${BASE}/api/me/apps/${apps.apps[0].id}`, { method: "DELETE", headers: { cookie } })).status === 200);
  check("disconnected app stops working", (await mcp(t3.access_token)).status === 401);
  check("disconnected app cannot refresh", (await token({ grant_type: "refresh_token", refresh_token: t3.refresh_token, client_id: clientId })).status === 400);

  // ---- an app revoking itself
  const p4 = pkce();
  const code4 = (await codeFrom(await consent(authQuery(p4.challenge)))).get("code");
  const t4 = await json(await token({ grant_type: "authorization_code", code: code4, redirect_uri: REDIRECT, client_id: clientId, code_verifier: p4.verifier }));
  await fetch(`${BASE}/api/oauth/revoke`, { method: "POST", headers: { "content-type": "application/x-www-form-urlencoded" }, body: form({ token: t4.refresh_token }) });
  check("revoke endpoint ends the connection", (await mcp(t4.access_token)).status === 401);
} finally {
  await prisma.user.deleteMany({ where: { id: user.id } });
  if (clientId) await prisma.oAuthClient.deleteMany({ where: { id: clientId } });
  await prisma.$disconnect();
}
console.log(failed ? `\n${failed} check(s) failed` : "\nall checks passed");
process.exit(failed ? 1 : 0);
