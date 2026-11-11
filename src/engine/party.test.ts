import { describe, expect, it } from "vitest";
import { makeRound, type BoardContent } from "@/shared/board";
import { computeAwards } from "./awards";
import { GameHistory } from "./history";
import { activePlayers, contestantIds, vipOf } from "./reducer";
import { DEFAULT_SETTINGS, type GameAction, type Settings } from "./types";
import { buildView } from "./views";

const ink = { v: 1 as const, w: 600, h: 240, strokes: [{ c: "#fff", s: 8, p: [[1, 1, 0.5], [9, 9, 0.5]] as [number, number, number][] }] };

function lobby(settings: Partial<Settings> = {}) {
  const r1 = makeRound("single", 2, [100, 200]);
  r1.categories.forEach((c, ci) => c.clues.forEach((q, qi) => ((q.text = `clue ${ci} ${qi} with some words in it`), (q.answer = `answer ${ci}-${qi}`))));
  const b: BoardContent = { rounds: [r1], final: { category: "F", text: "final clue", answer: "final answer" } };
  const g = new GameHistory({ board: b, settings: { ...DEFAULT_SETTINGS, ...settings } });
  let t = 10_000;
  const act = (action: GameAction, at?: number) => g.dispatch(action, "test", at ?? (t += 10));
  const join = (id: string, name: string, extra: Partial<Extract<GameAction, { type: "player/join" }>> = {}) => act({ type: "player/join", playerId: id, name, signature: null, ...extra });
  const clue = (cat: number, row: number) => b.rounds[0].categories[cat].clues[row].id;
  return { g, act, join, clue, now: () => t };
}
const view = (g: GameHistory, audience: "host" | "display" | "player", playerId?: string) => buildView(g.state, { audience, code: "X", title: "", playerId });

describe("VIP start", () => {
  it("is the first human player, skipping bots and audience, and moves on when they leave", () => {
    const { g, join, act } = lobby();
    join("bot", "Botty", { bot: true });
    join("w", "Watcher", { audience: true });
    expect(vipOf(g.state)).toBeNull();
    join("a", "Ann");
    join("b", "Bob");
    expect(vipOf(g.state)).toBe("a");
    expect(view(g, "display").vipId).toBe("a");
    act({ type: "player/kick", playerId: "a" });
    expect(vipOf(g.state)).toBe("b");
  });

  it("can be turned off, and is only offered in the lobby", () => {
    const off = lobby({ vipStart: false });
    off.join("a", "Ann");
    expect(view(off.g, "display").vipId).toBeNull();
    const on = lobby();
    on.join("a", "Ann");
    on.act({ type: "game/start", dailyDoubles: {} });
    expect(view(on.g, "player", "a").vipId).toBeNull();
  });
});

describe("start countdown", () => {
  it("counts down in the lobby, can be cancelled, and clears when the game starts", () => {
    const { g, join, act } = lobby();
    join("a", "Ann");
    expect(act({ type: "game/countdown", endsAt: 99_000 }).ok).toBe(true);
    expect(view(g, "display").startingAt).toBe(99_000);
    expect(act({ type: "game/countdown", endsAt: 123_000 }).ok).toBe(false);
    expect(join("late", "Latecomer").ok).toBe(true); // last chance to join
    expect(act({ type: "game/countdownCancel" }).ok).toBe(true);
    expect(view(g, "display").startingAt).toBeNull();
    act({ type: "game/countdown", endsAt: 99_000 });
    act({ type: "game/start", dailyDoubles: {} });
    expect(g.state.startingAt).toBeNull();
    expect(g.state.phase).toBe("board");
    expect(act({ type: "game/countdown", endsAt: 1 }).ok).toBe(false);
  });
});

describe("audience", () => {
  it("watches without becoming a contestant, even when the room is locked or full", () => {
    const { g, join, act } = lobby({ maxPlayers: 1 });
    join("a", "Ann");
    act({ type: "lobby/lock", locked: true });
    expect(join("b", "Bob").ok).toBe(false);
    expect(join("w", "Wendy", { audience: true }).ok).toBe(true);
    expect(activePlayers(g.state).map((p) => p.id)).toEqual(["a"]);
    expect(contestantIds(g.state)).toEqual(["a"]);
    const disp = view(g, "display");
    expect(disp.players.map((p) => p.id)).toEqual(["a"]);
    expect(disp.crowd).toEqual({ count: 1, cheers: {} });
    expect(view(g, "host").crowd.members).toEqual([{ id: "w", name: "Wendy" }]);
    const me = view(g, "player", "w").me!;
    expect(me).toMatchObject({ audience: true, contestantId: null, canBuzz: false });
    expect(g.state.scores.w).toBeUndefined();
  });

  it("cannot buzz, and can be switched off", () => {
    const { g, join, act, clue } = lobby();
    join("a", "Ann");
    join("w", "Wendy", { audience: true });
    act({ type: "game/start", dailyDoubles: {} });
    act({ type: "clue/open", clueId: clue(0, 0) });
    act({ type: "buzzers/unlock" });
    expect(act({ type: "player/buzz", playerId: "w" }).ok).toBe(false);
    expect(g.state.clue?.answering).toBeNull();
    const off = lobby({ audience: false });
    expect(off.join("w", "Wendy", { audience: true }).ok).toBe(false);
  });

  it("cheers for a contestant, and the most-cheered wins Crowd Favorite", () => {
    const { g, join, act } = lobby();
    join("a", "Ann");
    join("b", "Bob");
    for (const id of ["w1", "w2", "w3"]) join(id, id, { audience: true });
    expect(act({ type: "player/cheer", playerId: "a", contestantId: "b" }).ok).toBe(false); // players can't
    expect(act({ type: "player/cheer", playerId: "w1", contestantId: "nobody" }).ok).toBe(false);
    act({ type: "player/cheer", playerId: "w1", contestantId: "b" });
    act({ type: "player/cheer", playerId: "w2", contestantId: "b" });
    act({ type: "player/cheer", playerId: "w3", contestantId: "a" });
    expect(view(g, "display").crowd.cheers).toEqual({ a: 1, b: 2 });
    expect(view(g, "player", "w1").me?.cheerFor).toBe("b");
    act({ type: "player/cheer", playerId: "w3", contestantId: null });
    expect(view(g, "display").crowd.cheers).toEqual({ b: 2 });
    act({ type: "game/start", dailyDoubles: {} });
    act({ type: "game/end" });
    expect(computeAwards(g.state).find((a) => a.id === "crowd")).toMatchObject({ winnerId: "b", name: "Bob" });
  });
});

describe("avatars and family mode", () => {
  it("keeps an avatar with the player and hides it from other phones", () => {
    const { g, join } = lobby();
    join("a", "Ann", { signature: ink, avatar: { ...ink, w: 300, h: 300 } });
    join("b", "Bob");
    expect(view(g, "display").players[0].avatar?.w).toBe(300);
    expect(view(g, "player", "a").players[0].avatar).not.toBeNull();
    expect(view(g, "player", "b").players[0].avatar).toBeNull();
  });

  it("family mode holds drawings back until the host approves them", () => {
    const { g, join, act } = lobby({ familyMode: true });
    join("a", "Ann", { signature: ink, avatar: ink });
    join("b", "Bob"); // nothing drawn, nothing to approve
    expect(view(g, "display").players.map((p) => [p.signature, p.avatar, p.signatureHidden])).toEqual([
      [null, null, true],
      [null, null, false],
    ]);
    expect(view(g, "host").players[0].signature).not.toBeNull(); // the host can see what to approve
    act({ type: "player/hideSignature", playerId: "a", hidden: false });
    expect(view(g, "display").players[0].signature).not.toBeNull();
    // Redrawing needs a fresh OK.
    act({ type: "player/signature", playerId: "a", signature: ink });
    expect(view(g, "display").players[0].signature).toBeNull();
  });
});

describe("extended timers", () => {
  it("stretches the answer, all-play, reading and Final timers", () => {
    const { g, join, act, clue } = lobby({ timerScale: 2, answerTimerSec: 8, allPlayTimerSec: 30, finalTimerSec: 30, autoUnlock: true });
    join("a", "Ann");
    join("b", "Bob");
    act({ type: "game/start", dailyDoubles: {} });
    act({ type: "clue/open", clueId: clue(0, 0) }, 100_000);
    const normal = lobby({ autoUnlock: true });
    normal.join("a", "Ann");
    normal.act({ type: "game/start", dailyDoubles: {} });
    normal.act({ type: "clue/open", clueId: normal.clue(0, 0) }, 100_000);
    expect(g.state.clue!.autoUnlockAt! - 100_000).toBe((normal.g.state.clue!.autoUnlockAt! - 100_000) * 2);
    act({ type: "buzzers/unlock" }, 110_000);
    act({ type: "player/buzz", playerId: "a" }, 111_000);
    expect(g.state.timer).toMatchObject({ startedAt: 111_000, endsAt: 127_000 });
    act({ type: "clue/judge", correct: true });
    act({ type: "clue/close" });
    act({ type: "clue/open", clueId: clue(1, 0), allPlay: true }, 200_000);
    expect(g.state.clue?.allPlay?.endsAt).toBe(260_000);
    act({ type: "allPlay/close" });
    act({ type: "clue/reveal" });
    act({ type: "clue/close" });
    act({ type: "final/start" });
    act({ type: "final/showClue" });
    act({ type: "final/startTimer" }, 300_000);
    expect(g.state.final?.endsAt).toBe(360_000);
  });
});
