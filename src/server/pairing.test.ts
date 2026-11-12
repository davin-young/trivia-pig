import { describe, expect, it } from "vitest";
import { MemoryPairingStore, PAIRING_TTL_MS, PairingService, capGrantRole } from "./pairing";

function setup() {
  let now = 1_700_000_000_000;
  const store = new MemoryPairingStore();
  const svc = new PairingService(store, () => now);
  return { svc, store, advance: (ms: number) => (now += ms) };
}

describe("pairing tokens", () => {
  it("redeems once for a game-scoped grant", async () => {
    const { svc } = setup();
    const { token } = await svc.issue("game1", "user1", "HOST");
    const r = await svc.redeem(token);
    expect(r).toMatchObject({ gameId: "game1", role: "HOST" });
    expect(await svc.redeem(token)).toBeNull(); // single use
    expect(await svc.verifyGrant(r!.grantToken, "game1")).toMatchObject({ userId: "user1", role: "HOST" });
    expect(await svc.verifyGrant(r!.grantToken, "game2")).toBeNull(); // wrong game
  });

  it("expires after the TTL", async () => {
    const { svc, advance } = setup();
    const { token } = await svc.issue("game1", "user1", "SCOREKEEPER");
    advance(PAIRING_TTL_MS + 1);
    expect(await svc.redeem(token)).toBeNull();
  });

  it("stores only hashes, and rejects junk tokens", async () => {
    const { svc, store } = setup();
    const { token } = await svc.issue("g", "u", "HOST");
    expect([...store.pairings.keys()]).not.toContain(token);
    expect(await svc.redeem("nope")).toBeNull();
    expect(await svc.redeem("x".repeat(500))).toBeNull();
    expect(await svc.verifyGrant(undefined, "g")).toBeNull();
  });

  it("grants expire", async () => {
    const { svc, advance } = setup();
    const { token } = await svc.issue("g", "u", "COHOST");
    const r = await svc.redeem(token);
    advance(19 * 3600_000);
    expect(await svc.verifyGrant(r!.grantToken, "g")).toBeNull();
  });

  it("a grant is worth no more than the role its user holds now", () => {
    expect(capGrantRole("HOST", "HOST")).toBe("HOST");
    expect(capGrantRole("COHOST", "SCOREKEEPER")).toBe("SCOREKEEPER"); // demoted since pairing
    expect(capGrantRole("SCOREKEEPER", "COHOST")).toBe("SCOREKEEPER"); // never more than was granted
    expect(capGrantRole("COHOST", null)).toBeNull(); // removed from the team
  });
});
