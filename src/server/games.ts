import type { Prisma, User } from "@prisma/client";
import { boardContentSchema, type BoardContent } from "@/shared/board";
import { DEFAULT_SETTINGS, settingsSchema, type GameAction, type LogEntry, type Settings, type Setup } from "@/engine/types";
import { replay } from "@/engine/reducer";
import { prisma } from "./db";
import { gameCode } from "./crypto";
import { summarize } from "./live";

export function userDefaults(user: Pick<User, "gameDefaults">): Settings {
  const parsed = settingsSchema.safeParse(user.gameDefaults ?? {});
  return parsed.success ? parsed.data : DEFAULT_SETTINGS;
}

async function freeCode(): Promise<string> {
  for (let i = 0; i < 20; i++) {
    const code = gameCode(5);
    const clash = await prisma.game.findFirst({ where: { code, status: { not: "FINISHED" } }, select: { id: true } });
    if (!clash) return code;
  }
  throw new Error("Couldn't allocate a game code");
}

export async function createGame(opts: {
  ownerId: string;
  boardId: string | null;
  title: string;
  content: BoardContent;
  settings: Settings;
  initialLog?: LogEntry[];
  rematchOfId?: string;
}) {
  const setup: Setup = { board: boardContentSchema.parse(opts.content), settings: opts.settings };
  const log = opts.initialLog ?? [];
  const state = replay(setup, log);
  return prisma.game.create({
    data: {
      code: await freeCode(),
      ownerId: opts.ownerId,
      boardId: opts.boardId,
      boardTitle: opts.title,
      setup: setup as unknown as Prisma.InputJsonValue,
      actions: log as unknown as Prisma.InputJsonValue,
      state: summarize(state) as unknown as Prisma.InputJsonValue,
      rematchOfId: opts.rematchOfId ?? null,
    },
  });
}

/** Seed log for a rematch: same players (and teams), fresh scores. */
export function rematchLog(prevSetup: Setup, prevLog: LogEntry[]): LogEntry[] {
  const s = replay(prevSetup, prevLog);
  const out: LogEntry[] = [];
  const now = Date.now();
  const push = (action: GameAction) => out.push({ seq: out.length + 1, at: now, by: "system", action });
  for (const t of s.teams) push({ type: "team/create", teamId: t.id, name: t.name, color: t.color });
  for (const id of s.playerOrder) {
    const p = s.players[id];
    if (!p || p.removed) continue;
    push({ type: "player/join", playerId: p.id, name: p.name, signature: p.signature, teamId: p.teamId });
  }
  return out;
}
