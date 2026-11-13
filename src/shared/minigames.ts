import type { Drawing } from "./strokes";

/** The little games people can play from their phones while the room waits in the lobby. */
export const LOBBY_GAMES = ["race", "reflex", "clock", "count", "tug", "potato", "mud", "sumo", "doodle", "chain", "caption", "likely", "guess", "split", "pattern", "maze"] as const;
export type LobbyGameKind = (typeof LOBBY_GAMES)[number];

/** `min`: how many people have to be in before a round can run. */
export const LOBBY_GAME_INFO: Record<LobbyGameKind, { name: string; emoji: string; how: string; min?: number }> = {
  race: { name: "Pig race", emoji: "🐖", how: "Tap as fast as you can. First pig to the flag wins." },
  reflex: { name: "Quick draw", emoji: "⚡", how: "Wait for GO, then tap first. Tap too early and you are out." },
  clock: { name: "Stop the clock", emoji: "⏱️", how: "The clock hides after two seconds. Stop it as close to 7.00 as you can." },
  count: { name: "Count the pigs", emoji: "🔢", how: "Count the pigs on the big screen. First right answer wins; a wrong one puts you out." },
  tug: { name: "Tug of war", emoji: "🪢", how: "Two sides. Tap to pull the rope your way." },
  potato: { name: "Hot potato", emoji: "💣", how: "Holding the mud bomb? Tap a name to pass it. Whoever holds it when it pops is out.", min: 2 },
  mud: { name: "Mud fight", emoji: "🟤", how: "Each turn: throw mud at someone, duck, or scoop more mud. Get hit and you are out.", min: 2 },
  sumo: { name: "Pig sumo", emoji: "🤼", how: "Drag the pad on your phone to steer. Bump the other pigs out of the ring.", min: 2 },
  doodle: { name: "Doodle guess", emoji: "🎨", how: "One player draws a secret word. Everyone else types guesses. First right guess wins.", min: 2 },
  chain: { name: "Doodle chain", emoji: "🖍️", how: "Take turns adding to one drawing, then everyone names it and votes for the best title.", min: 3 },
  caption: { name: "Caption vote", emoji: "💬", how: "Everyone answers the same silly prompt, then votes for the best answer.", min: 3 },
  likely: { name: "Most likely to", emoji: "👉", how: "Vote for the player who fits the prompt best.", min: 3 },
  guess: { name: "Closest guess", emoji: "🎯", how: "Type a number. The closest guess wins.", min: 2 },
  split: { name: "Split the room", emoji: "⚖️", how: "Pick the side you think most of the room will pick.", min: 3 },
  pattern: { name: "Copy the pattern", emoji: "🧠", how: "Watch the colours flash, then repeat them in order. One mistake and you are out." },
  maze: { name: "Pig maze", emoji: "🌽", how: "Tilt your phone or use the arrows. First pig to the corn wins." },
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

/** The bigger games: they have steps of their own and take over the big screen while they run. */
export const PARTY_KINDS: Partial<Record<LobbyGameKind, true>> = { potato: true, mud: true, sumo: true, doodle: true, chain: true, caption: true, likely: true, guess: true, split: true, pattern: true, maze: true };

export const PATTERN_COLORS = ["#ff5d73", "#ffd23f", "#4ff0b1", "#7bdff2"] as const;
export const DOODLE_CANVAS = { w: 800, h: 450 };
/** Maze walls, one bit per side of a cell. */
export const WALL = { N: 1, E: 2, S: 4, W: 8 } as const;

/** The state of one of the bigger lobby games. Each game fills in the fields it uses. */
export interface MiniX {
  /** The step the round is on ("choose", "reveal", "draw", "write", "vote", "show", "input"). */
  stage?: string;
  /** Server time the current step ends. */
  endsAt?: number;
  /** Who is still in, and who is out (in the order they went out). */
  alive?: string[];
  gone?: string[];
  // hot potato
  holder?: string | null;
  // mud fight
  turn?: number;
  mud?: Record<string, number>;
  chosen?: number;
  acts?: { id: string; act: "throw" | "duck" | "reload"; target?: string; hit: boolean }[];
  // pig sumo
  pigs?: { id: string; x: number; y: number; out?: boolean; done?: boolean }[];
  // drawing games
  drawer?: string | null;
  ink?: Drawing | null;
  word?: string;
  letters?: number;
  guesses?: { by: string; text: string }[];
  // write-and-vote games
  prompt?: string;
  wrote?: number;
  voted?: number;
  options?: { text: string; by?: string; votes?: number }[];
  // most likely to / closest guess / split the room
  tally?: { id: string; votes: number }[];
  unit?: string;
  answer?: number;
  values?: { id: string; value: number }[];
  sideNames?: [string, string];
  counts?: [number, number];
  // copy the pattern
  seq?: number[];
  shownAt?: number;
  // pig maze
  w?: number;
  h?: number;
  walls?: number[];
  /** What only the viewer's own phone is told. */
  mine?: { act?: string; target?: string; canDuck?: boolean; wrote?: boolean; voted?: boolean; own?: number; value?: number; side?: number; at?: number; finished?: boolean };
}

/** What a phone sends in a lobby game. */
export interface TapInput {
  n?: number;
  pick?: number;
  target?: string;
  text?: string;
  act?: "throw" | "duck" | "reload";
  x?: number;
  y?: number;
  dir?: number;
  ink?: Drawing;
}

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
  /** Which side the player this was sent to pulls for. */
  mySide?: 0 | 1;
  /** The bigger games keep their state here. */
  x?: MiniX;
  /** For the host only: things players typed or drew that the host can remove. */
  hideable?: { key: string; label: string }[];
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
  /** Why the tap was refused, in words for the player. */
  error?: string;
}
