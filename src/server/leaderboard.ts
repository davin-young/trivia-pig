/** Season leaderboard: aggregate finished games by player (or team) name. Pure, unit tested. */

export interface FinishedGame {
  id: string;
  mode: "solo" | "team";
  /** Final standings, any order. */
  standings: { name: string; score: number }[];
}

export interface LeaderRow {
  key: string;
  name: string;
  games: number;
  wins: number;
  podiums: number;
  total: number;
  average: number;
  best: number;
  /** Share of games won, 0..1. */
  winRate: number;
}

const norm = (name: string) => name.trim().toLowerCase().replace(/\s+/g, " ");

/**
 * People are matched by name (case and spacing ignored), since players never
 * make accounts. Ties share the win. Games with fewer than two contestants
 * are ignored so solo test runs do not pad anyone's record.
 */
export function buildLeaderboard(games: FinishedGame[], mode: "solo" | "team" = "solo"): LeaderRow[] {
  const rows = new Map<string, LeaderRow>();
  for (const g of games) {
    if (g.mode !== mode || g.standings.length < 2) continue;
    const sorted = [...g.standings].sort((a, b) => b.score - a.score);
    const top = sorted[0].score;
    const seen = new Set<string>();
    sorted.forEach((s, i) => {
      const key = norm(s.name);
      if (!key || seen.has(key)) return; // two "Sam"s in one game: count the better one
      seen.add(key);
      const row = rows.get(key) ?? { key, name: s.name.trim(), games: 0, wins: 0, podiums: 0, total: 0, average: 0, best: s.score, winRate: 0 };
      row.games++;
      row.total += s.score;
      row.best = Math.max(row.best, s.score);
      if (s.score === top) row.wins++;
      // Rank counts everyone strictly ahead, so ties share a podium place.
      if (sorted.filter((o) => o.score > s.score).length < 3 || i < 3) row.podiums++;
      rows.set(key, row);
    });
  }
  const list = [...rows.values()];
  for (const r of list) {
    r.average = Math.round(r.total / r.games);
    r.winRate = r.wins / r.games;
  }
  return list.sort((a, b) => b.wins - a.wins || b.total - a.total || b.games - a.games || a.name.localeCompare(b.name));
}

export const SEASONS = [
  { id: "30", label: "Last 30 days", days: 30 },
  { id: "90", label: "Last 90 days", days: 90 },
  { id: "365", label: "Last 12 months", days: 365 },
  { id: "all", label: "All time", days: null },
] as const;
export type SeasonId = (typeof SEASONS)[number]["id"];
