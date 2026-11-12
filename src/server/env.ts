import { randomBytes } from "node:crypto";

/** Outside production with no AUTH_SECRET: one random secret per process (kept on globalThis so
 *  the server and the Next bundle share it). Signed cookies stop working after a restart. */
function devSecret(): string {
  const g = globalThis as { __jpDevSecret?: string };
  if (!g.__jpDevSecret) {
    g.__jpDevSecret = randomBytes(32).toString("base64url");
    console.warn("[env] AUTH_SECRET is not set; using a random secret for this run");
  }
  return g.__jpDevSecret;
}

/** Centralised runtime configuration (read lazily so tests can override). */
export const env = {
  get nodeEnv() {
    return process.env.NODE_ENV ?? "development";
  },
  get isProd() {
    return process.env.NODE_ENV === "production";
  },
  get port() {
    return Number(process.env.PORT ?? 3000);
  },
  get appUrl() {
    return (process.env.APP_URL ?? `http://localhost:${process.env.PORT ?? 3000}`).replace(/\/$/, "");
  },
  get secret() {
    const s = process.env.AUTH_SECRET;
    if (!s && process.env.NODE_ENV === "production") throw new Error("AUTH_SECRET must be set in production");
    return s || devSecret();
  },
  get storageDriver(): "local" | "s3" {
    return process.env.STORAGE_DRIVER === "s3" ? "s3" : "local";
  },
  get uploadDir() {
    return process.env.UPLOAD_DIR ?? "./uploads";
  },
  get maxUploadBytes() {
    return Number(process.env.MAX_UPLOAD_MB ?? 10) * 1024 * 1024;
  },
  get allowSignup() {
    return process.env.ALLOW_SIGNUP !== "false";
  },
  get adminEmails(): string[] {
    return (process.env.ADMIN_EMAILS ?? "")
      .split(",")
      .map((s) => s.trim().toLowerCase())
      .filter(Boolean);
  },
  /** Development only: also hand the magic link back to the browser when there is no SMTP. */
  get magicLinkDev() {
    return process.env.NODE_ENV !== "production" && process.env.MAGIC_LINK_DEV === "true";
  },
  get smtpUrl() {
    return process.env.SMTP_URL ?? "";
  },
  get mailFrom() {
    return process.env.MAIL_FROM ?? "Jeppidy <no-reply@localhost>";
  },
  // ---- Keycloak / OIDC (optional) ----
  get oidcIssuer() {
    return (process.env.OIDC_ISSUER ?? "").replace(/\/$/, "");
  },
  get oidcClientId() {
    return process.env.OIDC_CLIENT_ID ?? "";
  },
  get oidcClientSecret() {
    return process.env.OIDC_CLIENT_SECRET ?? "";
  },
  /** Button label on the sign-in page. */
  get oidcLabel() {
    return process.env.OIDC_LABEL ?? "Keycloak";
  },
  /** Users with this realm/client role become super-admins. */
  get oidcAdminRole() {
    return process.env.OIDC_ADMIN_ROLE ?? "trivia-admin";
  },
  /** Admin is only taken away again on SSO sign-in when the role was set on purpose. */
  get oidcAdminRoleSet() {
    return !!process.env.OIDC_ADMIN_ROLE;
  },
  /** If set, only users with this role may sign in as hosts. */
  get oidcRequiredRole() {
    return process.env.OIDC_REQUIRED_ROLE ?? "";
  },
  /** Email/password + magic-link sign-in. Set LOCAL_AUTH=false to make Keycloak the only way in. */
  get localAuth() {
    return process.env.LOCAL_AUTH !== "false";
  },
  /** TRUST_PROXY=true: the app sits behind Cloudflare or a reverse proxy, so client addresses come
   *  from CF-Connecting-IP / X-Forwarded-For. Otherwise those headers are ignored. */
  get trustProxy() {
    return process.env.TRUST_PROXY === "true";
  },
  // ---- AI board drafts (optional) ----
  get anthropicApiKey() {
    return process.env.ANTHROPIC_API_KEY ?? "";
  },
  get aiEnabled() {
    return !!process.env.ANTHROPIC_API_KEY;
  },
  get anthropicModel() {
    return process.env.ANTHROPIC_MODEL || "claude-opus-5-5";
  },
  /** Per-host cap, since each draft is billed to the server owner. */
  get aiDraftsPerHour() {
    return Number(process.env.AI_DRAFTS_PER_HOUR ?? 10);
  },
  get s3() {
    return {
      endpoint: process.env.S3_ENDPOINT || undefined,
      region: process.env.S3_REGION ?? "us-east-1",
      bucket: process.env.S3_BUCKET ?? "jeppidy",
      accessKeyId: process.env.S3_ACCESS_KEY_ID ?? "",
      secretAccessKey: process.env.S3_SECRET_ACCESS_KEY ?? "",
      forcePathStyle: process.env.S3_FORCE_PATH_STYLE !== "false",
    };
  },
};
