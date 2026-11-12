import { createHmac } from "node:crypto";
import * as client from "openid-client";
import type { User } from "@prisma/client";
import { prisma } from "./db";
import { createUser, normaliseEmail } from "./auth";
import { env } from "./env";
import { safeEqual } from "./crypto";

/**
 * Keycloak (or any OIDC provider) sign-in for hosts: authorization code + PKCE.
 * After the callback we issue the app's normal session cookie, so sockets,
 * pairing and everything else work the same as with local accounts.
 */

export const OIDC_COOKIE = "jp_oidc";

export function oidcEnabled(): boolean {
  return !!(env.oidcIssuer && env.oidcClientId);
}

let configPromise: Promise<client.Configuration> | null = null;
export function oidcConfig(): Promise<client.Configuration> {
  if (!configPromise) {
    const issuer = new URL(env.oidcIssuer);
    configPromise = client
      .discovery(
        issuer,
        env.oidcClientId,
        env.oidcClientSecret || undefined,
        env.oidcClientSecret ? undefined : client.None(),
        issuer.protocol === "http:" ? { execute: [client.allowInsecureRequests] } : undefined,
      )
      .catch((e) => {
        configPromise = null; // retry next time (e.g. Keycloak was still booting)
        throw e;
      });
  }
  return configPromise;
}

export function callbackUrl(): string {
  return `${env.appUrl}/api/auth/oidc/callback`;
}

// --- tiny signed cookie for state/nonce/PKCE verifier -----------------------

interface Pending {
  state: string;
  nonce: string;
  verifier: string;
  next: string;
  exp: number;
}

function sign(data: string): string {
  return createHmac("sha256", env.secret).update(data).digest("base64url");
}

export function packPending(p: Pending): string {
  const data = Buffer.from(JSON.stringify(p)).toString("base64url");
  return `${data}.${sign(data)}`;
}

export function unpackPending(cookie: string | undefined): Pending | null {
  if (!cookie) return null;
  const [data, mac] = cookie.split(".");
  if (!data || !mac || !safeEqual(mac, sign(data))) return null;
  try {
    const p = JSON.parse(Buffer.from(data, "base64url").toString()) as Pending;
    return p.exp > Date.now() ? p : null;
  } catch {
    return null;
  }
}

export async function startLogin(next: string): Promise<{ url: URL; cookie: string }> {
  const config = await oidcConfig();
  const verifier = client.randomPKCECodeVerifier();
  const state = client.randomState();
  const nonce = client.randomNonce();
  const url = client.buildAuthorizationUrl(config, {
    redirect_uri: callbackUrl(),
    scope: "openid email profile",
    code_challenge: await client.calculatePKCECodeChallenge(verifier),
    code_challenge_method: "S256",
    state,
    nonce,
  });
  return { url, cookie: packPending({ state, nonce, verifier, next, exp: Date.now() + 10 * 60_000 }) };
}

/** Collect realm + client roles from Keycloak-shaped claims. */
export function rolesFromClaims(claims: Record<string, unknown>, clientId: string): string[] {
  const roles = new Set<string>();
  const realm = claims.realm_access as { roles?: unknown } | undefined;
  if (Array.isArray(realm?.roles)) realm.roles.forEach((r) => typeof r === "string" && roles.add(r));
  const resource = claims.resource_access as Record<string, { roles?: unknown }> | undefined;
  const mine = resource?.[clientId]?.roles;
  if (Array.isArray(mine)) mine.forEach((r) => typeof r === "string" && roles.add(r));
  if (Array.isArray(claims.roles)) (claims.roles as unknown[]).forEach((r) => typeof r === "string" && roles.add(r));
  if (Array.isArray(claims.groups)) (claims.groups as unknown[]).forEach((g) => typeof g === "string" && roles.add(g.replace(/^\//, "")));
  return [...roles];
}

function decodeJwtPayload(jwt: string | undefined): Record<string, unknown> {
  if (!jwt) return {};
  try {
    return JSON.parse(Buffer.from(jwt.split(".")[1] ?? "", "base64url").toString());
  } catch {
    return {};
  }
}

export async function finishLogin(currentUrl: URL, pending: Pending): Promise<{ user: User; next: string }> {
  const config = await oidcConfig();
  const tokens = await client.authorizationCodeGrant(config, currentUrl, {
    pkceCodeVerifier: pending.verifier,
    expectedState: pending.state,
    expectedNonce: pending.nonce,
  });
  const claims = (tokens.claims() ?? {}) as Record<string, unknown>;
  const sub = String(claims.sub ?? "");
  if (!sub) throw new Error("No subject in ID token");
  const email = typeof claims.email === "string" ? normaliseEmail(claims.email) : "";
  const name = String(claims.name ?? claims.preferred_username ?? "");
  // Keycloak puts roles in the access token by default; merge both.
  const roles = rolesFromClaims({ ...decodeJwtPayload(tokens.access_token), ...claims }, env.oidcClientId);

  if (env.oidcRequiredRole && !roles.includes(env.oidcRequiredRole)) {
    throw new OidcDenied(`Your account needs the "${env.oidcRequiredRole}" role to host games.`);
  }
  const roleAdmin = !!env.oidcAdminRole && roles.includes(env.oidcAdminRole);

  // An email only counts when the identity provider says it checked it. An unverified one
  // (open registration without email verification) must never link to someone's existing
  // account or be granted admin through ADMIN_EMAILS.
  const verified = emailIsVerified(claims);
  const makeAdmin = roleAdmin || (verified && !!email && env.adminEmails.includes(email));

  let user = await prisma.user.findUnique({ where: { oidcSub: sub } });
  if (!user && email) {
    const existing = await prisma.user.findUnique({ where: { email } });
    if (existing && !verified) {
      throw new OidcDenied("That email already has an account here. Verify your email with the sign-in service first, then try again.");
    }
    if (existing) user = await prisma.user.update({ where: { id: existing.id }, data: { oidcSub: sub } });
  }
  if (!user) {
    user = await createUser(email || `${sub}@oidc.local`, null, name, verified);
    user = await prisma.user.update({ where: { id: user.id }, data: { oidcSub: sub } });
  }
  if ((makeAdmin && !user.isAdmin) || (name && !user.name)) {
    user = await prisma.user.update({ where: { id: user.id }, data: { isAdmin: user.isAdmin || makeAdmin, name: user.name || name } });
  }
  return { user, next: pending.next };
}

/** Only an explicit `email_verified: true` counts; a missing claim is not proof. */
export function emailIsVerified(claims: Record<string, unknown>): boolean {
  return claims.email_verified === true;
}

export class OidcDenied extends Error {}

export async function endSessionUrl(): Promise<string | null> {
  if (!oidcEnabled()) return null;
  try {
    const config = await oidcConfig();
    if (!config.serverMetadata().end_session_endpoint) return null;
    return client.buildEndSessionUrl(config, { client_id: env.oidcClientId, post_logout_redirect_uri: `${env.appUrl}/login` }).href;
  } catch {
    return null;
  }
}
