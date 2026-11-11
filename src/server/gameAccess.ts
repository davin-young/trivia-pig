import type { Game, HostRole, User } from "@prisma/client";
import type { LogEntry, Setup } from "@/engine/types";
import { settingsSchema } from "@/engine/types";
import { prisma } from "./db";
import { hostRoleFor } from "./access";

/** Load a game if the user holds one of the given roles for its owner. */
export async function gameForUser(
  id: string,
  user: User,
  roles: HostRole[] = ["HOST", "COHOST", "SCOREKEEPER"],
): Promise<{ game: Game; role: HostRole } | null> {
  const game = await prisma.game.findUnique({ where: { id } });
  if (!game) return null;
  const role = await hostRoleFor(user.id, game.ownerId);
  if (!role || !roles.includes(role)) return null;
  return { game, role };
}

export function gameSetup(game: Game): Setup {
  const setup = game.setup as unknown as Setup;
  return { ...setup, settings: settingsSchema.parse(setup.settings ?? {}) };
}

export function gameLog(game: Game): LogEntry[] {
  return (game.actions as unknown as LogEntry[]) ?? [];
}

/** Shape written by summarize() in live.ts. */
export interface GameSummary {
  phase: string;
  roundIndex: number;
  mode: "solo" | "team";
  scores: Record<string, number>;
  players: { id: string; name: string; teamId: string | null }[];
  teams: { id: string; name: string; color: string }[];
}

export function gameSummary(game: Game): GameSummary {
  const s = (game.state ?? {}) as Partial<GameSummary>;
  return {
    phase: s.phase ?? "lobby",
    roundIndex: s.roundIndex ?? 0,
    mode: s.mode ?? "solo",
    scores: s.scores ?? {},
    players: s.players ?? [],
    teams: s.teams ?? [],
  };
}

/** Ranked final scores from a summary (teams in team mode, players otherwise). */
export function summaryStandings(sum: GameSummary): { id: string; name: string; score: number }[] {
  const list = sum.mode === "team" ? sum.teams.map((t) => ({ id: t.id, name: t.name })) : sum.players.map((p) => ({ id: p.id, name: p.name }));
  return list.map((c) => ({ ...c, score: sum.scores[c.id] ?? 0 })).sort((a, b) => b.score - a.score);
}
