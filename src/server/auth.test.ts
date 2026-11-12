import { afterEach, describe, expect, it } from "vitest";
import { checkPassword, hashPassword, listedAdmin } from "./auth";

describe("ADMIN_EMAILS", () => {
  afterEach(() => {
    delete process.env.ADMIN_EMAILS;
  });
  it("counts only for a proven email", () => {
    process.env.ADMIN_EMAILS = "boss@example.com, Other@Example.com";
    expect(listedAdmin("boss@example.com", true)).toBe(true);
    expect(listedAdmin(" Other@example.com ", true)).toBe(true);
    expect(listedAdmin("boss@example.com", false)).toBe(false);
    expect(listedAdmin("nobody@example.com", true)).toBe(false);
  });
});

describe("checkPassword", () => {
  it("accepts the right password and refuses a wrong one or a missing hash", async () => {
    const hash = await hashPassword("correct horse");
    expect(await checkPassword("correct horse", hash)).toBe(true);
    expect(await checkPassword("wrong", hash)).toBe(false);
    expect(await checkPassword("anything", null)).toBe(false);
    expect(await checkPassword("anything", undefined)).toBe(false);
  });
});
