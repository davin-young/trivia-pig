import { describe, expect, it } from "vitest";
import { makeRound, type BoardContent } from "@/shared/board";
import { GameHistory } from "./history";
import { resolveDailyDoubles } from "./reducer";
import { DEFAULT_SETTINGS, HARD_MAX_AUDIENCE, HARD_MAX_PLAYERS, type GameAction, type LogEntry, type Settings } from "./types";
import { buildView } from "./views";

function board(): BoardContent {
  const r1 = makeRound("single", 2, [100, 200]);
  const r2 = makeRound("double", 2, [200, 400]);
  for (const r of [r1, r2])
    r.categories.forEach((c, ci) => {
      c.name = `Cat ${ci}`;
      c.clues.forEach((q, qi) => {
        q.text = `clue ${ci}-${qi}`;
        q.answer = `answer ${ci}-${qi}`;
      });
    });
  return { rounds: [r1, r2], final: { category: "Final cat", text: "final clue", answer: "final answer" } };
}

function game(settings: Partial<Settings> = {}) {
  const b = board();
  const g = new GameHistory({ board: b, settings: { ...DEFAULT_SETTINGS, ...settings } });
  let t = 1_000;
  const host = (action: GameAction) => g.dispatch(action, "host:u1", (t += 10));
  const player = (action: GameAction, at?: number) => g.dispatch(action, `player:${"playerId" in action ? action.playerId : "?"}`, at ?? (t += 10));
  const clue = (round: number, cat: number, row: number) => b.rounds[round].categories[cat].clues[row].id;
  const now = () => t;
  const tick = (ms: number) => (t += ms);
  return { g, host, player, clue, now, tick, b };
}

function withPlayers(settings: Partial<Settings> = {}, dd: Record<number, string[]> = {}) {
  const ctx = game(settings);
  ctx.player({ type: "player/join", playerId: "a", name: "Ann", signature: null });
  ctx.player({ type: "player/join", playerId: "b", name: "Bob", signature: null });
  ctx.player({ type: "player/join", playerId: "c", name: "Cy", signature: null });
  ctx.host({ type: "game/start", dailyDoubles: dd });
  return ctx;
}

describe("scoring", () => {
  it("adds value for correct and subtracts for incorrect; scores go negative", () => {
    const { g, host, player, clue } = withPlayers();
    host({ type: "clue/open", clueId: clue(0, 0, 1) });
    host({ type: "buzzers/unlock" });
    player({ type: "player/buzz", playerId: "a" });
    host({ type: "clue/judge", correct: false });
    expect(g.state.scores.a).toBe(-200);
    player({ type: "player/buzz", playerId: "b" });
    host({ type: "clue/judge", correct: true });
    expect(g.state.scores.b).toBe(200);
    expect(g.state.controlId).toBe("b");
    expect(g.state.clue?.stage).toBe("revealed");
    host({ type: "clue/close" });
    expect(g.state.phase).toBe("board");
    expect(g.state.used[clue(0, 0, 1)]).toBe(true);
  });

  it("manual adjust and set", () => {
    const { g, host } = withPlayers();
    host({ type: "score/adjust", contestantId: "c", delta: 300 });
    host({ type: "score/set", contestantId: "a", score: -50 });
    expect(g.state.scores).toMatchObject({ a: -50, b: 0, c: 300 });
    expect(g.state.scoreEvents).toHaveLength(2);
  });

  it("team mode scores accrue to teams", () => {
    const ctx = game({ mode: "team" });
    ctx.host({ type: "team/create", teamId: "t1", name: "Red", color: "#f00" });
    ctx.host({ type: "team/create", teamId: "t2", name: "Blue", color: "#00f" });
    ctx.player({ type: "player/join", playerId: "a", name: "Ann", signature: null, teamId: "t1" });
    ctx.player({ type: "player/join", playerId: "b", name: "Bob", signature: null });
    ctx.host({ type: "team/assign", playerId: "b", teamId: "t2" });
    ctx.host({ type: "game/start", dailyDoubles: {} });
    ctx.host({ type: "clue/open", clueId: ctx.clue(0, 1, 0) });
    ctx.host({ type: "buzzers/unlock" });
    ctx.player({ type: "player/buzz", playerId: "a" });
    ctx.host({ type: "clue/judge", correct: true });
    expect(ctx.g.state.scores.t1).toBe(100);
    expect(ctx.g.state.scores.a).toBe(0);
    expect(ctx.g.state.controlId).toBe("t1");
  });
});

describe("buzzer ordering", () => {
  it("first buzz after unlock wins; later buzzes are recorded in order", () => {
    const { g, host, player, clue, now } = withPlayers();
    host({ type: "clue/open", clueId: clue(0, 0, 0) });
    host({ type: "buzzers/unlock" });
    player({ type: "player/buzz", playerId: "c" }, now() + 1);
    player({ type: "player/buzz", playerId: "a" }, now() + 2);
    player({ type: "player/buzz", playerId: "b" }, now() + 3);
    expect(g.state.clue?.answering).toBe("c");
    expect(g.state.clue?.buzzes.map((b) => b.playerId)).toEqual(["c", "a", "b"]);
  });

  it("buzzes before unlock are rejected and trigger an early-buzz lockout", () => {
    const { g, host, player, clue, now } = withPlayers({ earlyBuzzLockoutMs: 500 });
    host({ type: "clue/open", clueId: clue(0, 0, 0) });
    const early = now() + 1;
    player({ type: "player/buzz", playerId: "a" }, early);
    expect(g.state.clue?.answering).toBeNull();
    expect(g.state.clue?.lockouts.a).toBe(early + 500);
    host({ type: "buzzers/unlock" });
    const r1 = g.dispatch({ type: "player/buzz", playerId: "a" }, "player:a", early + 100);
    expect(r1.ok).toBe(false);
    const r2 = g.dispatch({ type: "player/buzz", playerId: "b" }, "player:b", early + 120);
    expect(r2.ok).toBe(true);
    expect(g.state.clue?.answering).toBe("b");
  });

  it("no lockout when the penalty is disabled", () => {
    const { g, host, player, clue } = withPlayers({ earlyBuzzLockoutMs: 0 });
    host({ type: "clue/open", clueId: clue(0, 0, 0) });
    const r = player({ type: "player/buzz", playerId: "a" });
    expect(r.ok).toBe(false);
    expect(g.state.clue?.lockouts).toEqual({});
  });

  it("wrong answerers cannot rebuzz unless allowed", () => {
    const { g, host, player, clue } = withPlayers({ allowRebuzz: false });
    host({ type: "clue/open", clueId: clue(0, 0, 0) });
    host({ type: "buzzers/unlock" });
    player({ type: "player/buzz", playerId: "a" });
    host({ type: "clue/judge", correct: false });
    expect(player({ type: "player/buzz", playerId: "a" }).ok).toBe(false);
    expect(player({ type: "player/buzz", playerId: "b" }).ok).toBe(true);

    const two = withPlayers({ allowRebuzz: true });
    two.host({ type: "clue/open", clueId: two.clue(0, 0, 0) });
    two.host({ type: "buzzers/unlock" });
    two.player({ type: "player/buzz", playerId: "a" });
    two.host({ type: "clue/judge", correct: false });
    expect(two.player({ type: "player/buzz", playerId: "a" }).ok).toBe(true);
  });

  it("starts the answer timer on buzz", () => {
    const { g, host, player, clue, now } = withPlayers({ answerTimerSec: 5 });
    host({ type: "clue/open", clueId: clue(0, 0, 0) });
    host({ type: "buzzers/unlock" });
    player({ type: "player/buzz", playerId: "a" });
    expect(g.state.timer?.endsAt).toBe(now() + 5000);
  });

  it("locked buzzers reject buzzes", () => {
    const { g, host, player, clue } = withPlayers({ earlyBuzzLockoutMs: 0 });
    host({ type: "clue/open", clueId: clue(0, 0, 0) });
    host({ type: "buzzers/unlock" });
    host({ type: "buzzers/lock" });
    expect(player({ type: "player/buzz", playerId: "a" }).ok).toBe(false);
    expect(g.state.clue?.answering).toBeNull();
  });
});

describe("wagers", () => {
  it("daily double: wager capped at max(score, round max)", () => {
    const ctx = game();
    const dd = ctx.clue(0, 1, 1);
    ctx.player({ type: "player/join", playerId: "a", name: "Ann", signature: null });
    ctx.host({ type: "game/start", dailyDoubles: { 0: [dd] } });
    ctx.host({ type: "clue/open", clueId: dd });
    expect(ctx.g.state.clue?.dailyDouble).toEqual({ contestantId: "a", wager: null });
    // display hides clue text until the wager is in
    const disp = buildView(ctx.g.state, { audience: "display", code: "X", title: "" });
    expect(disp.clue?.text).toBeNull();
    expect(ctx.host({ type: "dd/wager", amount: 201 }).ok).toBe(false); // round max is 200, score 0
    expect(ctx.host({ type: "dd/wager", amount: 200 }).ok).toBe(true);
    ctx.host({ type: "clue/judge", correct: true });
    expect(ctx.g.state.scores.a).toBe(200);
  });

  it("daily double: players cannot buzz", () => {
    const ctx = game();
    const dd = ctx.clue(0, 0, 0);
    ctx.player({ type: "player/join", playerId: "a", name: "Ann", signature: null });
    ctx.host({ type: "game/start", dailyDoubles: { 0: [dd] } });
    ctx.host({ type: "clue/open", clueId: dd });
    expect(ctx.host({ type: "buzzers/unlock" }).ok).toBe(false);
    expect(ctx.player({ type: "player/buzz", playerId: "a" }).ok).toBe(false);
  });

  it("final wager is checked against score", () => {
    const { g, host, player } = withPlayers();
    host({ type: "score/set", contestantId: "a", score: 500 });
    host({ type: "final/start" });
    expect(g.state.final?.eligible).toEqual(["a"]);
    expect(player({ type: "player/finalWager", playerId: "a", amount: 501 }).ok).toBe(false);
    expect(player({ type: "player/finalWager", playerId: "a", amount: -1 }).ok).toBe(false);
    expect(player({ type: "player/finalWager", playerId: "a", amount: 500 }).ok).toBe(true);
    // ineligible player (score 0) can't wager
    expect(player({ type: "player/finalWager", playerId: "b", amount: 0 }).ok).toBe(false);
  });

  it("random daily doubles respect count and avoid duplicates", () => {
    const b = board();
    let seed = 1;
    const rand = () => ((seed = (seed * 16807) % 2147483647) - 1) / 2147483646;
    const dds = resolveDailyDoubles(b, { ...DEFAULT_SETTINGS, dailyDoublePlacement: "random", dailyDoublesSingle: 1, dailyDoublesDouble: 2 }, rand);
    expect(dds[0]).toHaveLength(1);
    expect(dds[1]).toHaveLength(2);
    expect(new Set(dds[1]).size).toBe(2);
  });
});

describe("undo history", () => {
  it("undoes any step (not just the last) and replays", () => {
    const { g, host, player, clue } = withPlayers();
    host({ type: "score/adjust", contestantId: "a", delta: 100 }); // will undo this one
    const target = g.log.at(-1)!.seq;
    host({ type: "clue/open", clueId: clue(0, 0, 0) });
    host({ type: "buzzers/unlock" });
    player({ type: "player/buzz", playerId: "b" });
    host({ type: "clue/judge", correct: true });
    expect(g.state.scores).toMatchObject({ a: 100, b: 100 });
    g.setUndone(target, true);
    expect(g.state.scores).toMatchObject({ a: 0, b: 100 });
    expect(g.state.clue?.stage).toBe("revealed");
    g.setUndone(target, false); // redo
    expect(g.state.scores.a).toBe(100);
  });

  it("undoing an earlier step makes dependent later steps no-ops on replay", () => {
    const { g, host, player, clue } = withPlayers();
    host({ type: "clue/open", clueId: clue(0, 0, 0) });
    const openSeq = g.log.at(-1)!.seq;
    host({ type: "buzzers/unlock" });
    player({ type: "player/buzz", playerId: "a" });
    host({ type: "clue/judge", correct: true });
    g.setUndone(openSeq, true);
    expect(g.state.phase).toBe("board");
    expect(g.state.scores.a).toBe(0);
    expect(g.state.used[clue(0, 0, 0)]).toBeUndefined();
  });

  it("undoLast skips player actions and keeps version monotonic", () => {
    const { g, host, player, clue } = withPlayers();
    host({ type: "clue/open", clueId: clue(0, 0, 0) });
    host({ type: "buzzers/unlock" });
    player({ type: "player/buzz", playerId: "a" });
    const v = g.state.version;
    const undone = g.undoLast();
    expect(undone?.action.type).toBe("buzzers/unlock");
    expect(g.state.version).toBeGreaterThan(v);
    expect(g.state.clue?.stage).toBe("reading");
  });

  it("rejected actions are not logged", () => {
    const { g, host } = withPlayers();
    const n = g.log.length;
    expect(host({ type: "clue/close" }).ok).toBe(false);
    expect(g.log.length).toBe(n);
  });
});

describe("back to lobby", () => {
  it("returns an untouched game to the lobby and keeps everyone, including a late joiner", () => {
    const { g, player, host } = withPlayers();
    player({ type: "player/join", playerId: "d", name: "Di", signature: null });
    expect(g.canReturnToLobby).toBe(true);
    expect(g.backToLobby()).toBe(true);
    expect(g.state.phase).toBe("lobby");
    expect(Object.keys(g.state.players).sort()).toEqual(["a", "b", "c", "d"]);
    expect(host({ type: "game/start", dailyDoubles: {} }).ok).toBe(true);
    expect(g.state.phase).toBe("board");
  });

  it("also clears the countdown that led to the start, so the game does not start again", () => {
    const { g, player, host, now } = game();
    player({ type: "player/join", playerId: "a", name: "Ann", signature: null });
    host({ type: "game/countdown", endsAt: now() + 5000 });
    host({ type: "game/start", dailyDoubles: {} });
    expect(g.state.phase).toBe("board");
    expect(g.backToLobby()).toBe(true);
    expect(g.state.phase).toBe("lobby");
    expect(g.state.startingAt).toBeNull();
    expect(host({ type: "game/countdown", endsAt: now() + 5000 }).ok).toBe(true);
  });

  it("refuses once a clue has been opened or points have moved", () => {
    const opened = withPlayers();
    opened.host({ type: "clue/open", clueId: opened.clue(0, 0, 0) });
    expect(opened.g.backToLobby()).toBe(false);
    expect(opened.g.state.phase).toBe("clue");

    const scored = withPlayers();
    scored.host({ type: "score/adjust", contestantId: "a", delta: 100 });
    expect(scored.g.backToLobby()).toBe(false);

    const lobby = game();
    expect(lobby.g.backToLobby()).toBe(false);
  });
});

describe("final jeopardy reveal flow", () => {
  function finalGame() {
    const ctx = withPlayers();
    ctx.host({ type: "score/set", contestantId: "a", score: 1000 });
    ctx.host({ type: "score/set", contestantId: "b", score: 400 });
    ctx.host({ type: "score/set", contestantId: "c", score: -200 });
    ctx.host({ type: "final/start" });
    ctx.player({ type: "player/finalWager", playerId: "a", amount: 900 });
    ctx.player({ type: "player/finalWager", playerId: "b", amount: 400 });
    ctx.host({ type: "final/showClue" });
    ctx.host({ type: "final/startTimer" });
    const ink = { v: 1 as const, w: 800, h: 450, strokes: [{ c: "#ffffff", s: 8, p: [[1, 1, 0.5] as [number, number, number]] }] };
    ctx.player({ type: "player/finalAnswer", playerId: "a", drawing: ink });
    ctx.player({ type: "player/finalAnswer", playerId: "b", drawing: ink });
    return { ...ctx, ink };
  }

  it("excludes non-positive scores, reveals lowest first, applies wagers", () => {
    const { g, host } = finalGame();
    expect(g.state.final?.eligible).toEqual(["a", "b"]);
    host({ type: "final/close" });
    expect(g.state.final?.order).toEqual(["b", "a"]);

    // display can't see answers or wagers before reveal
    let disp = buildView(g.state, { audience: "display", code: "X", title: "" });
    expect(disp.final?.answers).toEqual({});
    expect(disp.final?.wagers).toEqual({});
    expect(disp.final?.answer).toBeNull();

    host({ type: "final/reveal", contestantId: "b" });
    disp = buildView(g.state, { audience: "display", code: "X", title: "" });
    expect(Object.keys(disp.final!.answers)).toEqual(["b"]);
    // can't show wager before judging
    expect(host({ type: "final/showWager", contestantId: "b" }).ok).toBe(false);
    host({ type: "final/judge", contestantId: "b", correct: false });
    host({ type: "final/showWager", contestantId: "b" });
    expect(g.state.scores.b).toBe(0);

    host({ type: "final/reveal", contestantId: "a" });
    host({ type: "final/judge", contestantId: "a", correct: true });
    disp = buildView(g.state, { audience: "display", code: "X", title: "" });
    expect(disp.final?.answer).toBe("final answer");
    host({ type: "final/showWager", contestantId: "a" });
    expect(g.state.scores.a).toBe(1900);
    expect(g.state.final?.stage).toBe("done");
    host({ type: "game/end" });
    expect(g.state.phase).toBe("finished");
  });

  it("rejects late answers after the timer (beyond grace)", () => {
    const { g, ink } = finalGame();
    const endsAt = g.state.final!.endsAt!;
    const late = g.dispatch({ type: "player/finalAnswer", playerId: "a", drawing: ink }, "player:a", endsAt + 5000);
    expect(late.ok).toBe(false);
  });
});

describe("views never leak answers", () => {
  it("display/player views omit unrevealed answers and unopened clue text", () => {
    const { g, host, player, clue } = withPlayers();
    host({ type: "clue/open", clueId: clue(0, 0, 0) });
    host({ type: "buzzers/unlock" });
    player({ type: "player/buzz", playerId: "a" });
    for (const audience of ["display", "player"] as const) {
      const v = buildView(g.state, { audience, code: "X", title: "", playerId: "a" });
      const json = JSON.stringify(v);
      expect(v.clue?.answer).toBeNull();
      expect(json).not.toContain("answer 0-0");
      expect(json).not.toContain("clue 1-1"); // unopened clue
      expect(json).not.toContain("final answer");
      expect(v.host).toBeUndefined();
    }
    const hostView = buildView(g.state, { audience: "host", code: "X", title: "" });
    expect(hostView.clue?.answer).toBe("answer 0-0");
    host({ type: "clue/reveal" });
    expect(buildView(g.state, { audience: "display", code: "X", title: "" }).clue?.answer).toBe("answer 0-0");
  });

  it("player me.canBuzz reflects state", () => {
    const { g, host, clue } = withPlayers();
    host({ type: "clue/open", clueId: clue(0, 0, 0) });
    expect(buildView(g.state, { audience: "player", code: "X", title: "", playerId: "a" }).me?.canBuzz).toBe(false);
    host({ type: "buzzers/unlock" });
    expect(buildView(g.state, { audience: "player", code: "X", title: "", playerId: "a" }).me?.canBuzz).toBe(true);
  });
});

describe("lobby & players", () => {
  it("respects lobby lock, max players, late joins and bans", () => {
    const ctx = game({ maxPlayers: 2, allowLateJoin: false });
    expect(ctx.player({ type: "player/join", playerId: "a", name: "Ann", signature: null }).ok).toBe(true);
    ctx.host({ type: "lobby/lock", locked: true });
    expect(ctx.player({ type: "player/join", playerId: "b", name: "Bob", signature: null }).ok).toBe(false);
    ctx.host({ type: "lobby/lock", locked: false });
    expect(ctx.player({ type: "player/join", playerId: "b", name: "Bob", signature: null }).ok).toBe(true);
    expect(ctx.player({ type: "player/join", playerId: "c", name: "Cy", signature: null }).ok).toBe(false);
    ctx.host({ type: "player/ban", playerId: "b" });
    expect(ctx.player({ type: "player/join", playerId: "d", name: " bob ", signature: null }).ok).toBe(false);
    // reconnect keeps score and spot
    ctx.host({ type: "score/adjust", contestantId: "a", delta: 300 });
    expect(ctx.player({ type: "player/join", playerId: "a", name: "Ann", signature: null }).ok).toBe(true);
    expect(ctx.g.state.scores.a).toBe(300);
    expect(ctx.g.state.players.a.index).toBe(0);
    ctx.host({ type: "game/start", dailyDoubles: {} });
    expect(ctx.player({ type: "player/join", playerId: "e", name: "Eve", signature: null }).ok).toBe(false);
  });
});

describe("ids that name Object.prototype members", () => {
  const BAD = ["__proto__", "constructor", "prototype", "toString"];
  const clean = () => {
    const proto = Object.prototype as Record<string, unknown>;
    const ctor = Object as unknown as Record<string, unknown>;
    return ["name", "removed", "banned", "signature", "signatureHidden", "teamId", "wager", "judged", "answer"].every((k) => !(k in proto) && (k === "name" || !(k in ctor)));
  };

  it("are rejected by every action that looks a player, score or team up by id", () => {
    const { g, host, player, clue } = withPlayers({ mode: "solo" });
    host({ type: "team/create", teamId: "t1", name: "Red", color: "#f00" });
    for (const id of BAD) {
      const actions: GameAction[] = [
        { type: "player/rename", playerId: id, name: "x" },
        { type: "player/hideSignature", playerId: id, hidden: true },
        { type: "player/resetSignature", playerId: id },
        { type: "player/kick", playerId: id },
        { type: "player/ban", playerId: id },
        { type: "player/restore", playerId: id },
        { type: "team/assign", playerId: id, teamId: "t1" },
        { type: "team/autoBalance", assignments: { [id]: "t1" } },
        { type: "player/signature", playerId: id, signature: null },
        { type: "player/cheer", playerId: id, contestantId: "a" },
        { type: "player/buzz", playerId: id },
        { type: "score/adjust", contestantId: id, delta: 5 },
        { type: "score/set", contestantId: id, score: 5 },
        { type: "control/set", contestantId: id },
      ];
      for (const action of actions) {
        const res = action.type.startsWith("player/") && !["player/rename", "player/hideSignature", "player/resetSignature", "player/kick", "player/ban", "player/restore"].includes(action.type) ? player(action) : host(action);
        // autoBalance succeeds as a whole; it just skips the id.
        if (action.type !== "team/autoBalance") expect(res.ok, `${action.type} ${id}`).toBe(false);
      }
    }
    expect(player({ type: "player/join", playerId: "__proto__", name: "Eve", signature: null }).ok).toBe(false);
    expect(host({ type: "team/create", teamId: "__proto__", name: "Evil", color: "#000" }).ok).toBe(false);
    // Final: a wager reveal for an id that is not a contestant.
    host({ type: "score/adjust", contestantId: "a", delta: 100 });
    host({ type: "final/start" });
    host({ type: "final/showClue" });
    host({ type: "final/startTimer" });
    host({ type: "final/close" });
    host({ type: "final/reveal", contestantId: "a" });
    for (const id of BAD) {
      expect(host({ type: "final/judge", contestantId: id, correct: true }).ok).toBe(false);
      expect(host({ type: "final/showWager", contestantId: id }).ok).toBe(false);
      expect(host({ type: "final/hostWager", contestantId: id, amount: 0 }).ok).toBe(false);
    }
    expect(clean()).toBe(true);
    expect(Object.keys(g.state.players)).toEqual(["a", "b", "c"]);
    expect(Object.keys(g.state.scores).sort()).toEqual(["a", "b", "c", "t1"]);
    void clue;
  });

  it("are skipped when an old saved log is replayed", () => {
    const b = board();
    const entry = (seq: number, action: GameAction): LogEntry => ({ seq, at: 1000 + seq, by: "host:u1", action });
    const log: LogEntry[] = [
      entry(1, { type: "player/join", playerId: "a", name: "Ann", signature: null }),
      entry(2, { type: "player/rename", playerId: "__proto__", name: "pwned" }),
      entry(3, { type: "player/kick", playerId: "constructor" }),
      entry(4, { type: "player/ban", playerId: "__proto__" }),
      entry(5, { type: "score/adjust", contestantId: "__proto__", delta: 100 }),
      entry(6, { type: "player/rename", playerId: "a", name: "Anna" }),
    ];
    const g = new GameHistory({ board: b, settings: DEFAULT_SETTINGS }, log);
    expect(clean()).toBe(true);
    expect(g.state.players.a.name).toBe("Anna");
    expect(g.state.bannedNames).toEqual([]);
    expect(g.state.scoreEvents).toEqual([]);
    expect(({} as { name?: string }).name).toBeUndefined();
  });
});

describe("hard limits on a room", () => {
  it("applies a ceiling to players and audience while the host's own limit is 0", () => {
    const ctx = game({ maxPlayers: 0, maxAudience: 0 });
    for (let i = 0; i < HARD_MAX_PLAYERS; i++) ctx.player({ type: "player/join", playerId: `p${i}`, name: `P${i}`, signature: null });
    expect(ctx.player({ type: "player/join", playerId: "extra", name: "Extra", signature: null }).ok).toBe(false);
    ctx.host({ type: "player/kick", playerId: "p0" });
    expect(ctx.player({ type: "player/join", playerId: "extra", name: "Extra", signature: null }).ok).toBe(true);
    // An explicit limit from the host still wins.
    ctx.host({ type: "settings/update", settings: { maxPlayers: HARD_MAX_PLAYERS + 1 } });
    expect(ctx.player({ type: "player/join", playerId: "one-more", name: "One More", signature: null }).ok).toBe(true);

    const crowd = game();
    const s = crowd.g.state;
    for (let i = 0; i < HARD_MAX_AUDIENCE; i++) {
      s.players[`w${i}`] = { id: `w${i}`, name: `W${i}`, signature: null, signatureHidden: false, teamId: null, joinedAt: 0, index: i, removed: false, banned: false, audience: true };
      s.playerOrder.push(`w${i}`);
    }
    expect(crowd.player({ type: "player/join", playerId: "w-extra", name: "Extra", signature: null, audience: true }).ok).toBe(false);
  });
});

