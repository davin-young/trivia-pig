import { PrismaPg } from "@prisma/adapter-pg";

/**
 * What Prisma needs to reach Postgres. Since Prisma 7 the client talks to the database through
 * the "pg" driver, which does not understand the two Prisma-only settings people put on
 * DATABASE_URL, so they are read here: `schema` (default "public") and `connection_limit`
 * (the size of the connection pool).
 */
export function dbSettings(url: string | undefined): { connectionString: string; max?: number; schema?: string } {
  if (!url) throw new Error("DATABASE_URL is not set");
  let parsed: URL;
  try {
    parsed = new URL(url);
  } catch {
    return { connectionString: url };
  }
  const schema = parsed.searchParams.get("schema") ?? undefined;
  const limit = Number(parsed.searchParams.get("connection_limit"));
  parsed.searchParams.delete("schema");
  parsed.searchParams.delete("connection_limit");
  return {
    connectionString: parsed.toString(),
    ...(Number.isInteger(limit) && limit > 0 ? { max: limit } : {}),
    ...(schema && schema !== "public" ? { schema } : {}),
  };
}

export function dbAdapter(url = process.env.DATABASE_URL): PrismaPg {
  if (!url) {
    try {
      process.loadEnvFile(); // local runs outside Next (seed, scripts, the built server)
    } catch {
      // no .env file
    }
    url = process.env.DATABASE_URL;
  }
  const { schema, ...pool } = dbSettings(url);
  return new PrismaPg(pool, schema ? { schema } : undefined);
}
