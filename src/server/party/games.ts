import { DOODLE_CANVAS, PATTERN_COLORS, WALL, type LobbyGameKind, type MiniX, type TapInput } from "@/shared/minigames";
import type { Drawing } from "@/shared/strokes";
import { containsProfanity } from "../profanity";
import { CAPTION_PROMPTS, DOODLE_WORDS, GUESS_QUESTIONS, LIKELY_PROMPTS, SPLIT_QUESTIONS } from "./content";

export interface PartyResult {
  winnerId: string | null;
  text: string | null;
}

/** What a player's input did: whether screens need a fresh picture, and any refusal to show them. */
export interface PartyAck {
  changed: boolean;
  error?: string;
}

/**
 * One round of a bigger lobby game. `LobbyGames` runs the countdown and shows the result;
 * the game itself decides what happens in between and sets `result` when it is over.
 */
export abstract class Party {
  players: string[] = [];
  result: PartyResult | null = null;
  constructor(protected random: () => number) {}

  /** The countdown is over: the round begins with these players. */
  abstract start(players: string[], now: number): void;
  abstract input(id: string, msg: TapInput, now: number): PartyAck;
  /** Move time along. Returns when to look again. */
  abstract tick(now: number): number;
  /** `viewer`: a player's id, or null for the big screen and the host. */
  abstract view(viewer: string | null, done: boolean): MiniX;
  /** How many are out, for the "someone is out" sound. */
  outCount(): number {
    return 0;
  }
  drop(id: string): void {
    this.players = this.players.filter((p) => p !== id);
  }
  /** Things players typed or drew, for the host to remove. */
  hideable(): { key: string; label: string }[] {
    return [];
  }
  hide(_key: string): void {}

  protected pick<T>(list: readonly T[]): T {
    return list[Math.min(list.length - 1, Math.floor(this.random() * list.length))];
  }
  protected shuffled<T>(list: readonly T[]): T[] {
    const out = [...list];
    for (let i = out.length - 1; i > 0; i--) {
      const j = Math.floor(this.random() * (i + 1));
      [out[i], out[j]] = [out[j], out[i]];
    }
    return out;
  }
}

const NO: PartyAck = { changed: false };
const YES: PartyAck = { changed: true };

/** Typed text shown on the big screen: tidy it, and refuse rude words. */
function cleanText(text: string | undefined, max: number): { text: string } | { error: string } {
  const t = (text ?? "").replace(/[\u0000-\u001f\u007f]/g, "").replace(/\s+/g, " ").trim().slice(0, max);
  if (!t) return { error: "Type something first" };
  if (containsProfanity(t)) return { error: "Keep it clean: try different words" };
  return { text: t };
}

function inkPoints(d: Drawing): number {
  return d.strokes.reduce((n, s) => n + s.p.length, 0);
}
/** Live drawings are sent to every screen many times, so they are kept smaller than a signature. */
const MAX_LIVE_POINTS = 6000;

// ---------------------------------------------------------------- hot potato
export class Potato extends Party {
  private alive: string[] = [];
  private gone: string[] = [];
  private holder: string | null = null;
  private popAt = 0;

  private fuse(): number {
    return 3500 + Math.floor(this.random() * 5000);
  }
  start(players: string[], now: number) {
    this.players = players;
    this.alive = [...players];
    this.holder = this.pick(this.alive);
    this.popAt = now + this.fuse();
  }
  input(id: string, msg: TapInput): PartyAck {
    if (id !== this.holder || !msg.target || msg.target === id || !this.alive.includes(msg.target)) return NO;
    this.holder = msg.target;
    return YES;
  }
  private settle(now: number) {
    if (this.alive.length <= 1) this.result = { winnerId: this.alive[0] ?? null, text: this.alive.length ? "Last pig standing" : "Everybody popped" };
    else {
      this.holder = this.pick(this.alive);
      this.popAt = now + this.fuse();
    }
  }
  tick(now: number): number {
    if (!this.result && now >= this.popAt && this.holder) {
      this.gone.push(this.holder);
      this.alive = this.alive.filter((p) => p !== this.holder);
      this.settle(now);
    }
    return this.popAt;
  }
  drop(id: string) {
    super.drop(id);
    if (!this.alive.includes(id)) return;
    this.alive = this.alive.filter((p) => p !== id);
    if (this.holder === id || this.alive.length <= 1) this.settle(this.popAt);
  }
  outCount() {
    return this.gone.length;
  }
  view(): MiniX {
    return { alive: this.alive, gone: this.gone, holder: this.result ? null : this.holder };
  }
}

// ------------------------------------------------------------------ mud fight
type MudAct = { act: "throw" | "duck" | "reload"; target?: string };
export class MudFight extends Party {
  static CHOOSE_MS = 7000;
  static REVEAL_MS = 3500;
  static MAX_TURNS = 10;
  private alive: string[] = [];
  private gone: string[] = [];
  private mud = new Map<string, number>();
  private ducked = new Set<string>();
  private choices = new Map<string, MudAct>();
  private acts: NonNullable<MiniX["acts"]> = [];
  private stage: "choose" | "reveal" = "choose";
  private endsAt = 0;
  private turn = 1;

  start(players: string[], now: number) {
    this.players = players;
    this.alive = [...players];
    for (const p of players) this.mud.set(p, 1);
    this.endsAt = now + MudFight.CHOOSE_MS;
  }
  input(id: string, msg: TapInput, now: number): PartyAck {
    if (this.stage !== "choose" || !this.alive.includes(id) || !msg.act) return NO;
    if (msg.act === "throw") {
      if ((this.mud.get(id) ?? 0) < 1) return { changed: false, error: "No mud! Scoop some first" };
      if (!msg.target || msg.target === id || !this.alive.includes(msg.target)) return NO;
      this.choices.set(id, { act: "throw", target: msg.target });
    } else if (msg.act === "duck") {
      if (this.ducked.has(id)) return { changed: false, error: "You cannot duck twice in a row" };
      this.choices.set(id, { act: "duck" });
    } else this.choices.set(id, { act: "reload" });
    if (this.alive.every((p) => this.choices.has(p))) this.resolve(now);
    return YES;
  }
  private resolve(now: number) {
    const act = (p: string): MudAct => this.choices.get(p) ?? { act: "reload" };
    const hit = new Set<string>();
    for (const p of this.alive) {
      const a = act(p);
      if (a.act === "throw" && a.target) {
        this.mud.set(p, (this.mud.get(p) ?? 1) - 1);
        if (act(a.target).act !== "duck") hit.add(a.target);
      } else if (a.act === "reload") this.mud.set(p, Math.min(3, (this.mud.get(p) ?? 0) + 1));
    }
    this.acts = this.alive.map((p) => ({ id: p, ...act(p), hit: hit.has(p) }));
    this.ducked = new Set(this.alive.filter((p) => act(p).act === "duck"));
    this.gone.push(...this.alive.filter((p) => hit.has(p)));
    this.alive = this.alive.filter((p) => !hit.has(p));
    this.choices.clear();
    this.stage = "reveal";
    this.endsAt = now + MudFight.REVEAL_MS;
  }
  tick(now: number): number {
    if (this.result || now < this.endsAt) return this.endsAt;
    if (this.stage === "choose") this.resolve(now);
    else if (this.alive.length <= 1) this.result = { winnerId: this.alive[0] ?? null, text: this.alive.length ? "The only clean pig" : "Everyone got muddy" };
    else if (this.turn >= MudFight.MAX_TURNS) this.result = { winnerId: null, text: `${this.alive.length} pigs stayed clean` };
    else {
      this.turn++;
      this.stage = "choose";
      this.endsAt = now + MudFight.CHOOSE_MS;
    }
    return this.endsAt;
  }
  drop(id: string) {
    super.drop(id);
    this.alive = this.alive.filter((p) => p !== id);
    this.choices.delete(id);
  }
  outCount() {
    return this.gone.length;
  }
  view(viewer: string | null): MiniX {
    const mine = viewer ? this.choices.get(viewer) : undefined;
    return {
      stage: this.stage,
      endsAt: this.endsAt,
      turn: this.turn,
      alive: this.alive,
      gone: this.gone,
      mud: Object.fromEntries(this.mud),
      chosen: this.choices.size,
      acts: this.stage === "reveal" ? this.acts : undefined,
      mine: viewer ? { act: mine?.act, target: mine?.target, canDuck: !this.ducked.has(viewer) } : undefined,
    };
  }
}

// ------------------------------------------------------------------- pig sumo
interface SumoPig {
  x: number;
  y: number;
  vx: number;
  vy: number;
  ix: number;
  iy: number;
  out: boolean;
}
export class Sumo extends Party {
  static RADIUS = 0.11;
  static MAX_MS = 45_000;
  private pigs = new Map<string, SumoPig>();
  private gone: string[] = [];
  private last = 0;
  private endsAt = 0;

  start(players: string[], now: number) {
    this.players = players;
    players.forEach((p, i) => {
      const a = (i / players.length) * Math.PI * 2;
      this.pigs.set(p, { x: Math.cos(a) * 0.5, y: Math.sin(a) * 0.5, vx: 0, vy: 0, ix: 0, iy: 0, out: false });
    });
    this.last = now;
    this.endsAt = now + Sumo.MAX_MS;
  }
  /** Steering only changes what the next step does, so it never asks for a broadcast by itself. */
  input(id: string, msg: TapInput): PartyAck {
    const pig = this.pigs.get(id);
    if (!pig || pig.out) return NO;
    const x = Number.isFinite(msg.x) ? (msg.x as number) : 0;
    const y = Number.isFinite(msg.y) ? (msg.y as number) : 0;
    const len = Math.hypot(x, y);
    pig.ix = len > 1 ? x / len : x;
    pig.iy = len > 1 ? y / len : y;
    return NO;
  }
  private step(dt: number) {
    const live = [...this.pigs.entries()].filter(([, p]) => !p.out);
    for (const [, p] of live) {
      p.vx += p.ix * 1.8 * dt;
      p.vy += p.iy * 1.8 * dt;
      const drag = Math.max(0, 1 - 1.8 * dt);
      p.vx *= drag;
      p.vy *= drag;
      p.x += p.vx * dt;
      p.y += p.vy * dt;
    }
    for (let i = 0; i < live.length; i++) {
      for (let j = i + 1; j < live.length; j++) {
        const a = live[i][1];
        const b = live[j][1];
        const dx = b.x - a.x;
        const dy = b.y - a.y;
        const dist = Math.hypot(dx, dy) || 0.0001;
        if (dist >= Sumo.RADIUS * 2) continue;
        const nx = dx / dist;
        const ny = dy / dist;
        const push = (Sumo.RADIUS * 2 - dist) / 2;
        a.x -= nx * push;
        a.y -= ny * push;
        b.x += nx * push;
        b.y += ny * push;
        // Swap the speed along the line between them, with a little extra bounce.
        const rel = (b.vx - a.vx) * nx + (b.vy - a.vy) * ny;
        if (rel < 0) {
          const kick = rel * 1.15;
          a.vx += nx * kick;
          a.vy += ny * kick;
          b.vx -= nx * kick;
          b.vy -= ny * kick;
        }
      }
    }
    for (const [id, p] of live) {
      if (Math.hypot(p.x, p.y) > 1) {
        p.out = true;
        this.gone.push(id);
      }
    }
  }
  tick(now: number): number {
    if (this.result) return now + 1000;
    let steps = Math.min(12, Math.floor((now - this.last) / 33));
    this.last += steps * 33;
    if (now - this.last > 400) this.last = now; // a long pause: do not try to catch up
    while (steps-- > 0 && !this.result) {
      this.step(0.033);
      const live = [...this.pigs.entries()].filter(([, p]) => !p.out);
      if (live.length <= 1) this.result = { winnerId: live[0]?.[0] ?? null, text: live.length ? "Last pig in the ring" : "Everybody fell out" };
    }
    if (!this.result && now >= this.endsAt) {
      const live = [...this.pigs.entries()].filter(([, p]) => !p.out).sort((a, b) => Math.hypot(a[1].x, a[1].y) - Math.hypot(b[1].x, b[1].y));
      this.result = { winnerId: live[0]?.[0] ?? null, text: "Closest to the middle when time ran out" };
    }
    return now + 60;
  }
  drop(id: string) {
    super.drop(id);
    const pig = this.pigs.get(id);
    if (pig) pig.out = true;
  }
  outCount() {
    return this.gone.length;
  }
  view(): MiniX {
    const r = (n: number) => Math.round(n * 1000) / 1000;
    return { endsAt: this.endsAt, pigs: [...this.pigs.entries()].map(([id, p]) => ({ id, x: r(p.x), y: r(p.y), out: p.out })) };
  }
}

// --------------------------------------------------------------- doodle guess
export class Doodle extends Party {
  static MAX_MS = 60_000;
  private drawer: string | null = null;
  private word = "";
  private ink: Drawing | null = null;
  private guesses: { by: string; text: string }[] = [];
  private endsAt = 0;

  start(players: string[], now: number) {
    this.players = players;
    this.drawer = this.pick(players);
    this.word = this.pick(DOODLE_WORDS);
    this.endsAt = now + Doodle.MAX_MS;
  }
  input(id: string, msg: TapInput): PartyAck {
    if (id === this.drawer) {
      if (!msg.ink) return NO;
      if (inkPoints(msg.ink) > MAX_LIVE_POINTS) return { changed: false, error: "That drawing is full. Erase something to keep going." };
      this.ink = msg.ink;
      return YES;
    }
    if (msg.text === undefined) return NO;
    const letters = (s: string) => s.toLowerCase().replace(/[^a-z]/g, "");
    if (letters(msg.text) === letters(this.word)) {
      this.result = { winnerId: id, text: `It was "${this.word}"` };
      return YES;
    }
    const clean = cleanText(msg.text, 30);
    if ("error" in clean) return { changed: false, error: clean.error };
    this.guesses = [...this.guesses, { by: id, text: clean.text }].slice(-6);
    return YES;
  }
  tick(now: number): number {
    if (!this.result && now >= this.endsAt) this.result = { winnerId: null, text: `Nobody got it. It was "${this.word}"` };
    return this.endsAt;
  }
  drop(id: string) {
    super.drop(id);
    if (id === this.drawer && !this.result) this.result = { winnerId: null, text: `The artist left. It was "${this.word}"` };
  }
  hideable() {
    return [...(this.ink?.strokes.length ? [{ key: "ink", label: "The drawing" }] : []), ...this.guesses.map((g, i) => ({ key: `g${i}`, label: g.text }))];
  }
  hide(key: string) {
    if (key === "ink") {
      this.ink = null;
      if (!this.result) this.result = { winnerId: null, text: "The host removed the drawing" };
    } else this.guesses = this.guesses.filter((_, i) => `g${i}` !== key);
  }
  view(viewer: string | null, done: boolean): MiniX {
    return { drawer: this.drawer, ink: this.ink, endsAt: this.endsAt, guesses: this.guesses, letters: this.word.length, word: done || (viewer !== null && viewer === this.drawer) ? this.word : undefined };
  }
}

// ------------------------------------------------------- write, then vote
/** Everyone writes a short answer, then votes for somebody else's. Used by two games. */
class WriteVote {
  static WRITE_MS = 30_000;
  static VOTE_MS = 20_000;
  stage: "write" | "vote" = "write";
  endsAt = 0;
  result: PartyResult | null = null;
  private answers = new Map<string, string>();
  private order: string[] = [];
  private votes = new Map<string, string>();

  constructor(
    public prompt: string,
    private players: () => string[],
    private shuffle: (ids: string[]) => string[],
  ) {}

  begin(now: number) {
    this.stage = "write";
    this.endsAt = now + WriteVote.WRITE_MS;
  }
  input(id: string, msg: TapInput, now: number): PartyAck {
    if (!this.players().includes(id)) return NO;
    if (this.stage === "write") {
      if (msg.text === undefined) return NO;
      const clean = cleanText(msg.text, 60);
      if ("error" in clean) return { changed: false, error: clean.error };
      this.answers.set(id, clean.text);
      if (this.players().every((p) => this.answers.has(p))) this.toVote(now);
      return YES;
    }
    const author = msg.pick === undefined ? undefined : this.order[msg.pick];
    if (!author) return NO;
    if (author === id) return { changed: false, error: "You cannot vote for your own" };
    this.votes.set(id, author);
    if (this.players().every((p) => this.votes.has(p))) this.finish();
    return YES;
  }
  private toVote(now: number) {
    this.order = this.shuffle([...this.answers.keys()]);
    if (this.order.length < 2) {
      this.result = { winnerId: null, text: "Not enough answers to vote on" };
      return;
    }
    this.stage = "vote";
    this.endsAt = now + WriteVote.VOTE_MS;
  }
  private count(author: string): number {
    return [...this.votes.values()].filter((a) => a === author).length;
  }
  private finish() {
    const ranked = [...this.order].sort((a, b) => this.count(b) - this.count(a));
    const top = ranked[0];
    if (!top || this.count(top) === 0) this.result = { winnerId: null, text: "Nobody voted" };
    else if (ranked[1] && this.count(ranked[1]) === this.count(top)) this.result = { winnerId: null, text: "It's a tie!" };
    else this.result = { winnerId: top, text: `"${this.answers.get(top)}"` };
  }
  tick(now: number): number {
    if (!this.result && now >= this.endsAt) {
      if (this.stage === "write") this.toVote(now);
      else this.finish();
    }
    return this.endsAt;
  }
  drop(id: string) {
    this.answers.delete(id);
    this.votes.delete(id);
  }
  hideable() {
    return this.stage === "vote" ? this.order.map((id, i) => ({ key: `a${i}`, label: this.answers.get(id) ?? "" })) : [];
  }
  hide(key: string) {
    const author = this.order.find((_, i) => `a${i}` === key);
    if (!author) return;
    this.order = this.order.filter((a) => a !== author);
    this.answers.delete(author);
    for (const [voter, a] of this.votes) if (a === author) this.votes.delete(voter);
  }
  view(viewer: string | null, done: boolean): MiniX {
    const voting = this.stage === "vote";
    return {
      stage: this.stage,
      endsAt: this.endsAt,
      prompt: this.prompt,
      wrote: this.answers.size,
      voted: this.votes.size,
      // Who wrote what stays secret until the round is over.
      options: voting ? this.order.map((id) => ({ text: this.answers.get(id) ?? "", ...(done ? { by: id, votes: this.count(id) } : {}) })) : undefined,
      mine: viewer ? { wrote: this.answers.has(viewer), voted: this.votes.has(viewer), own: this.order.indexOf(viewer) } : undefined,
    };
  }
}

export class Caption extends Party {
  private wv = new WriteVote(this.pick(CAPTION_PROMPTS), () => this.players, (ids) => this.shuffled(ids));
  start(players: string[], now: number) {
    this.players = players;
    this.wv.begin(now);
  }
  input(id: string, msg: TapInput, now: number): PartyAck {
    const ack = this.wv.input(id, msg, now);
    this.result = this.wv.result;
    return ack;
  }
  tick(now: number): number {
    const next = this.wv.tick(now);
    this.result = this.wv.result;
    return next;
  }
  drop(id: string) {
    super.drop(id);
    this.wv.drop(id);
  }
  hideable() {
    return this.wv.hideable();
  }
  hide(key: string) {
    this.wv.hide(key);
  }
  view(viewer: string | null, done: boolean): MiniX {
    return this.wv.view(viewer, done);
  }
}

// --------------------------------------------------------------- doodle chain
export class Chain extends Party {
  static TURN_MS = 12_000;
  private order: string[] = [];
  private turn = 0;
  private ink: Drawing = { v: 1, ...DOODLE_CANVAS, strokes: [] };
  private drawing = true;
  private endsAt = 0;
  private wv = new WriteVote("Give this masterpiece a title", () => this.players, (ids) => this.shuffled(ids));

  start(players: string[], now: number) {
    this.players = players;
    // Everyone gets a turn; a small group goes round twice. Never more than eight turns.
    const once = this.shuffled(players);
    this.order = (players.length < 4 ? [...once, ...once] : once).slice(0, 8);
    this.endsAt = now + Chain.TURN_MS;
  }
  input(id: string, msg: TapInput, now: number): PartyAck {
    if (!this.drawing) {
      const ack = this.wv.input(id, msg, now);
      this.result = this.wv.result;
      return ack;
    }
    if (id !== this.order[this.turn] || !msg.ink) return NO;
    if (inkPoints(msg.ink) > MAX_LIVE_POINTS) return { changed: false, error: "The drawing is full. Erase something to keep going." };
    this.ink = msg.ink;
    return YES;
  }
  tick(now: number): number {
    if (!this.drawing) {
      const next = this.wv.tick(now);
      this.result = this.wv.result;
      return next;
    }
    if (now >= this.endsAt) {
      this.turn++;
      if (this.turn >= this.order.length) {
        this.drawing = false;
        this.wv.begin(now);
        return this.wv.endsAt;
      }
      this.endsAt = now + Chain.TURN_MS;
    }
    return this.endsAt;
  }
  drop(id: string) {
    super.drop(id);
    this.wv.drop(id);
    const at = this.order.indexOf(id, this.turn);
    if (this.drawing && at >= 0) this.order = this.order.filter((p, i) => i < this.turn || p !== id);
    if (this.drawing && this.turn >= this.order.length) this.endsAt = 0;
  }
  hideable() {
    return [...(this.ink.strokes.length ? [{ key: "ink", label: "The drawing" }] : []), ...this.wv.hideable()];
  }
  hide(key: string) {
    if (key === "ink") this.ink = { ...this.ink, strokes: [] };
    else this.wv.hide(key);
  }
  view(viewer: string | null, done: boolean): MiniX {
    if (!this.drawing) return { ...this.wv.view(viewer, done), ink: this.ink };
    return { stage: "draw", endsAt: this.endsAt, drawer: this.order[this.turn] ?? null, ink: this.ink, turn: this.turn + 1, wrote: this.order.length };
  }
}

// ------------------------------------------------------------ most likely to
export class Likely extends Party {
  static MS = 20_000;
  private prompt = this.pick(LIKELY_PROMPTS);
  private votes = new Map<string, string>();
  private endsAt = 0;

  start(players: string[], now: number) {
    this.players = players;
    this.endsAt = now + Likely.MS;
  }
  private tally(): { id: string; votes: number }[] {
    return this.players.map((id) => ({ id, votes: [...this.votes.values()].filter((v) => v === id).length })).sort((a, b) => b.votes - a.votes);
  }
  private finish() {
    const t = this.tally();
    if (!t[0] || t[0].votes === 0) this.result = { winnerId: null, text: "Nobody voted" };
    else if (t[1] && t[1].votes === t[0].votes) this.result = { winnerId: null, text: "It's a tie!" };
    else this.result = { winnerId: t[0].id, text: `${t[0].votes} of ${this.votes.size} votes` };
  }
  input(id: string, msg: TapInput): PartyAck {
    if (!this.players.includes(id) || !msg.target || !this.players.includes(msg.target)) return NO;
    this.votes.set(id, msg.target);
    if (this.players.every((p) => this.votes.has(p))) this.finish();
    return YES;
  }
  tick(now: number): number {
    if (!this.result && now >= this.endsAt) this.finish();
    return this.endsAt;
  }
  drop(id: string) {
    super.drop(id);
    this.votes.delete(id);
    for (const [voter, v] of this.votes) if (v === id) this.votes.delete(voter);
  }
  view(viewer: string | null, done: boolean): MiniX {
    return { prompt: this.prompt, endsAt: this.endsAt, voted: this.votes.size, alive: this.players, tally: done ? this.tally() : undefined, mine: viewer ? { target: this.votes.get(viewer) } : undefined };
  }
}

// -------------------------------------------------------------- closest guess
export class Guess extends Party {
  static MS = 20_000;
  private question = this.pick(GUESS_QUESTIONS);
  private values = new Map<string, number>();
  private endsAt = 0;

  start(players: string[], now: number) {
    this.players = players;
    this.endsAt = now + Guess.MS;
  }
  private ranked(): { id: string; value: number }[] {
    // Map keeps the order people answered in, and sort is stable: a tie goes to the earlier guess.
    return [...this.values.entries()].map(([id, value]) => ({ id, value })).sort((a, b) => Math.abs(a.value - this.question.a) - Math.abs(b.value - this.question.a));
  }
  private finish() {
    const best = this.ranked()[0];
    this.result = best ? { winnerId: best.id, text: `guessed ${best.value}` } : { winnerId: null, text: "Nobody guessed" };
  }
  input(id: string, msg: TapInput): PartyAck {
    if (!this.players.includes(id) || this.values.has(id) || msg.pick === undefined) return NO;
    this.values.set(id, msg.pick);
    if (this.players.every((p) => this.values.has(p))) this.finish();
    return YES;
  }
  tick(now: number): number {
    if (!this.result && now >= this.endsAt) this.finish();
    return this.endsAt;
  }
  drop(id: string) {
    super.drop(id);
    this.values.delete(id);
  }
  view(viewer: string | null, done: boolean): MiniX {
    return {
      prompt: this.question.q,
      unit: this.question.unit,
      endsAt: this.endsAt,
      voted: this.values.size,
      answer: done ? this.question.a : undefined,
      values: done ? this.ranked().slice(0, 8) : undefined,
      mine: viewer ? { value: this.values.get(viewer) } : undefined,
    };
  }
}

// ------------------------------------------------------------- split the room
export class Split extends Party {
  static MS = 15_000;
  private question = this.pick(SPLIT_QUESTIONS);
  private sides = new Map<string, 0 | 1>();
  private endsAt = 0;

  start(players: string[], now: number) {
    this.players = players;
    this.endsAt = now + Split.MS;
  }
  private counts(): [number, number] {
    const b = [...this.sides.values()].filter((s) => s === 1).length;
    return [this.sides.size - b, b];
  }
  private finish() {
    const [a, b] = this.counts();
    if (a === b) this.result = { winnerId: null, text: a ? `Split right down the middle, ${a} each` : "Nobody picked a side" };
    else this.result = { winnerId: null, text: `Most picked "${a > b ? this.question.a : this.question.b}" (${Math.max(a, b)} to ${Math.min(a, b)})` };
  }
  input(id: string, msg: TapInput): PartyAck {
    if (!this.players.includes(id) || this.sides.has(id) || (msg.pick !== 0 && msg.pick !== 1)) return NO;
    this.sides.set(id, msg.pick);
    if (this.players.every((p) => this.sides.has(p))) this.finish();
    return YES;
  }
  tick(now: number): number {
    if (!this.result && now >= this.endsAt) this.finish();
    return this.endsAt;
  }
  drop(id: string) {
    super.drop(id);
    this.sides.delete(id);
  }
  view(viewer: string | null, done: boolean): MiniX {
    return {
      prompt: this.question.q,
      sideNames: [this.question.a, this.question.b],
      endsAt: this.endsAt,
      voted: this.sides.size,
      counts: done ? this.counts() : undefined,
      mine: viewer ? { side: this.sides.get(viewer) } : undefined,
    };
  }
}

// ----------------------------------------------------------- copy the pattern
export class Pattern extends Party {
  static FIRST = 3;
  static LAST = 9;
  private seq: number[] = [];
  private alive: string[] = [];
  private gone: string[] = [];
  private at = new Map<string, number>();
  private stage: "show" | "input" = "show";
  private shownAt = 0;
  private endsAt = 0;

  private show(now: number) {
    this.stage = "show";
    this.shownAt = now;
    this.endsAt = now + 800 + this.seq.length * 650;
    this.at.clear();
  }
  start(players: string[], now: number) {
    this.players = players;
    this.alive = [...players];
    for (let i = 0; i < Pattern.FIRST; i++) this.seq.push(Math.floor(this.random() * PATTERN_COLORS.length));
    this.show(now);
  }
  private out(id: string) {
    if (!this.alive.includes(id)) return;
    this.alive = this.alive.filter((p) => p !== id);
    this.gone.push(id);
  }
  private levelOver(now: number) {
    const before = this.alive.length;
    for (const p of [...this.alive]) if ((this.at.get(p) ?? 0) < this.seq.length) this.out(p);
    if (this.alive.length === 0) this.result = { winnerId: null, text: before > 1 ? `Nobody remembered all ${this.seq.length}` : `Slipped at ${this.seq.length} colours` };
    else if (this.alive.length === 1 && this.players.length > 1) this.result = { winnerId: this.alive[0], text: `remembered ${this.seq.length} colours` };
    else if (this.seq.length >= Pattern.LAST) this.result = this.alive.length === 1 ? { winnerId: this.alive[0], text: `remembered all ${Pattern.LAST} colours` } : { winnerId: null, text: `${this.alive.length} pigs remembered all ${Pattern.LAST}` };
    else {
      this.seq.push(Math.floor(this.random() * PATTERN_COLORS.length));
      this.show(now);
    }
  }
  input(id: string, msg: TapInput, now: number): PartyAck {
    if (this.stage !== "input" || !this.alive.includes(id) || msg.pick === undefined) return NO;
    const i = this.at.get(id) ?? 0;
    if (i >= this.seq.length) return NO;
    if (msg.pick === this.seq[i]) this.at.set(id, i + 1);
    else this.out(id);
    if (this.alive.every((p) => (this.at.get(p) ?? 0) >= this.seq.length)) this.levelOver(now);
    return YES;
  }
  tick(now: number): number {
    if (this.result || now < this.endsAt) return this.endsAt;
    if (this.stage === "show") {
      this.stage = "input";
      this.endsAt = now + 3000 + this.seq.length * 1200;
    } else this.levelOver(now);
    return this.endsAt;
  }
  drop(id: string) {
    super.drop(id);
    this.alive = this.alive.filter((p) => p !== id);
  }
  outCount() {
    return this.gone.length;
  }
  view(viewer: string | null): MiniX {
    return {
      stage: this.stage,
      seq: this.seq,
      shownAt: this.shownAt,
      endsAt: this.endsAt,
      alive: this.alive,
      gone: this.gone,
      mine: viewer ? { at: this.at.get(viewer) ?? 0, finished: (this.at.get(viewer) ?? 0) >= this.seq.length } : undefined,
    };
  }
}

// ------------------------------------------------------------------- pig maze
const STEP: [number, number, number, number][] = [
  [0, -1, WALL.N, WALL.S],
  [1, 0, WALL.E, WALL.W],
  [0, 1, WALL.S, WALL.N],
  [-1, 0, WALL.W, WALL.E],
];
export class Maze extends Party {
  static W = 9;
  static H = 6;
  static MAX_MS = 60_000;
  static STEP_MS = 90;
  private walls: number[] = [];
  private at = new Map<string, { x: number; y: number; moved: number }>();
  private startedAt = 0;
  private endsAt = 0;

  private build() {
    const { W, H } = Maze;
    this.walls = Array.from({ length: W * H }, () => 15);
    const seen = new Set<number>([0]);
    const stack = [0];
    const open = (cell: number, dir: number) => {
      const [dx, dy, mine, theirs] = STEP[dir];
      const x = (cell % W) + dx;
      const y = Math.floor(cell / W) + dy;
      this.walls[cell] &= ~mine;
      this.walls[y * W + x] &= ~theirs;
    };
    const neighbour = (cell: number, dir: number): number | null => {
      const x = (cell % W) + STEP[dir][0];
      const y = Math.floor(cell / W) + STEP[dir][1];
      return x < 0 || y < 0 || x >= W || y >= H ? null : y * W + x;
    };
    while (stack.length) {
      const cell = stack[stack.length - 1];
      const dirs = this.shuffled([0, 1, 2, 3]).filter((d) => {
        const n = neighbour(cell, d);
        return n !== null && !seen.has(n);
      });
      if (!dirs.length) {
        stack.pop();
        continue;
      }
      const next = neighbour(cell, dirs[0])!;
      open(cell, dirs[0]);
      seen.add(next);
      stack.push(next);
    }
    // Knock out a few more walls so there is more than one way through.
    for (let i = 0; i < 7; i++) {
      const cell = Math.floor(this.random() * W * H);
      const dir = Math.floor(this.random() * 4);
      if (neighbour(cell, dir) !== null) open(cell, dir);
    }
  }
  start(players: string[], now: number) {
    this.players = players;
    this.build();
    for (const p of players) this.at.set(p, { x: 0, y: 0, moved: 0 });
    this.startedAt = now;
    this.endsAt = now + Maze.MAX_MS;
  }
  input(id: string, msg: TapInput, now: number): PartyAck {
    const me = this.at.get(id);
    const dir = msg.dir;
    if (!me || dir === undefined || !STEP[dir] || now - me.moved < Maze.STEP_MS) return NO;
    if (this.walls[me.y * Maze.W + me.x] & STEP[dir][2]) return NO;
    me.x += STEP[dir][0];
    me.y += STEP[dir][1];
    me.moved = now;
    if (me.x === Maze.W - 1 && me.y === Maze.H - 1) this.result = { winnerId: id, text: `${((now - this.startedAt) / 1000).toFixed(1)} s` };
    return YES;
  }
  tick(now: number): number {
    if (!this.result && now >= this.endsAt) this.result = { winnerId: null, text: "Nobody found the corn" };
    return this.endsAt;
  }
  drop(id: string) {
    super.drop(id);
    this.at.delete(id);
  }
  view(): MiniX {
    return { w: Maze.W, h: Maze.H, walls: this.walls, endsAt: this.endsAt, pigs: [...this.at.entries()].map(([id, p]) => ({ id, x: p.x, y: p.y })) };
  }
}

export const PARTY_GAMES: Partial<Record<LobbyGameKind, new (random: () => number) => Party>> = {
  potato: Potato,
  mud: MudFight,
  sumo: Sumo,
  doodle: Doodle,
  chain: Chain,
  caption: Caption,
  likely: Likely,
  guess: Guess,
  split: Split,
  pattern: Pattern,
  maze: Maze,
};
