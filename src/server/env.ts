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
    return s ?? "dev-insecure-secret-change-me";
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
  get smtpUrl() {
    return process.env.SMTP_URL ?? "";
  },
  get mailFrom() {
    return process.env.MAIL_FROM ?? "Jeppidy <no-reply@localhost>";
  },
  /** Behind Cloudflare / a reverse proxy we trust X-Forwarded-* headers. */
  get trustProxy() {
    return process.env.TRUST_PROXY !== "false";
  },
};
