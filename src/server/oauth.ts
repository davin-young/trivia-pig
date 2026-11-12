import "server-only";
import { createHash } from "node:crypto";
import { prisma } from "./db";
import { randomToken, safeEqual, sha256 } from "./crypto";
import { env } from "./env";

/**
 * A small OAuth 2.1 authorization server, so an AI app can be connected to the MCP server
 * with a sign-in click instead of a pasted token.
 *
 * What it supports, and nothing more:
 *  - public clients only (no client secrets), registered by the app itself (RFC 7591)
 *  - the authorization code grant with PKCE S256, which is required
 *  - refresh tokens, replaced on every use
 *  - one permission: the signed-in person's own boards, exactly what a personal token reaches
 *
 * Only SHA-256 hashes of codes and tokens are stored.
 */

/**
 * Prefix of the access tokens handed to connected apps. The tokens are 240 random bits, so a
 * plain SHA-256 is the right way to store them (slow password hashing is for guessable secrets).
 */
export const APP_TOKEN_PREFIX = "tpo_";
const REFRESH_PREFIX = "tpr_";
const CODE_TTL_MS = 5 * 60_000;
const ACCESS_TTL_MS = 60 * 60_000;
const REFRESH_TTL_MS = 60 * 24 * 60 * 60_000;
/** Apps one person can have connected at once. */
export const MAX_GRANTS = 20;
/** Registered apps kept in total; the oldest unused ones make room for new ones. */
const MAX_CLIENTS = 2000;

export function oauthOrigin(): string {
  return env.appUrl.replace(/\/+$/, "");
}
export function mcpResource(): string {
  return `${oauthOrigin()}/mcp`;
}

export function authServerMetadata() {
  const o = oauthOrigin();
  return {
    issuer: o,
    authorization_endpoint: `${o}/oauth/authorize`,
    token_endpoint: `${o}/api/oauth/token`,
    registration_endpoint: `${o}/api/oauth/register`,
    revocation_endpoint: `${o}/api/oauth/revoke`,
    response_types_supported: ["code"],
    grant_types_supported: ["authorization_code", "refresh_token"],
    code_challenge_methods_supported: ["S256"],
    token_endpoint_auth_methods_supported: ["none"],
    scopes_supported: ["boards"],
  };
}

export function protectedResourceMetadata() {
  return {
    resource: mcpResource(),
    authorization_servers: [oauthOrigin()],
    bearer_methods_supported: ["header"],
    scopes_supported: ["boards"],
    resource_name: "Trivia Pig boards",
  };
}

/** The header a 401 from the MCP server carries, so a client can find the sign-in. */
export function wwwAuthenticate(error?: string): string {
  const parts = [`Bearer realm="Trivia Pig"`, `resource_metadata="${oauthOrigin()}/.well-known/oauth-protected-resource"`];
  if (error) parts.push(`error="${error}"`);
  return parts.join(", ");
}

/** Open to any site: these endpoints carry no cookies, so there is nothing for another origin to borrow. */
export const OAUTH_CORS = {
  "access-control-allow-origin": "*",
  "access-control-allow-methods": "GET, POST, OPTIONS",
  "access-control-allow-headers": "content-type, authorization, mcp-protocol-version",
  "access-control-max-age": "86400",
};

export function oauthJson(data: unknown, status = 200): Response {
  return new Response(JSON.stringify(data), { status, headers: { "content-type": "application/json", "cache-control": "no-store", ...OAUTH_CORS } });
}
export function oauthError(error: string, description: string, status = 400): Response {
  return oauthJson({ error, error_description: description }, status);
}

// ------------------------------------------------------------------ clients

const BAD_SCHEMES = new Set(["javascript", "data", "vbscript", "file", "blob", "about"]);

/**
 * Where an app may ask to be sent back to: an https address, a loopback http address
 * (apps on the person's own computer), or an app's own private scheme such as cursor://.
 */
export function validRedirectUri(uri: string): boolean {
  if (typeof uri !== "string" || uri.length > 500 || /[\s<>"\\]/.test(uri) || uri.includes("#")) return false;
  let u: URL;
  try {
    u = new URL(uri);
  } catch {
    return false;
  }
  const scheme = u.protocol.slice(0, -1).toLowerCase();
  if (BAD_SCHEMES.has(scheme)) return false;
  if (u.username || u.password) return false;
  if (scheme === "https") return !!u.hostname;
  if (scheme === "http") return u.hostname === "localhost" || u.hostname === "127.0.0.1" || u.hostname === "[::1]";
  // A private-use scheme: must look like one (RFC 8252 suggests a dotted, reversed domain; many apps use a plain word).
  return /^[a-z][a-z0-9+.-]{1,40}$/.test(scheme);
}

/** A short, human label for where the person will be sent back to. */
export function redirectLabel(uri: string): string {
  try {
    const u = new URL(uri);
    if (u.protocol === "https:") return u.hostname;
    if (u.protocol === "http:") return "an app on this computer";
    return `the ${u.protocol.slice(0, -1)} app on this device`;
  } catch {
    return "an unknown place";
  }
}

export async function registerClient(input: unknown): Promise<{ client_id: string; client_name: string; redirect_uris: string[] } | { error: string; description: string }> {
  const body = (input ?? {}) as { redirect_uris?: unknown; client_name?: unknown; token_endpoint_auth_method?: unknown };
  const uris = Array.isArray(body.redirect_uris) ? body.redirect_uris : null;
  if (!uris || uris.length < 1 || uris.length > 8 || !uris.every((u) => typeof u === "string" && validRedirectUri(u))) {
    return { error: "invalid_redirect_uri", description: "redirect_uris must be 1 to 8 https, loopback http or app-scheme addresses." };
  }
  if (body.token_endpoint_auth_method !== undefined && body.token_endpoint_auth_method !== "none") {
    return { error: "invalid_client_metadata", description: "Only public clients are supported (token_endpoint_auth_method: none)." };
  }
  const rawName = typeof body.client_name === "string" ? body.client_name : "";
  // Shown on the consent screen: plain printable text only.
  const name = rawName.replace(/[\u0000-\u001f\u007f<>]/g, "").trim().slice(0, 80) || "An app";

  const total = await prisma.oAuthClient.count();
  if (total >= MAX_CLIENTS) {
    const stale = await prisma.oAuthClient.findMany({ where: { grants: { none: {} } }, orderBy: { createdAt: "asc" }, take: 50, select: { id: true } });
    if (!stale.length) return { error: "temporarily_unavailable", description: "Too many registered apps. Try again later." };
    await prisma.oAuthClient.deleteMany({ where: { id: { in: stale.map((s) => s.id) } } });
  }
  const client = await prisma.oAuthClient.create({ data: { id: `tpc_${randomToken(18)}`, name, redirectUris: uris as string[] } });
  return { client_id: client.id, client_name: client.name, redirect_uris: client.redirectUris };
}

// ------------------------------------------------------------ authorization

export interface AuthorizeRequest {
  clientId: string;
  redirectUri: string;
  codeChallenge: string;
  state: string | null;
}

export type AuthorizeCheck =
  | { ok: true; request: AuthorizeRequest; clientName: string }
  /** Nothing can be trusted yet: show the problem, never redirect. */
  | { ok: false; show: string }
  /** The app and its return address are known, so the error goes back to the app. */
  | { ok: false; redirect: string };

export function redirectWith(uri: string, params: Record<string, string | null>): string {
  const u = new URL(uri);
  for (const [k, v] of Object.entries(params)) if (v !== null) u.searchParams.set(k, v);
  return u.toString();
}

/** Check an authorization request. Used when showing the consent screen and again when it is answered. */
export async function checkAuthorize(q: Record<string, string | undefined>): Promise<AuthorizeCheck> {
  const clientId = q.client_id ?? "";
  const redirectUri = q.redirect_uri ?? "";
  if (!clientId || clientId.length > 100) return { ok: false, show: "This sign-in link is missing the app's id." };
  const client = await prisma.oAuthClient.findUnique({ where: { id: clientId } });
  if (!client) return { ok: false, show: "This app is not registered here. Remove it in your AI app and connect again." };
  if (!redirectUri || !client.redirectUris.includes(redirectUri)) return { ok: false, show: "This app asked to be sent somewhere it did not register. Nothing was shared." };

  const state = q.state && q.state.length <= 500 ? q.state : null;
  const fail = (error: string, description: string): AuthorizeCheck => ({ ok: false, redirect: redirectWith(redirectUri, { error, error_description: description, state }) });
  if (q.response_type !== "code") return fail("unsupported_response_type", "Only response_type=code is supported.");
  const challenge = q.code_challenge ?? "";
  if (!/^[A-Za-z0-9_-]{43,128}$/.test(challenge) || (q.code_challenge_method ?? "") !== "S256") return fail("invalid_request", "PKCE with code_challenge_method=S256 is required.");
  if (q.resource) {
    const r = q.resource.replace(/\/+$/, "");
    if (r !== mcpResource() && r !== oauthOrigin()) return fail("invalid_target", "Unknown resource.");
  }
  return { ok: true, request: { clientId, redirectUri, codeChallenge: challenge, state }, clientName: client.name };
}

/** The person said yes: make a one-time code and return where to send them. */
export async function approve(userId: string, r: AuthorizeRequest): Promise<string> {
  const code = randomToken(32);
  await prisma.oAuthCode.deleteMany({ where: { expiresAt: { lt: new Date() } } });
  await prisma.oAuthCode.create({
    data: { codeHash: sha256(code), clientId: r.clientId, userId, redirectUri: r.redirectUri, codeChallenge: r.codeChallenge, expiresAt: new Date(Date.now() + CODE_TTL_MS) },
  });
  return redirectWith(r.redirectUri, { code, state: r.state });
}

export function deny(r: AuthorizeRequest): string {
  return redirectWith(r.redirectUri, { error: "access_denied", error_description: "The person declined.", state: r.state });
}

// ------------------------------------------------------------------- tokens

function pkceMatches(verifier: string, challenge: string): boolean {
  if (!/^[A-Za-z0-9._~-]{43,128}$/.test(verifier)) return false;
  return safeEqual(createHash("sha256").update(verifier).digest("base64url"), challenge);
}

function tokenResponse(access: string, refresh: string) {
  return { access_token: access, token_type: "Bearer", expires_in: Math.floor(ACCESS_TTL_MS / 1000), refresh_token: refresh, scope: "boards" };
}

function freshPair() {
  const access = APP_TOKEN_PREFIX + randomToken(30);
  const refresh = REFRESH_PREFIX + randomToken(36);
  return {
    access,
    refresh,
    data: { accessHash: sha256(access), accessExpiresAt: new Date(Date.now() + ACCESS_TTL_MS), refreshHash: sha256(refresh), refreshExpiresAt: new Date(Date.now() + REFRESH_TTL_MS) },
  };
}

export async function exchange(form: Record<string, string | undefined>): Promise<Response> {
  const grantType = form.grant_type;
  const clientId = form.client_id ?? "";

  if (grantType === "authorization_code") {
    const code = form.code ?? "";
    if (!code || code.length > 200) return oauthError("invalid_grant", "Missing code.");
    const row = await prisma.oAuthCode.findUnique({ where: { codeHash: sha256(code) } });
    // Burn the code on any attempt: it is single use, right or wrong.
    if (row) await prisma.oAuthCode.deleteMany({ where: { id: row.id } });
    if (!row || row.expiresAt.getTime() < Date.now()) return oauthError("invalid_grant", "That code is not valid any more. Start the sign-in again.");
    if (row.clientId !== clientId || row.redirectUri !== (form.redirect_uri ?? "")) return oauthError("invalid_grant", "The code was issued to a different app or return address.");
    if (!pkceMatches(form.code_verifier ?? "", row.codeChallenge)) return oauthError("invalid_grant", "The code_verifier does not match.");

    // One connection per app and person: signing in again replaces the old one.
    await prisma.oAuthGrant.deleteMany({ where: { userId: row.userId, clientId: row.clientId } });
    const count = await prisma.oAuthGrant.count({ where: { userId: row.userId } });
    if (count >= MAX_GRANTS) {
      const oldest = await prisma.oAuthGrant.findFirst({ where: { userId: row.userId }, orderBy: { createdAt: "asc" }, select: { id: true } });
      if (oldest) await prisma.oAuthGrant.delete({ where: { id: oldest.id } });
    }
    const pair = freshPair();
    await prisma.oAuthGrant.create({ data: { userId: row.userId, clientId: row.clientId, ...pair.data } });
    return oauthJson(tokenResponse(pair.access, pair.refresh));
  }

  if (grantType === "refresh_token") {
    const refresh = form.refresh_token ?? "";
    if (!refresh.startsWith(REFRESH_PREFIX) || refresh.length > 200) return oauthError("invalid_grant", "Unknown refresh token.");
    const grant = await prisma.oAuthGrant.findUnique({ where: { refreshHash: sha256(refresh) } });
    if (!grant || grant.refreshExpiresAt.getTime() < Date.now() || (clientId && grant.clientId !== clientId)) {
      return oauthError("invalid_grant", "That connection has ended. Sign in again.");
    }
    const pair = freshPair();
    // Only succeeds if the old refresh token is still the current one, so it cannot be used twice.
    const res = await prisma.oAuthGrant.updateMany({ where: { id: grant.id, refreshHash: grant.refreshHash }, data: pair.data });
    if (!res.count) return oauthError("invalid_grant", "That refresh token was already used.");
    return oauthJson(tokenResponse(pair.access, pair.refresh));
  }

  return oauthError("unsupported_grant_type", "Use authorization_code or refresh_token.");
}

/** RFC 7009: always answers 200, whether or not the token existed. */
export async function revoke(token: string): Promise<void> {
  if (!token || token.length > 200) return;
  const hash = sha256(token);
  await prisma.oAuthGrant.deleteMany({ where: { OR: [{ accessHash: hash }, { refreshHash: hash }] } });
}

/** Who an OAuth access token belongs to (null when unknown or expired). */
export async function userForAccessToken(token: string) {
  const grant = await prisma.oAuthGrant.findUnique({ where: { accessHash: sha256(token) }, include: { user: true } });
  if (!grant || grant.accessExpiresAt.getTime() < Date.now()) return null;
  if (!grant.lastUsedAt || Date.now() - grant.lastUsedAt.getTime() > 60_000) {
    void prisma.oAuthGrant.update({ where: { id: grant.id }, data: { lastUsedAt: new Date() } }).catch(() => {});
  }
  return { user: grant.user, grantId: grant.id };
}

/** Read a token or registration request body: form encoded (the standard) or JSON. */
export async function readForm(req: Request): Promise<Record<string, string | undefined>> {
  const type = req.headers.get("content-type") ?? "";
  const text = (await req.text()).slice(0, 20_000);
  if (type.includes("application/json")) {
    try {
      const o = JSON.parse(text) as Record<string, unknown>;
      return Object.fromEntries(Object.entries(o).filter(([, v]) => typeof v === "string")) as Record<string, string>;
    } catch {
      return {};
    }
  }
  return Object.fromEntries(new URLSearchParams(text));
}
