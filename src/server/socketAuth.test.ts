import { describe, expect, it } from "vitest";
import { sha256 } from "./crypto";
import { authorizeSocket, type SocketAuthDeps } from "./socketAuth";

const game = { id: "g1", code: "ABCDE", ownerId: "owner" };
const deps: SocketAuthDeps = {
  findGame: async (code) => (code === "ABCDE" ? game : null),
  userIdFromSession: async (t) => ({ "owner-session": "owner", "stranger-session": "stranger", "sk-session": "sk" })[t] ?? null,
  hostRoleFor: async (userId, ownerId) => (userId === ownerId ? "HOST" : userId === "sk" ? "SCOREKEEPER" : null),
  verifyGrant: async (t, gameId) => (t === "good-grant" && gameId === "g1" ? { userId: "owner", role: "HOST" } : null),
  playerIdForToken: async (gameId, hash) => (gameId === "g1" && hash === sha256("player-token-123") ? "p1" : null),
};

describe("socket auth", () => {
  it("display needs no login", async () => {
    await expect(authorizeSocket({ role: "display", code: "abcde" }, undefined, deps)).resolves.toMatchObject({ role: "display" });
  });

  it("rejects unknown games and malformed handshakes", async () => {
    await expect(authorizeSocket({ role: "display", code: "ZZZZZ" }, undefined, deps)).rejects.toThrow("Game not found");
    await expect(authorizeSocket({ role: "admin", code: "ABCDE" }, undefined, deps)).rejects.toThrow("Bad handshake");
    await expect(authorizeSocket(null, undefined, deps)).rejects.toThrow();
  });

  it("host requires the owner's session, a membership, or a pairing grant", async () => {
    await expect(authorizeSocket({ role: "host", code: "ABCDE" }, undefined, deps)).rejects.toThrow("Not authorized");
    await expect(authorizeSocket({ role: "host", code: "ABCDE" }, "jp_session=stranger-session", deps)).rejects.toThrow("Not authorized");
    await expect(authorizeSocket({ role: "host", code: "ABCDE" }, "jp_session=owner-session", deps)).resolves.toMatchObject({ role: "host", hostRole: "HOST" });
    await expect(authorizeSocket({ role: "host", code: "ABCDE" }, "jp_session=sk-session", deps)).resolves.toMatchObject({ hostRole: "SCOREKEEPER" });
    await expect(authorizeSocket({ role: "host", code: "ABCDE" }, "jp_grant_ABCDE=good-grant", deps)).resolves.toMatchObject({ role: "host", userId: "owner" });
    await expect(authorizeSocket({ role: "host", code: "ABCDE" }, "jp_grant_ABCDE=bad", deps)).rejects.toThrow("Not authorized");
  });

  it("host identity can't be forged through the handshake payload", async () => {
    await expect(
      authorizeSocket({ role: "host", code: "ABCDE", userId: "owner", hostRole: "HOST" }, undefined, deps),
    ).rejects.toThrow("Not authorized");
  });

  it("players reconnect by token, or arrive anonymous", async () => {
    await expect(authorizeSocket({ role: "player", code: "ABCDE", playerToken: "player-token-123" }, undefined, deps)).resolves.toMatchObject({ playerId: "p1" });
    await expect(authorizeSocket({ role: "player", code: "ABCDE", playerToken: "someone-elses-token" }, undefined, deps)).resolves.toMatchObject({ playerId: null });
  });
});
