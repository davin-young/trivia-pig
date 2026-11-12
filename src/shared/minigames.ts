/** The little games people can play from their phones while the room waits in the lobby. */
export const LOBBY_GAMES = ["race", "reflex", "clock", "count", "tug"] as const;
export type LobbyGameKind = (typeof LOBBY_GAMES)[number];

export const LOBBY_GAME_INFO: Record<LobbyGameKind, { name: string; emoji: string; how: string }> = {
  race: { name: "Pig race", emoji: "🐖", how: "Tap as fast as you can. First pig to the flag wins." },
  reflex: { name: "Quick draw", emoji: "⚡", how: "Wait for GO, then tap first. Tap too early and you are out." },
  clock: { name: "Stop the clock", emoji: "⏱️", how: "The clock hides after two seconds. Stop it as close to 7.00 as you can." },
  count: { name: "Count the pigs", emoji: "🔢", how: "Count the pigs on the big screen. First right answer wins; a wrong one puts you out." },
  tug: { name: "Tug of war", emoji: "🪢", how: "Two sides. Tap to pull the rope your way." },
};

/** Stop the clock: the time to hit, and how long the clock stays visible. */
export const CLOCK_TARGET_MS = 7000;
export const CLOCK_VISIBLE_MS = 2000;
/** Count the pigs: the numbers offered on phones. */
export const COUNT_MIN = 5;
export const COUNT_MAX = 14;
export const TUG_SIDES = [
  { name: "Pink", color: "#ff7ad9" },
  { name: "Gold", color: "#ffd23f" },
] as const;

export interface MiniRound {
  id: number;
  kind: LobbyGameKind;
  phase: "countdown" | "running" | "done";
  /** Server time the round starts (the countdown runs until then). */
  startsAt: number;
  /** How many people are in this round. */
  players: number;
  winnerId: string | null;
  /** The winner's result ("312 ms", "7.04 s") or, with no single winner, what happened. */
  winnerText: string | null;
  // race
  lanes?: { id: string; taps: number; wins: number }[];
  goal?: number;
  // reflex
  go?: boolean;
  out?: number;
  // clock
  stopped?: number;
  results?: { id: string; ms: number }[];
  // count: the number of pigs. Phones only learn it once the round is over.
  count?: number | null;
  // tug: -1 (all the way to side 0) .. 1 (all the way to side 1)
  pull?: number;
  sides?: [number, number];
}

/** Sent as the "mini" event (null when lobby games are off or the game has started). */
export interface MiniView {
  kind: LobbyGameKind;
  /** A different game comes up after every round. */
  mix: boolean;
  round: MiniRound | null;
}

/** What a tap tells the phone that sent it. */
export interface TapResult {
  out?: boolean;
  side?: 0 | 1;
  ms?: number;
}
