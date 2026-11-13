import { CLOCK_TARGET_MS, COUNT_MAX, COUNT_MIN, LOBBY_GAMES, LOBBY_GAME_INFO, TUG_SIDES, type LobbyGameKind, type MiniRound, type MiniView, type TapInput, type TapResult } from "@/shared/minigames";
import { PARTY_GAMES, type Party } from "./party/games";

/** Taps to cross the finish line in the pig race. */
export const RACE_GOAL = 40;
export const MINI_COUNTDOWN_MS = 3000;
/** How long the winner stays on screen before the next round can start. */
export const MINI_RESULT_MS = 6000;
/** Lanes drawn on the big screen. */
export const RACE_LANES = 8;
/** Faster tapping than this is not counted (a script cannot win by sending big numbers). */
const TAPS_PER_SEC = 14;
/** Tug of war: taps one side must gain over the other, per person on the bigger side. */
const TUG_PER_PLAYER = 12;
/** How long a round may run before it ends by itself. */
const MAX_MS: Partial<Record<LobbyGameKind, number>> = { race: 45_000, reflex: 0, clock: 12_000, count: 20_000, tug: 30_000 };
/** The bigger games end themselves; this only stops one that somehow never does. */
const PARTY_MAX_MS = 5 * 60_000;

/**
 * Lobby games: something to do while the room fills up. A player's first tap (or the host)
 * starts a countdown, everyone in the lobby is in, the round runs, the winner is shown, and the next round can begin. All of it
 * lives in memory only: never in the game log, never in the database, no effect on the game.
 */
export class LobbyGames {
  kind: LobbyGameKind = "race";
  /** Move on to a different game after every round. */
  mix = true;
  /** How many players are in the lobby: shuffling skips games that need more people. */
  headcount = Infinity;
  /** Players in the lobby right now: all of them are in every round, with nothing to tap. */
  roster: string[] = [];
  /** The round of a bigger game (hot potato, doodle guess, …), when one is on. */
  private party: Party | null = null;
  private partyNext = 0;

  private id = 0;
  private phase: "idle" | "countdown" | "running" | "done" = "idle";
  private startsAt = 0;
  private endsAt = 0;
  private doneAt = 0;
  /** Everyone in the round. Race and tug: taps counted. Clock: when they stopped (-1 = not yet). */
  private score = new Map<string, number>();
  private lastTap = new Map<string, number>();
  private out = new Set<string>();
  private side = new Map<string, 0 | 1>();
  private pull = 0;
  private goAt = 0;
  private count = 0;
  private winnerId: string | null = null;
  private winnerText: string | null = null;
  private wins = new Map<string, number>();

  constructor(private random: () => number = Math.random) {}

  /** The host picks a game or switches shuffling. Changing the game ends the round in progress. */
  configure(opts: { kind?: LobbyGameKind; mix?: boolean }) {
    if (opts.mix !== undefined) this.mix = opts.mix;
    if (opts.kind && opts.kind !== this.kind) {
      this.kind = opts.kind;
      this.phase = "idle";
    }
  }

  /** Throw away the round in progress. */
  stop() {
    this.phase = "idle";
  }

  /** Start a fresh round of the current game now (whatever was going on). */
  restart(now: number) {
    this.begin(now);
  }

  private begin(now: number) {
    this.id++;
    this.phase = "countdown";
    this.startsAt = now + MINI_COUNTDOWN_MS;
    this.score.clear();
    this.lastTap.clear();
    this.out.clear();
    this.side.clear();
    this.pull = 0;
    this.winnerId = null;
    this.winnerText = null;
    this.goAt = this.startsAt + 2000 + Math.floor(this.random() * 4000);
    this.count = COUNT_MIN + Math.floor(this.random() * (COUNT_MAX - COUNT_MIN + 1));
    const Game = PARTY_GAMES[this.kind];
    this.party = Game ? new Game(this.random) : null;
    this.endsAt = this.party ? this.startsAt + PARTY_MAX_MS : this.kind === "reflex" ? this.goAt + 8000 : this.startsAt + (MAX_MS[this.kind] ?? 0);
    this.enroll();
  }

  /** Put everyone in the lobby into the round. */
  private enroll() {
    for (const id of this.roster) this.join(id);
  }

  /** The countdown is over: a bigger game starts if enough people are in. */
  private startParty(now: number) {
    if (!this.party) return;
    const need = LOBBY_GAME_INFO[this.kind].min ?? 1;
    if (this.score.size < need) return this.finish(now, null, `${LOBBY_GAME_INFO[this.kind].name} needs ${need} players.`);
    this.party.start([...this.score.keys()], now);
    this.partyNext = this.party.tick(now);
  }

  /** Let a bigger game move along, and end the round when it says it is over. */
  private stepParty(now: number) {
    if (!this.party || this.phase !== "running") return;
    this.partyNext = this.party.tick(now);
    if (this.party.result) this.finish(now, this.party.result.winnerId, this.party.result.text);
  }

  /** The host removes something a player typed or drew. */
  hide(key: string, now: number) {
    this.party?.hide(key);
    this.stepParty(now);
  }

  private join(playerId: string): boolean {
    if (this.score.has(playerId)) return false;
    this.score.set(playerId, this.kind === "clock" ? -1 : 0);
    if (this.kind === "tug") {
      const sizes = this.sides();
      this.side.set(playerId, sizes[0] <= sizes[1] ? 0 : 1);
    }
    return true;
  }

  private sides(): [number, number] {
    let a = 0;
    let b = 0;
    for (const s of this.side.values()) if (s === 0) a++; else b++;
    return [a, b];
  }

  private finish(now: number, winnerId: string | null, text: string | null) {
    this.phase = "done";
    this.doneAt = now;
    this.winnerId = winnerId;
    this.winnerText = text;
    if (winnerId) this.wins.set(winnerId, (this.wins.get(winnerId) ?? 0) + 1);
  }

  /** Time ran out: settle the round with whatever has happened so far. */
  private timeUp(now: number) {
    if (this.party) return this.finish(now, null, "Time's up");
    if (this.kind === "clock") return this.settleClock(now);
    if (this.kind === "tug") {
      if (this.pull === 0) return this.finish(now, null, "It's a tie!");
      return this.finish(now, null, `${TUG_SIDES[this.pull > 0 ? 1 : 0].name} side wins!`);
    }
    this.finish(now, null, this.kind === "count" ? "Nobody got it" : "Nobody won");
  }

  private settleClock(now: number) {
    const stopped = [...this.score.entries()].filter(([, ms]) => ms >= 0).sort((a, b) => Math.abs(a[1] - CLOCK_TARGET_MS) - Math.abs(b[1] - CLOCK_TARGET_MS));
    if (!stopped.length) return this.finish(now, null, "Nobody stopped the clock");
    this.finish(now, stopped[0][0], `${(stopped[0][1] / 1000).toFixed(2)} s`);
  }

  /** Move time-driven steps along. Returns when the next one is due (null when idle). */
  tick(now: number): number | null {
    if (this.phase === "countdown" && now >= this.startsAt) {
      this.phase = "running";
      this.enroll(); // whoever arrived during the countdown
      this.startParty(now);
    }
    this.stepParty(now);
    if (this.phase === "running" && now >= this.endsAt) this.timeUp(now);
    if (this.phase === "done" && now - this.doneAt >= MINI_RESULT_MS) {
      this.phase = "idle";
      if (this.mix) {
        const others = LOBBY_GAMES.filter((k) => k !== this.kind && (LOBBY_GAME_INFO[k].min ?? 1) <= this.headcount);
        this.kind = others[Math.floor(this.random() * others.length)] ?? this.kind;
      }
    }
    if (this.phase === "countdown") return this.startsAt;
    if (this.phase === "running" && this.party) return Math.min(this.endsAt, Math.max(now + 30, this.partyNext));
    if (this.phase === "running") return this.kind === "reflex" && now < this.goAt ? this.goAt : this.endsAt;
    if (this.phase === "done") return this.doneAt + MINI_RESULT_MS;
    return null;
  }

  /** Taps since this player's last message, capped at what a person can do. */
  private counted(playerId: string, n: number, now: number): number {
    const since = now - (this.lastTap.get(playerId) ?? this.startsAt);
    const allowed = Math.max(1, Math.floor((since / 1000) * TAPS_PER_SEC) + 1);
    const add = Math.max(0, Math.min(Math.floor(n), allowed));
    if (add) this.lastTap.set(playerId, now);
    return add;
  }

  /**
   * A player tapped (`n` times since their last message) or, in Count the pigs, picked a
   * number. Returns whether anything changed, and what to tell that player's phone.
   */
  tap(playerId: string, input: TapInput, now: number): { changed: boolean; data: TapResult } {
    this.tick(now);
    const data: TapResult = {};
    const mine = () => {
      const side = this.side.get(playerId);
      if (side !== undefined) data.side = side;
      if (this.out.has(playerId)) data.out = true;
      return data;
    };
    if (this.phase === "done") return { changed: false, data: mine() };
    if (this.phase === "idle") {
      this.begin(now);
      this.join(playerId);
      return { changed: true, data: mine() };
    }
    if (this.phase === "countdown") return { changed: this.join(playerId), data: mine() }; // lining up
    if (this.party) {
      // The bigger games are played by whoever was in when the countdown ended.
      if (!this.score.has(playerId)) return { changed: false, data: { error: "This round has started. You are in the next one!" } };
      const ack = this.party.input(playerId, input, now);
      if (ack.error) data.error = ack.error;
      this.stepParty(now);
      return { changed: ack.changed || this.phase !== "running", data };
    }
    let changed = this.join(playerId); // late arrivals may still play

    if (this.kind === "race" || this.kind === "tug") {
      const add = this.counted(playerId, input.n ?? 1, now);
      if (!add) return { changed, data: mine() };
      changed = true;
      if (this.kind === "race") {
        const total = Math.min(RACE_GOAL, (this.score.get(playerId) ?? 0) + add);
        this.score.set(playerId, total);
        if (total >= RACE_GOAL) this.finish(now, playerId, null);
      } else {
        this.score.set(playerId, (this.score.get(playerId) ?? 0) + add);
        this.pull += this.side.get(playerId) === 1 ? add : -add;
        if (Math.abs(this.pull) >= this.tugGoal()) this.finish(now, null, `${TUG_SIDES[this.pull > 0 ? 1 : 0].name} side wins!`);
      }
    } else if (this.kind === "reflex") {
      if (this.out.has(playerId)) return { changed, data: mine() };
      changed = true;
      if (now < this.goAt) {
        this.out.add(playerId);
        if (this.out.size >= this.score.size) this.finish(now, null, "Everyone jumped the gun");
      } else this.finish(now, playerId, `${Math.round(now - this.goAt)} ms`);
    } else if (this.kind === "clock") {
      if ((this.score.get(playerId) ?? -1) >= 0) return { changed, data: { ...mine(), ms: this.score.get(playerId) } };
      changed = true;
      const ms = Math.max(0, Math.round(now - this.startsAt));
      this.score.set(playerId, ms);
      data.ms = ms;
      if ([...this.score.values()].every((v) => v >= 0)) this.settleClock(now);
    } else {
      // count
      if (this.out.has(playerId) || input.pick === undefined) return { changed, data: mine() };
      changed = true;
      if (input.pick === this.count) this.finish(now, playerId, `${this.count} pigs`);
      else {
        this.out.add(playerId);
        if (this.out.size >= this.score.size) this.finish(now, null, `Nobody got it: there were ${this.count}`);
      }
    }
    return { changed, data: mine() };
  }

  private tugGoal(): number {
    return TUG_PER_PLAYER * Math.max(1, ...this.sides());
  }

  /** Someone left the game: they leave the round too. */
  drop(playerId: string) {
    this.score.delete(playerId);
    this.out.delete(playerId);
    this.side.delete(playerId);
    this.party?.drop(playerId);
  }

  /**
   * `secrets`: for the big screen and the host, who may see the number of pigs during the round.
   * `viewer`: the player whose phone this is for, so it can be told what only they should know.
   */
  view(now: number, secrets = false, viewer: string | null = null): MiniView {
    this.tick(now);
    if (this.phase === "idle") return { kind: this.kind, mix: this.mix, round: null };
    const round: MiniRound = { id: this.id, kind: this.kind, phase: this.phase, startsAt: this.startsAt, players: this.score.size, winnerId: this.winnerId, winnerText: this.winnerText };
    const done = this.phase === "done";
    if (this.party) {
      if (this.phase !== "countdown") {
        round.x = this.party.view(secrets ? null : viewer, done);
        round.out = this.party.outCount();
        if (secrets && !done) round.hideable = this.party.hideable();
      }
    } else if (this.kind === "race") {
      round.goal = RACE_GOAL;
      round.lanes = [...this.score.entries()].sort((a, b) => b[1] - a[1]).slice(0, RACE_LANES).map(([id, taps]) => ({ id, taps, wins: this.wins.get(id) ?? 0 }));
    } else if (this.kind === "reflex") {
      round.go = this.phase !== "countdown" && now >= this.goAt;
      round.out = this.out.size;
    } else if (this.kind === "clock") {
      const stopped = [...this.score.entries()].filter(([, ms]) => ms >= 0);
      round.stopped = stopped.length;
      if (done) round.results = stopped.sort((a, b) => Math.abs(a[1] - CLOCK_TARGET_MS) - Math.abs(b[1] - CLOCK_TARGET_MS)).slice(0, 5).map(([id, ms]) => ({ id, ms }));
    } else if (this.kind === "count") {
      round.count = done || (secrets && this.phase === "running") ? this.count : null;
      round.out = this.out.size;
    } else {
      const side = viewer ? this.side.get(viewer) : undefined;
      if (side !== undefined) round.mySide = side;
      round.sides = this.sides();
      round.pull = Math.max(-1, Math.min(1, this.pull / this.tugGoal()));
    }
    return { kind: this.kind, mix: this.mix, round };
  }
}
