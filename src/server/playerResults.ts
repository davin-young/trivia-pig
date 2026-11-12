import type { GameState } from "@/engine/types";
import { prisma } from "./db";
import { buildRecap } from "./recap";
import { contestantsOf, rankStandings } from "./results";

export interface SeatResult {
  playerId: string;
  score: number;
  place: number;
  contestants: number;
  right: number;
  wrong: number;
  team: boolean;
}

/**
 * What each seat takes away from a finished game. In a team game a player gets their team's
 * score, place and answer counts. Audience members, bots and removed players get nothing.
 */
export function seatResults(s: GameState): SeatResult[] {
  if (s.phase !== "finished") return [];
  const team = s.settings.mode === "team";
  const standings = rankStandings(contestantsOf(s), s.scores);
  const lines = new Map(buildRecap(s).lines.map((l) => [l.id, l]));
  const out: SeatResult[] = [];
  for (const id of s.playerOrder) {
    const p = s.players[id];
    if (!p || p.removed || p.audience || p.bot) continue;
    const standing = standings.find((c) => c.id === (team ? p.teamId : p.id));
    if (!standing) continue;
    const line = lines.get(standing.id);
    out.push({ playerId: p.id, score: standing.score, place: standing.rank, contestants: standings.length, right: line?.right ?? 0, wrong: line?.wrong ?? 0, team });
  }
  return out;
}

/**
 * Save (or, when the end of the game was undone, remove) the results of the seats that belong
 * to a saved player. Safe to call again: it replaces what it wrote before.
 */
export async function recordResults(gameId: string, boardTitle: string, s: GameState): Promise<void> {
  const results = seatResults(s);
  const seats = results.length
    ? await prisma.gamePlayer.findMany({ where: { gameId, profileId: { not: null } }, select: { playerId: true, profileId: true } })
    : [];
  const byPlayer = new Map(results.map((r) => [r.playerId, r]));
  const finishedAt = new Date(s.finishedAt ?? Date.now());
  const seen = new Set<string>();
  const rows = seats.flatMap((seat) => {
    const r = byPlayer.get(seat.playerId);
    if (!r || !seat.profileId || seen.has(seat.profileId)) return [];
    seen.add(seat.profileId);
    return [{ profileId: seat.profileId, gameId, boardTitle: boardTitle.slice(0, 200), score: r.score, place: r.place, contestants: r.contestants, right: r.right, wrong: r.wrong, team: r.team, finishedAt }];
  });
  await prisma.$transaction([prisma.playerResult.deleteMany({ where: { gameId } }), ...(rows.length ? [prisma.playerResult.createMany({ data: rows })] : [])]);
}

export interface PlayerStats {
  games: number;
  wins: number;
  best: number | null;
  points: number;
  right: number;
  wrong: number;
}

export function totals(rows: { score: number; place: number; right: number; wrong: number; team: boolean }[]): PlayerStats {
  return {
    games: rows.length,
    wins: rows.filter((r) => r.place === 1).length,
    best: rows.length ? Math.max(...rows.map((r) => r.score)) : null,
    points: rows.reduce((n, r) => n + r.score, 0),
    // Answer counts in a team game belong to the whole team, so they stay out of a person's tally.
    right: rows.reduce((n, r) => n + (r.team ? 0 : r.right), 0),
    wrong: rows.reduce((n, r) => n + (r.team ? 0 : r.wrong), 0),
  };
}
