import { describe, expect, it } from "vitest";
import { adminAfterLogin, emailIsVerified, packPending, rolesFromClaims, unpackPending } from "./oidc";

describe("keycloak role mapping", () => {
  it("merges realm roles, client roles, and groups", () => {
    const roles = rolesFromClaims(
      {
        realm_access: { roles: ["offline_access", "trivia-admin"] },
        resource_access: { "trivia-pig": { roles: ["host"] }, other: { roles: ["nope"] } },
        groups: ["/hosts"],
      },
      "trivia-pig",
    );
    expect(roles).toEqual(expect.arrayContaining(["trivia-admin", "host", "hosts"]));
    expect(roles).not.toContain("nope");
  });
  it("tolerates missing claims", () => {
    expect(rolesFromClaims({}, "x")).toEqual([]);
  });
});

describe("login state cookie", () => {
  it("round-trips and rejects tampering or expiry", () => {
    const p = { state: "s", nonce: "n", verifier: "v", next: "/dashboard", exp: Date.now() + 60_000 };
    const packed = packPending(p);
    expect(unpackPending(packed)).toEqual(p);
    const [data, mac] = packed.split(".");
    const forged = Buffer.from(JSON.stringify({ ...p, next: "//evil.example" })).toString("base64url");
    expect(unpackPending(`${forged}.${mac}`)).toBeNull();
    // Change the first character to one it is not (a fixed "x" left the cookie untouched one time in 64).
    expect(unpackPending(`${data}.${mac[0] === "x" ? "y" : "x"}${mac.slice(1)}`)).toBeNull();
    expect(unpackPending(packPending({ ...p, exp: Date.now() - 1 }))).toBeNull();
    expect(unpackPending(undefined)).toBeNull();
  });
});

describe("account rules on SSO sign-in", () => {
  it("treats an email as verified only when the provider says so", () => {
    expect(emailIsVerified({ email: "a@b.c", email_verified: true })).toBe(true);
    expect(emailIsVerified({ email: "a@b.c" })).toBe(false);
    expect(emailIsVerified({ email: "a@b.c", email_verified: false })).toBe(false);
    expect(emailIsVerified({ email: "a@b.c", email_verified: "true" })).toBe(false);
    expect(emailIsVerified({ email_verified: true })).toBe(false);
  });
  it("syncs admin up, and down only when the admin role was set on purpose", () => {
    const base = { isAdmin: false, hasRole: false, listed: false, roleSet: true };
    expect(adminAfterLogin({ ...base, hasRole: true })).toBe(true);
    expect(adminAfterLogin({ ...base, listed: true })).toBe(true);
    expect(adminAfterLogin({ ...base, isAdmin: true })).toBe(false);
    expect(adminAfterLogin({ ...base, isAdmin: true, listed: true })).toBe(true);
    expect(adminAfterLogin({ ...base, isAdmin: true, roleSet: false })).toBe(true);
    expect(adminAfterLogin({ ...base, roleSet: false })).toBe(false);
  });
});
