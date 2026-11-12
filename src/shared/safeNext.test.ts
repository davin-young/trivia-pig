import { describe, expect, it } from "vitest";
import { safeNext } from "./safeNext";

describe("safeNext", () => {
  it("keeps paths on this site", () => {
    for (const ok of ["/", "/dashboard", "/boards/abc?tab=1#x", "/play/ABCDE", "/a//b", "/a\\b"]) expect(safeNext(ok)).toBe(ok);
  });
  it("falls back for anything that could leave the site", () => {
    const bad = [
      "",
      null,
      undefined,
      "dashboard",
      "https://evil.example",
      "//evil.example",
      "/\\evil.example",
      "\\\\evil.example",
      "/\t/evil.example",
      "/\n/evil.example",
      "/\r\\evil.example",
      "/a\u0000b",
      "/a\u007fb",
      "javascript:alert(1)",
    ];
    for (const b of bad) expect(safeNext(b)).toBe("/dashboard");
    expect(safeNext("//evil.example", "/home")).toBe("/home");
  });
});
