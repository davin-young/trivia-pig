import { describe, expect, it } from "vitest";
import { makeRound, type BoardContent } from "@/shared/board";
import { computeAwards } from "./awards";
import { GameHistory } from "./history";
import { readingTimeMs, replay } from "./reducer";
import { DEFAULT_SETTINGS, type GameAction, type Settings } from "./types";
import { buildView } from "./views";

function setup(settings: Partial<Settings> = {}) {
  const r1 = makeRound("single", 2, [100, 200, 300]);
  r1.categories.forEach((c, ci) =>
    c.clues.forEach((q, qi) => {
      q.text = `clue number ${ci} ${qi}`;
      q.answer = `secret ${ci}-${qi}`;
    }),
  );
  const b: BoardContent = { rounds: [r1], final: { category: "F", text: "final clue", answer: "final answer" } };
  const g = new GameHistory({ board: b, settings: { ...DEFAULT_SETTINGS, ...settings } });
  let t = 10_000;
  const host = (action: GameAction, at?: number) => g.dispatch(action, "host:u1", at ?? (t += 10));
  const player = (action: GameAction, at?: number) => g.dispatch(action, "player:x", at ?? (t += 10));
  const clue = (cat: number, row: number) => b.rounds[0].categories[cat].clues[row].id;
  for (const [id, name] of [["a", "Ann"], ["b", "Bob"], ["c", "Cy"]] as const) player({ type: "player/join", playerId: id, name, signature: null });
  host({ type: "game/start", dailyDoubles: {} });
  return { g, host, player, clue, now: () => t, tick: (ms: number) => (t += ms), b };
}
const view = (g: GameHistory, audience: "host" | "display" | "player", playerId?: string) => buildView(g.state, { audience, code: "X", title: "", playerId });

describe("auto-open buzzers", () => {
  it("gives longer clues more reading time, within 2 to 15 seconds", () => {
    expect(readingTimeMs("Short")).toBe(2000);
    expect(readingTimeMs("one two three four five six seven eight nine ten")).toBe(4500);
    expect(readingTimeMs(Array(200).fill("word").join(" "))).toBe(15_000);
  });

  it("stamps the unlock time on the clue only when the setting is on", () => {
    const off = setup();
    off.host({ type: "clue/open", clueId: off.clue(0, 0) });
    expect(off.g.state.clue?.autoUnlockAt).toBeNull();

    const on = setup({ autoUnlock: true });
    on.host({ type: "clue/open", clueId: on.clue(0, 0) }, 50_000);
    expect(on.g.state.clue?.autoUnlockAt).toBe(50_000 + readingTimeMs("clue number 0 0"));
    expect(view(on.g, "display").clue?.autoUnlockAt).toBe(on.g.state.clue?.autoUnlockAt);
    on.host({ type: "buzzers/unlock" }, 51_000);
    expect(on.g.state.clue?.stage).toBe("open");
    expect(view(on.g, "display").clue?.autoUnlockAt).toBeNull();
  });

  it("does not re-open by itself after the host locks the buzzers again", () => {
    const { g, host, clue } = setup({ autoUnlock: true });
    host({ type: "clue/open", clueId: clue(0, 0) });
    host({ type: "buzzers/unlock" });
    host({ type: "buzzers/lock" });
    expect(g.state.clue?.stage).toBe("reading");
    expect(g.state.clue?.autoUnlockAt).toBeNull();
  });
});

describe("all-play clues", () => {
  it("everyone answers, right answers score, wrong answers cost nothing", () => {
    const { g, host, player, clue } = setup({ allPlayTimerSec: 20 });
    host({ type: "clue/open", clueId: clue(1, 2), allPlay: true }, 20_000);
    expect(g.state.clue?.allPlay?.stage).toBe("writing");
    expect(g.state.timer?.endsAt).toBe(40_000);
    // no buzzing on an all-play
    expect(host({ type: "buzzers/unlock" }).ok).toBe(false);
    expect(player({ type: "player/buzz", playerId: "a" }).ok).toBe(false);

    expect(player({ type: "player/allPlayAnswer", playerId: "a", drawing: null, typed: "right" }, 21_000).ok).toBe(true);
    expect(player({ type: "player/allPlayAnswer", playerId: "b", drawing: null, typed: "wrong" }, 22_000).ok).toBe(true);
    // too late (past the grace window)
    expect(player({ type: "player/allPlayAnswer", playerId: "c", drawing: null, typed: "late" }, 42_000).ok).toBe(false);

    expect(host({ type: "allPlay/judge", contestantId: "a", correct: true }).ok).toBe(false); // still writing
    host({ type: "allPlay/close" });
    expect(g.state.timer).toBeNull();
    host({ type: "allPlay/judge", contestantId: "a", correct: true });
    host({ type: "allPlay/judge", contestantId: "b", correct: false });
    expect(g.state.scores).toMatchObject({ a: 300, b: 0, c: 0 });
    // changing a ruling takes the points back
    host({ type: "allPlay/judge", contestantId: "a", correct: false });
    expect(g.state.scores.a).toBe(0);
    host({ type: "allPlay/judge", contestantId: "a", correct: true });
    expect(g.state.scores.a).toBe(300);
    host({ type: "clue/reveal" });
    host({ type: "clue/close" });
    expect(g.state.phase).toBe("board");
    // deterministic on replay
    expect(replay({ board: g.setup.board, settings: g.setup.settings }, g.log).scores).toEqual(g.state.scores);
  });

  it("hides other answers until they are judged, and the real answer until revealed", () => {
    const { g, host, player, clue } = setup();
    host({ type: "clue/open", clueId: clue(0, 1), allPlay: true });
    player({ type: "player/allPlayAnswer", playerId: "a", drawing: null, typed: "ann says" });
    player({ type: "player/allPlayAnswer", playerId: "b", drawing: null, typed: "bob says" });

    const d1 = view(g, "display");
    expect(d1.clue?.allPlay?.hasAnswer).toEqual({ a: true, b: true });
    expect(d1.clue?.allPlay?.typed).toEqual({});
    expect(JSON.stringify(d1)).not.toContain("secret");
    expect(JSON.stringify(view(g, "player", "b"))).not.toContain("ann says");
    expect(view(g, "player", "b").me?.allPlayTyped).toBe("bob says");
    expect(view(g, "host").clue?.allPlay?.typed).toEqual({ a: "ann says", b: "bob says" });

    host({ type: "allPlay/close" });
    host({ type: "allPlay/judge", contestantId: "a", correct: true });
    const d2 = view(g, "display");
    expect(d2.clue?.allPlay?.typed).toEqual({ a: "ann says" });
    expect(d2.clue?.answer).toBeNull();
    host({ type: "clue/reveal" });
    const d3 = view(g, "display");
    expect(d3.clue?.allPlay?.typed).toEqual({ a: "ann says", b: "bob says" });
    expect(d3.clue?.answer).toBe("secret 0-1");
  });
});

describe("bots and awards", () => {
  it("marks practice bots in the view", () => {
    const { g, player } = setup();
    player({ type: "player/join", playerId: "bot_1", name: "Quizzy", signature: null, bot: true });
    expect(view(g, "display").players.find((p) => p.id === "bot_1")?.bot).toBe(true);
    expect(view(g, "display").players.find((p) => p.id === "a")?.bot).toBe(false);
  });

  it("records buzz reaction times and hands out awards at the end", () => {
    const { g, host, player, clue } = setup();
    const play = (cat: number, row: number, who: string, reactionMs: number, correct: boolean) => {
      host({ type: "clue/open", clueId: clue(cat, row) });
      const opened = host({ type: "buzzers/unlock" });
      expect(opened.ok).toBe(true);
      const openAt = g.log.at(-1)!.at;
      player({ type: "player/buzz", playerId: who }, openAt + reactionMs);
      host({ type: "clue/judge", correct }, openAt + reactionMs + 5);
      if (!correct) host({ type: "clue/nobody" }, openAt + reactionMs + 6);
      host({ type: "clue/close" }, openAt + reactionMs + 7);
    };
    play(0, 0, "a", 200, true);
    play(0, 1, "a", 400, true);
    play(0, 2, "a", 300, true);
    expect(view(g, "display").streaks).toEqual({ a: 3 });
    expect(view(g, "player", "b").streaks).toEqual({ a: 3 });
    play(1, 0, "b", 900, false);
    play(1, 1, "b", 1100, false);
    play(1, 2, "b", 1000, false);
    expect(g.state.buzzStats.a).toEqual({ wins: 3, totalMs: 900, fastestMs: 200 });
    expect(view(g, "display").awards).toBeNull();
    host({ type: "game/end" });

    const awards = computeAwards(g.state);
    const by = Object.fromEntries(awards.map((a) => [a.id, a]));
    expect(by.fastest).toMatchObject({ name: "Ann", winnerId: "a" });
    expect(by.fastest.detail).toContain("0.30s");
    expect(by.streak).toMatchObject({ name: "Ann", detail: "3 right answers in a row" });
    expect(by.brave).toMatchObject({ name: "Bob" });
    expect(view(g, "display").awards?.length).toBe(awards.length);
  });
});
