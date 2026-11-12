import { describe, expect, it } from "vitest";
import { WALL, type LobbyGameKind, type MiniX } from "@/shared/minigames";
import { LobbyGames, MINI_COUNTDOWN_MS } from "../lobbyGames";
import { GUESS_QUESTIONS, DOODLE_WORDS } from "./content";

const T0 = 1000;
const START = T0 + MINI_COUNTDOWN_MS;

/** A round of one game with these players in, taken to the moment it starts. */
function round(kind: LobbyGameKind, players: string[], random: () => number = () => 0) {
  const g = new LobbyGames(random);
  g.configure({ kind, mix: false });
  for (const p of players) g.tap(p, {}, T0);
  const x = (viewer: string | null = null, now = START) => g.view(now, viewer === null, viewer).round!.x as MiniX;
  return { g, x, round: (now: number) => g.view(now, true).round! };
}

describe("starting a bigger game", () => {
  it("does not run with too few players, and keeps latecomers out of a round in progress", () => {
    const solo = round("potato", ["a"]);
    expect(solo.round(START)).toMatchObject({ phase: "done", winnerId: null });
    expect(solo.round(START).winnerText).toContain("needs 2 players");

    const r = round("likely", ["a", "b", "c"]);
    r.round(START);
    expect(r.g.tap("late", { target: "a" }, START + 10).data.error).toContain("next one");
    expect(r.round(START + 20).players).toBe(3);
  });

  it("shuffling skips games that need more people than are in the lobby", () => {
    const g = new LobbyGames(() => 0.99);
    g.headcount = 1;
    g.tap("a", {}, T0);
    g.stop();
    g.restart(T0);
    g.view(T0 + MINI_COUNTDOWN_MS + 45_000); // the race times out
    const after = g.view(T0 + MINI_COUNTDOWN_MS + 45_000 + 6001);
    expect(["pattern", "maze", "reflex", "clock", "count", "tug"]).toContain(after.kind);
  });
});

describe("hot potato", () => {
  it("passes only from the holder, pops, and ends with one pig left", () => {
    const r = round("potato", ["a", "b", "c"]);
    expect(r.x().holder).toBe("a");
    expect(r.g.tap("b", { target: "c" }, START + 10).changed).toBe(false);
    expect(r.g.tap("a", { target: "b" }, START + 20).changed).toBe(true);
    expect(r.x(null, START + 30).holder).toBe("b");
    expect(r.x(null, START + 3600)).toMatchObject({ gone: ["b"], alive: ["a", "c"] }); // fuse 3.5 s with random 0
    expect(r.round(START + 3600).out).toBe(1);
    const end = r.round(START + 7200);
    expect(end).toMatchObject({ phase: "done", winnerId: "c" });
  });
});

describe("mud fight", () => {
  it("a throw hits unless the target ducks; no mud, no throw; no ducking twice", () => {
    const r = round("mud", ["a", "b", "c"]);
    r.round(START);
    r.g.tap("a", { act: "throw", target: "b" }, START + 100);
    expect(r.x("a", START + 100).mine).toMatchObject({ act: "throw", target: "b" });
    expect(r.x("b", START + 100).mine?.act).toBeUndefined(); // choices are private
    r.g.tap("b", { act: "duck" }, START + 200);
    r.g.tap("c", { act: "throw", target: "a" }, START + 300);
    const reveal = r.x(null, START + 300);
    expect(reveal.stage).toBe("reveal");
    expect(reveal.alive).toEqual(["b", "c"]);
    expect(reveal.acts!.find((a) => a.id === "a")!.hit).toBe(true);
    // next turn
    r.round(START + 300 + 3600);
    expect(r.g.tap("b", { act: "duck" }, START + 4000).data.error).toContain("twice");
    expect(r.g.tap("c", { act: "throw", target: "b" }, START + 4100).data.error).toContain("No mud");
  });
});

describe("pig sumo", () => {
  it("a pig that steers out of the ring loses", () => {
    const r = round("sumo", ["a", "b"]);
    r.round(START);
    r.g.tap("a", { x: 1, y: 0 }, START + 10); // a starts on the right edge side and keeps going
    let t = START;
    while (r.round(t).phase === "running" && t < START + 20_000) t += 66;
    expect(r.round(t)).toMatchObject({ phase: "done", winnerId: "b" });
    expect(r.round(t).x!.pigs!.find((p) => p.id === "a")!.out).toBe(true);
  });
});

describe("doodle guess", () => {
  it("only the artist sees the word; the first right guess wins", () => {
    const r = round("doodle", ["a", "b", "c"]);
    const word = DOODLE_WORDS[0];
    expect(r.x("a").word).toBe(word);
    expect(r.x("b").word).toBeUndefined();
    expect(r.x(null).word).toBeUndefined(); // not on the big screen either
    expect(r.x("b").letters).toBe(word.length);
    const ink = { v: 1 as const, w: 800, h: 450, strokes: [{ c: "#ffffff", s: 10, p: [[1, 1, 0.5] as [number, number, number]] }] };
    expect(r.g.tap("b", { ink }, START + 10).changed).toBe(false); // not the artist
    expect(r.g.tap("a", { ink }, START + 20).changed).toBe(true);
    r.g.tap("b", { text: "a cow?" }, START + 30);
    expect(r.g.tap("c", { text: "shit" }, START + 40).data.error).toContain("clean");
    expect(r.round(START + 50).hideable).toEqual([{ key: "ink", label: "The drawing" }, { key: "g0", label: "a cow?" }]);
    r.g.tap("c", { text: ` ${word.toUpperCase()}! ` }, START + 60);
    const end = r.round(START + 60);
    expect(end).toMatchObject({ phase: "done", winnerId: "c" });
    expect(end.x!.word).toBe(word);
  });
});

describe("caption vote", () => {
  it("collects answers, hides who wrote them while voting, and counts votes", () => {
    const r = round("caption", ["a", "b", "c"]);
    r.round(START);
    r.g.tap("a", { text: "Answer A" }, START + 10);
    r.g.tap("b", { text: "Answer B" }, START + 20);
    expect(r.x(null, START + 30)).toMatchObject({ stage: "write", wrote: 2 });
    r.g.tap("c", { text: "Answer C" }, START + 40);
    const vote = r.x("a", START + 50);
    expect(vote.stage).toBe("vote");
    expect(vote.options!.every((o) => o.by === undefined)).toBe(true);
    const own = vote.mine!.own!;
    expect(r.g.tap("a", { pick: own }, START + 60).data.error).toContain("own");
    const bAt = vote.options!.findIndex((o) => o.text === "Answer B");
    r.g.tap("a", { pick: bAt }, START + 70);
    r.g.tap("c", { pick: bAt }, START + 80);
    r.g.tap("b", { pick: own }, START + 90);
    const end = r.round(START + 90);
    expect(end).toMatchObject({ phase: "done", winnerId: "b", winnerText: '"Answer B"' });
    expect(end.x!.options!.find((o) => o.by === "b")!.votes).toBe(2);
  });
});

describe("doodle chain", () => {
  it("gives each player a drawing turn, then asks for titles", () => {
    const r = round("chain", ["a", "b", "c"]);
    const first = r.x(null, START).drawer!;
    const ink = { v: 1 as const, w: 800, h: 450, strokes: [{ c: "#ffffff", s: 10, p: [[1, 1, 0.5] as [number, number, number]] }] };
    const other = ["a", "b", "c"].find((p) => p !== first)!;
    expect(r.g.tap(other, { ink }, START + 10).changed).toBe(false);
    expect(r.g.tap(first, { ink }, START + 20).changed).toBe(true);
    let t = START;
    while (r.x(null, t).stage === "draw" && t < START + 200_000) t += 1000;
    expect(t - START).toBeGreaterThanOrEqual(6 * 12_000); // three players go round twice
    const write = r.x(null, t);
    expect(write).toMatchObject({ stage: "write", prompt: "Give this masterpiece a title" });
    expect(write.ink!.strokes.length).toBe(1);
  });
});

describe("most likely to", () => {
  it("crowns whoever gets the most votes, and calls a tie a tie", () => {
    const r = round("likely", ["a", "b", "c"]);
    r.round(START);
    r.g.tap("a", { target: "c" }, START + 10);
    r.g.tap("b", { target: "c" }, START + 20);
    r.g.tap("c", { target: "a" }, START + 30);
    expect(r.round(START + 30)).toMatchObject({ phase: "done", winnerId: "c", winnerText: "2 of 3 votes" });

    const tie = round("likely", ["a", "b", "c"]);
    tie.round(START);
    tie.g.tap("a", { target: "b" }, START + 10);
    tie.g.tap("b", { target: "a" }, START + 20);
    expect(tie.round(START + 20_001)).toMatchObject({ phase: "done", winnerId: null, winnerText: "It's a tie!" });
  });
});

describe("closest guess", () => {
  it("keeps guesses and the answer back until the end, then picks the closest", () => {
    const r = round("guess", ["a", "b"]);
    const answer = GUESS_QUESTIONS[0].a;
    r.round(START);
    r.g.tap("a", { pick: answer + 50 }, START + 10);
    expect(r.x(null, START + 20).answer).toBeUndefined();
    expect(r.x("a", START + 20).mine!.value).toBe(answer + 50);
    r.g.tap("a", { pick: answer }, START + 30); // one guess each
    r.g.tap("b", { pick: answer - 10 }, START + 40);
    const end = r.round(START + 40);
    expect(end).toMatchObject({ phase: "done", winnerId: "b" });
    expect(end.x).toMatchObject({ answer, values: [{ id: "b", value: answer - 10 }, { id: "a", value: answer + 50 }] });
  });
});

describe("split the room", () => {
  it("reports the bigger side", () => {
    const r = round("split", ["a", "b", "c"]);
    r.round(START);
    r.g.tap("a", { pick: 1 }, START + 10);
    r.g.tap("b", { pick: 1 }, START + 20);
    r.g.tap("c", { pick: 0 }, START + 30);
    const end = r.round(START + 30);
    expect(end.phase).toBe("done");
    expect(end.x!.counts).toEqual([1, 2]);
    expect(end.winnerText).toContain("2 to 1");
  });
});

describe("copy the pattern", () => {
  it("puts out a wrong tap and carries on with whoever is left", () => {
    const r = round("pattern", ["a", "b"]); // random 0: every colour is 0
    expect(r.x(null, START)).toMatchObject({ stage: "show", seq: [0, 0, 0] });
    expect(r.g.tap("a", { pick: 0 }, START + 100).changed).toBe(false); // still showing
    const go = START + 800 + 3 * 650;
    expect(r.x(null, go).stage).toBe("input");
    r.g.tap("a", { pick: 0 }, go + 10);
    r.g.tap("b", { pick: 2 }, go + 20);
    expect(r.x(null, go + 30)).toMatchObject({ alive: ["a"], gone: ["b"] });
    r.g.tap("a", { pick: 0 }, go + 40);
    r.g.tap("a", { pick: 0 }, go + 50);
    expect(r.round(go + 50)).toMatchObject({ phase: "done", winnerId: "a", winnerText: "remembered 3 colours" });
  });
});

describe("pig maze", () => {
  it("builds a maze with a way through, and walls stop a pig", () => {
    let seed = 7;
    const random = () => ((seed = (seed * 1103515245 + 12345) & 0x7fffffff) / 0x7fffffff);
    const r = round("maze", ["a"], random);
    const m = r.x(null, START);
    const { w, h, walls } = m as Required<Pick<MiniX, "w" | "h" | "walls">>;
    // Walk the maze: the corn in the far corner must be reachable from the start.
    const steps: [number, number, number][] = [[0, -1, WALL.N], [1, 0, WALL.E], [0, 1, WALL.S], [-1, 0, WALL.W]];
    const seen = new Set([0]);
    const queue = [0];
    const from = new Map<number, [number, number]>();
    while (queue.length) {
      const c = queue.shift()!;
      steps.forEach(([dx, dy, wall], dir) => {
        const x = (c % w) + dx;
        const y = Math.floor(c / w) + dy;
        if (x < 0 || y < 0 || x >= w || y >= h || walls[c] & wall || seen.has(y * w + x)) return;
        seen.add(y * w + x);
        from.set(y * w + x, [c, dir]);
        queue.push(y * w + x);
      });
    }
    expect(seen.has(w * h - 1)).toBe(true);
    // A move into a wall does nothing.
    const blocked = steps.findIndex(([, , wall]) => walls[0] & wall);
    expect(r.g.tap("a", { dir: blocked }, START + 100).changed).toBe(false);
    // Follow the path to the corn.
    const path: number[] = [];
    for (let c = w * h - 1; c !== 0; c = from.get(c)![0]) path.unshift(from.get(c)![1]);
    let t = START + 200;
    for (const dir of path) expect(r.g.tap("a", { dir }, (t += 100)).changed).toBe(true);
    expect(r.round(t)).toMatchObject({ phase: "done", winnerId: "a" });
  });
});
