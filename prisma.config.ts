// Prisma CLI configuration (migrate, generate, studio). Since Prisma 7 the database address
// lives here and not in schema.prisma, and the CLI no longer reads .env by itself.
import { defineConfig } from "prisma/config";

if (!process.env.DATABASE_URL) {
  try {
    process.loadEnvFile();
  } catch {
    // No .env file: fine for "prisma generate", which needs no database.
  }
}

export default defineConfig({
  schema: "prisma/schema.prisma",
  migrations: { path: "prisma/migrations", seed: "tsx prisma/seed.ts" },
  datasource: { url: process.env.DATABASE_URL ?? "" },
});
