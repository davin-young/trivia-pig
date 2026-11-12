import { describe, expect, it } from "vitest";
import { clientIp, hit, resolveClientIp } from "./rateLimit";

describe("resolveClientIp", () => {
  it("behind a trusted proxy prefers Cloudflare's header, then the right-most forwarded hop", () => {
    expect(resolveClientIp({ "cf-connecting-ip": "203.0.113.7", "x-forwarded-for": "1.1.1.1" }, "10.0.0.1", true)).toBe("203.0.113.7");
    expect(resolveClientIp({ "x-forwarded-for": "6.6.6.6, 198.51.100.4" }, "10.0.0.1", true)).toBe("198.51.100.4");
    expect(resolveClientIp({ "x-real-ip": "6.6.6.6" }, "10.0.0.1", true)).toBe("10.0.0.1");
  });
  it("ignores every forwarding header when no proxy is trusted", () => {
    const spoofed = { "cf-connecting-ip": "6.6.6.6", "x-forwarded-for": "6.6.6.6", "x-real-ip": "6.6.6.6" };
    expect(resolveClientIp(spoofed, "192.0.2.9", false)).toBe("192.0.2.9");
    expect(resolveClientIp({}, undefined, false)).toBe("direct");
  });
});

describe("clientIp", () => {
  it("reads only the header the server sets", () => {
    const req = (headers: Record<string, string>) => new Request("http://localhost/api/auth/login", { headers });
    expect(clientIp(req({ "x-client-ip": "192.0.2.9", "x-forwarded-for": "6.6.6.6" }))).toBe("192.0.2.9");
    expect(clientIp(req({ "x-forwarded-for": "6.6.6.6" }))).toBe("direct");
  });
});

describe("hit", () => {
  it("allows the limit per window, then refuses until the window ends", () => {
    const key = `test:${Math.random()}`;
    for (let i = 0; i < 3; i++) expect(hit(key, 3, 1000, 0)).toBe(true);
    expect(hit(key, 3, 1000, 500)).toBe(false);
    expect(hit(key, 3, 1000, 1000)).toBe(true);
  });
});
