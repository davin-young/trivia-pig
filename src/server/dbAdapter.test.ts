import { describe, expect, it } from "vitest";
import { dbSettings } from "./dbAdapter";

describe("dbSettings", () => {
  it("moves Prisma-only settings off the address", () => {
    const s = dbSettings("postgresql://u:p%40ss@db:5432/trivia?schema=public&connection_limit=10");
    expect(s.connectionString).toBe("postgresql://u:p%40ss@db:5432/trivia");
    expect(s.max).toBe(10);
    expect(s.schema).toBeUndefined();
  });

  it("keeps a non-default schema and other settings", () => {
    const s = dbSettings("postgresql://u:p@db/trivia?schema=game&sslmode=require");
    expect(s.schema).toBe("game");
    expect(s.connectionString).toBe("postgresql://u:p@db/trivia?sslmode=require");
    expect(s.max).toBeUndefined();
  });

  it("ignores a bad pool size and refuses a missing address", () => {
    expect(dbSettings("postgresql://u:p@db/trivia?connection_limit=abc").max).toBeUndefined();
    expect(() => dbSettings(undefined)).toThrow(/DATABASE_URL/);
  });
});
