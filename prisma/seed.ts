/**
 * Seeds a demo host account and the "Kava & Kratom" board.
 *   npm run db:seed
 * Login: demo@example.com / demo1234 in development. In production (the Docker image) the
 * password is SEED_PASSWORD, or a random one printed once in the log line below.
 */
import { randomBytes } from "node:crypto";
import { PrismaClient, type Prisma } from "@prisma/client";
import bcrypt from "bcryptjs";
import { demoBoard, DEMO_TITLE } from "../src/shared/demoBoard";
import { dbAdapter } from "../src/server/dbAdapter";

const prisma = new PrismaClient({ adapter: dbAdapter() });

async function main() {
  const email = process.env.SEED_EMAIL ?? "demo@example.com";
  const chosen = process.env.SEED_PASSWORD;
  const password = chosen || (process.env.NODE_ENV === "production" ? randomBytes(12).toString("base64url") : "demo1234");
  const existing = await prisma.user.findUnique({ where: { email } });
  const user =
    existing ??
    (await prisma.user.create({
      data: { email, name: "Demo Host", passwordHash: await bcrypt.hash(password, 11), isAdmin: (await prisma.user.count()) === 0 },
    }));
  const hasBoard = await prisma.board.findFirst({ where: { ownerId: user.id, title: DEMO_TITLE } });
  if (!hasBoard) {
    await prisma.board.create({
      data: { ownerId: user.id, title: DEMO_TITLE, description: "Demo board: one category per round.", tags: ["demo"], content: demoBoard() as unknown as Prisma.InputJsonValue },
    });
  }
  console.log(`Seeded ${email}${existing ? " (existing)" : chosen ? " (password from SEED_PASSWORD)" : ` / ${password}`} with "${DEMO_TITLE}"`);
}

main()
  .catch((e) => {
    console.error(e);
    process.exit(1);
  })
  .finally(() => prisma.$disconnect());
