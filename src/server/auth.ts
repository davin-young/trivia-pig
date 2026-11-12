import bcrypt from "bcryptjs";
import nodemailer from "nodemailer";
import type { Prisma, User } from "@prisma/client";
import { demoBoard, DEMO_TITLE } from "@/shared/demoBoard";
import { prisma } from "./db";
import { randomToken, sha256 } from "./crypto";
import { env } from "./env";

export const SESSION_COOKIE = "jp_session";
export const SESSION_DAYS = 30;

export async function hashPassword(pw: string): Promise<string> {
  return bcrypt.hash(pw, 11);
}
export async function verifyPassword(pw: string, hash: string): Promise<boolean> {
  return bcrypt.compare(pw, hash);
}

let dummyHash: Promise<string> | null = null;
/** Like verifyPassword, but an account without a password costs the same bcrypt work, so the
 *  response time does not show whether the email exists. */
export async function checkPassword(pw: string, hash: string | null | undefined): Promise<boolean> {
  if (hash) return verifyPassword(pw, hash);
  await verifyPassword(pw, await (dummyHash ??= hashPassword(randomToken())));
  return false;
}

export async function createSession(userId: string): Promise<{ token: string; expiresAt: Date }> {
  const token = randomToken();
  const expiresAt = new Date(Date.now() + SESSION_DAYS * 86400_000);
  await prisma.session.create({ data: { tokenHash: sha256(token), userId, expiresAt } });
  return { token, expiresAt };
}

export async function userFromSessionToken(token: string | undefined | null): Promise<User | null> {
  if (!token || token.length > 200) return null;
  const session = await prisma.session.findUnique({ where: { tokenHash: sha256(token) }, include: { user: true } });
  if (!session || session.expiresAt < new Date()) return null;
  return session.user;
}

export async function destroySession(token: string | undefined | null) {
  if (!token) return;
  await prisma.session.deleteMany({ where: { tokenHash: sha256(token) } });
}

export function normaliseEmail(email: string): string {
  return email.trim().toLowerCase();
}

/** ADMIN_EMAILS only counts for an address its owner has proven (magic link, or verified by SSO). */
export function listedAdmin(email: string, emailVerified: boolean): boolean {
  return emailVerified && env.adminEmails.includes(normaliseEmail(email));
}

/**
 * The first account on a fresh install is a super-admin, and so is anyone in ADMIN_EMAILS whose
 * email is proven. Password sign-up proves nothing, so it leaves emailVerified false.
 */
export async function createUser(email: string, password: string | null, name = "", emailVerified = false): Promise<User> {
  const e = normaliseEmail(email);
  const passwordHash = password ? await hashPassword(password) : null;
  const user = await prisma.$transaction(async (tx) => {
    // One sign-up at a time, so two racing first sign-ups cannot both count zero users.
    await tx.$executeRaw`SELECT pg_advisory_xact_lock(7411001)`;
    const isAdmin = listedAdmin(e, emailVerified) || (await tx.user.count()) === 0;
    return tx.user.create({ data: { email: e, name: name || e.split("@")[0], passwordHash, isAdmin } });
  });
  // Every new host starts with the demo board so there's something to play right away.
  await prisma.board.create({
    data: { ownerId: user.id, title: DEMO_TITLE, description: "Demo board: one category per round.", tags: ["demo"], content: demoBoard() as unknown as Prisma.InputJsonValue },
  });
  return user;
}

export async function createMagicLink(email: string): Promise<string> {
  const token = randomToken();
  await prisma.magicLink.create({
    data: { tokenHash: sha256(token), email: normaliseEmail(email), expiresAt: new Date(Date.now() + 15 * 60_000) },
  });
  return `${env.appUrl}/api/auth/magic?token=${encodeURIComponent(token)}`;
}

/** Returns the user for a valid, unused magic link (creating the account if signups are allowed). */
export async function consumeMagicLink(token: string): Promise<User | null> {
  const link = await prisma.magicLink.findUnique({ where: { tokenHash: sha256(token) } });
  if (!link || link.usedAt || link.expiresAt < new Date()) return null;
  const claimed = await prisma.magicLink.updateMany({ where: { id: link.id, usedAt: null }, data: { usedAt: new Date() } });
  if (claimed.count !== 1) return null;
  const existing = await prisma.user.findUnique({ where: { email: link.email } });
  if (existing) return existing;
  if (!env.allowSignup) return null;
  return createUser(link.email, null, "", true);
}

export async function sendMail(to: string, subject: string, text: string): Promise<boolean> {
  if (!env.smtpUrl) {
    console.log(`\n[mail] SMTP_URL not set — would send to ${to}:\n  ${subject}\n  ${text}\n`);
    return false;
  }
  const transport = nodemailer.createTransport(env.smtpUrl);
  await transport.sendMail({ from: env.mailFrom, to, subject, text });
  return true;
}
