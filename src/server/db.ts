import { PrismaClient } from "@prisma/client";

const g = globalThis as unknown as { __prisma?: PrismaClient };

/** One Prisma client per process, shared by server.ts and Next route handlers. */
export const prisma: PrismaClient = g.__prisma ?? (g.__prisma = new PrismaClient());
