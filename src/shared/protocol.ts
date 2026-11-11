import { z } from "zod";
import { drawingSchema } from "./strokes";
import { settingsSchema } from "@/engine/types";

/**
 * Every socket message is validated against these schemas.
 * Host "intents" mirror engine actions, minus anything the server resolves
 * itself (ids, timestamps, random Daily Double placement, team balancing).
 */

const id = z.string().min(1).max(64);
const shortText = z.string().max(2000);
const int = z.number().int().min(-10_000_000).max(10_000_000);

export const SOUNDBOARD = ["applause", "boo", "drumroll", "timer", "ding", "buzzer", "laugh", "fanfare"] as const;
export type SoundboardId = (typeof SOUNDBOARD)[number];

/** Emoji players can send to the big screen. */
export const REACTIONS = ["👏", "😂", "🔥", "😱", "🤔", "💀", "🎉", "❤️"] as const;

export const BOT_NAMES = ["Botty McBuzz", "Ada Bot", "Sir Buzzalot", "Robo Trebek", "Quizzy", "Beep Boop", "Dot Matrix", "Captain Clue"];

export const hostIntentSchema = z.discriminatedUnion("type", [
  z.object({ type: z.literal("settings/update"), settings: settingsSchema.partial().extend({ sound: settingsSchema.shape.sound.unwrap().partial().optional() }) }),
  z.object({ type: z.literal("lobby/lock"), locked: z.boolean() }),
  z.object({ type: z.literal("player/rename"), playerId: id, name: z.string().min(1).max(40) }),
  z.object({ type: z.literal("player/resetSignature"), playerId: id }),
  z.object({ type: z.literal("player/hideSignature"), playerId: id, hidden: z.boolean() }),
  z.object({ type: z.literal("player/kick"), playerId: id }),
  z.object({ type: z.literal("player/ban"), playerId: id }),
  z.object({ type: z.literal("player/restore"), playerId: id }),
  z.object({ type: z.literal("team/create"), name: z.string().min(1).max(40), color: z.string().regex(/^#[0-9a-fA-F]{6}$/).optional() }),
  z.object({ type: z.literal("team/rename"), teamId: id, name: z.string().min(1).max(40) }),
  z.object({ type: z.literal("team/delete"), teamId: id }),
  z.object({ type: z.literal("team/assign"), playerId: id, teamId: id.nullable() }),
  z.object({ type: z.literal("team/autoBalance") }),
  z.object({ type: z.literal("game/start") }),
  z.object({ type: z.literal("clue/open"), clueId: id, allPlay: z.boolean().optional() }),
  z.object({ type: z.literal("allPlay/close") }),
  z.object({ type: z.literal("allPlay/judge"), contestantId: id, correct: z.boolean() }),
  z.object({ type: z.literal("bots/add"), count: z.number().int().min(1).max(8) }),
  z.object({ type: z.literal("bots/remove") }),
  z.object({ type: z.literal("buzzers/unlock") }),
  z.object({ type: z.literal("buzzers/lock") }),
  z.object({ type: z.literal("clue/judge"), correct: z.boolean(), playerId: id.optional() }),
  z.object({ type: z.literal("clue/reveal") }),
  z.object({ type: z.literal("clue/nobody") }),
  z.object({ type: z.literal("clue/close") }),
  z.object({ type: z.literal("dd/wager"), amount: int, contestantId: id.optional() }),
  z.object({ type: z.literal("clue/skip"), clueId: id }),
  z.object({ type: z.literal("clue/setUsed"), clueId: id, used: z.boolean() }),
  z.object({ type: z.literal("clue/edit"), clueId: id, text: shortText.optional(), answer: shortText.optional(), saveToBoard: z.boolean().optional() }),
  z.object({ type: z.literal("final/edit"), category: z.string().max(200).optional(), text: shortText.optional(), answer: shortText.optional(), saveToBoard: z.boolean().optional() }),
  z.object({ type: z.literal("control/set"), contestantId: id.nullable() }),
  z.object({ type: z.literal("score/adjust"), contestantId: id, delta: int }),
  z.object({ type: z.literal("score/set"), contestantId: id, score: int }),
  z.object({ type: z.literal("game/pause"), paused: z.boolean() }),
  z.object({ type: z.literal("screen/set"), screen: z.enum(["none", "blank", "brb", "scores"]) }),
  z.object({ type: z.literal("announce"), text: z.string().max(280).nullable() }),
  z.object({ type: z.literal("qr/show"), show: z.boolean() }),
  z.object({ type: z.literal("timer/start"), seconds: z.number().int().min(1).max(600), label: z.string().max(40).optional() }),
  z.object({ type: z.literal("timer/stop") }),
  z.object({ type: z.literal("round/set"), index: z.number().int().min(0).max(10) }),
  z.object({ type: z.literal("final/start") }),
  z.object({ type: z.literal("final/showClue") }),
  z.object({ type: z.literal("final/startTimer") }),
  z.object({ type: z.literal("final/close") }),
  z.object({ type: z.literal("final/reveal"), contestantId: id }),
  z.object({ type: z.literal("final/judge"), contestantId: id, correct: z.boolean() }),
  z.object({ type: z.literal("final/showWager"), contestantId: id }),
  z.object({ type: z.literal("final/hostWager"), contestantId: id, amount: int }),
  z.object({ type: z.literal("game/end") }),
  z.object({ type: z.literal("board/resetUsed") }),
]);
export type HostIntent = z.infer<typeof hostIntentSchema>;

/** Intents a scorekeeper may send. Everything else needs host/co-host. */
export const SCOREKEEPER_INTENTS: ReadonlySet<HostIntent["type"]> = new Set([
  "clue/judge",
  "allPlay/judge",
  "score/adjust",
  "score/set",
  "dd/wager",
  "final/judge",
  "final/showWager",
  "final/hostWager",
  "control/set",
]);

export const handshakeSchema = z.object({
  role: z.enum(["display", "host", "player"]),
  code: z.string().min(4).max(6).regex(/^[A-Za-z0-9]+$/),
  playerToken: z.string().min(10).max(100).optional(),
});
export type Handshake = z.infer<typeof handshakeSchema>;

export const clientEvents = {
  "host:action": z.object({ action: hostIntentSchema }),
  "host:undo": z.object({ seq: z.number().int().positive(), undone: z.boolean().default(true) }),
  "host:undoLast": z.object({}),
  "host:sound": z.object({ id: z.enum(SOUNDBOARD) }),
  "player:join": z.object({
    name: z.string().trim().min(1).max(24),
    signature: drawingSchema.nullable(),
    teamId: id.nullable().optional(),
  }),
  "player:signature": z.object({ signature: drawingSchema.nullable() }),
  "player:buzz": z.object({}),
  "player:finalWager": z.object({ amount: z.number().int().min(0).max(10_000_000) }),
  "player:finalAnswer": z.object({ drawing: drawingSchema.nullable(), typed: z.string().max(200).optional() }),
  "player:allPlayAnswer": z.object({ drawing: drawingSchema.nullable(), typed: z.string().max(200).optional() }),
  "player:react": z.object({ emoji: z.enum(REACTIONS) }),
  "presence:ping": z.object({}),
} as const;
export type ClientEvent = keyof typeof clientEvents;
export type ClientPayload<E extends ClientEvent> = z.input<(typeof clientEvents)[E]>;

export type Ack = { ok: true; data?: unknown } | { ok: false; error: string };

export type PresenceStatus = "online" | "reconnecting" | "offline";
export interface PresenceView {
  display: PresenceStatus;
  displays: number;
  hosts: { role: string; count: number }[];
  players: Record<string, PresenceStatus>;
  /** True while the server cannot write this game to the database (hosts only see this). */
  saveFailing?: boolean;
}

export type FxEvent = { cue: string; playerId?: string; id?: string };

export const TEAM_COLORS = ["#ff5d73", "#4ff0b1", "#ffd23f", "#7bdff2", "#c792ff", "#ff8c42", "#b8f35d", "#ff7ad9", "#f2e9dc", "#ffffff"];
