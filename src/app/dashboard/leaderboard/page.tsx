import Link from "next/link";
import { AppNav } from "@/components/AppNav";
import { prisma } from "@/server/db";
import { requireUser } from "@/server/session";
import { visibleOwnerIds } from "@/server/access";
import { gameSummary, summaryStandings } from "@/server/gameAccess";
import { buildLeaderboard, SEASONS, type SeasonId } from "@/server/leaderboard";

export const metadata = { title: "Leaderboard" };
export const dynamic = "force-dynamic";

function money(n: number) {
  return (n < 0 ? "-$" : "$") + Math.abs(n).toLocaleString("en-US");
}

export default async function LeaderboardPage({ searchParams }: { searchParams: Promise<{ season?: string; mode?: string }> }) {
  const sp = await searchParams;
  const user = await requireUser("/dashboard/leaderboard");
  const season = SEASONS.find((s) => s.id === (sp.season as SeasonId)) ?? SEASONS[1];
  const mode = sp.mode === "team" ? "team" : "solo";
  const owners = (await visibleOwnerIds(user.id)).map((o) => o.ownerId);
  const since = season.days ? new Date(Date.now() - season.days * 86_400_000) : undefined;
  const games = await prisma.game.findMany({
    where: { ownerId: { in: owners }, status: "FINISHED", ...(since ? { finishedAt: { gte: since } } : {}) },
    orderBy: { finishedAt: "desc" },
    take: 1000,
  });
  const finished = games.map((g) => {
    const sum = gameSummary(g);
    return { id: g.id, mode: sum.mode, standings: summaryStandings(sum) };
  });
  const rows = buildLeaderboard(finished, mode);
  const counted = finished.filter((g) => g.mode === mode && g.standings.length >= 2).length;
  const href = (patch: { season?: string; mode?: string }) => {
    const p = new URLSearchParams({ season: season.id, mode, ...patch });
    return `/dashboard/leaderboard?${p}`;
  };
  const tab = (active: boolean) => `px-3 py-1.5 ${active ? "bg-white/15" : "hover:bg-white/5"}`;

  return (
    <>
      <AppNav user={user} active="leaderboard" />
      <main className="mx-auto flex max-w-4xl flex-col gap-4 px-4 py-6">
        <div className="flex flex-wrap items-center gap-3">
          <h1 className="mr-auto text-2xl font-bold">🏆 Leaderboard</h1>
          <div className="flex overflow-hidden rounded-lg border border-line text-sm">
            {SEASONS.map((s) => (
              <Link key={s.id} href={href({ season: s.id })} className={tab(s.id === season.id)}>
                {s.label}
              </Link>
            ))}
          </div>
          <div className="flex overflow-hidden rounded-lg border border-line text-sm">
            <Link href={href({ mode: "solo" })} className={tab(mode === "solo")}>Players</Link>
            <Link href={href({ mode: "team" })} className={tab(mode === "team")}>Teams</Link>
          </div>
        </div>
        <p className="text-sm text-white/50">
          {counted} finished {mode === "team" ? "team " : ""}game{counted === 1 ? "" : "s"} counted. {mode === "team" ? "Teams" : "Players"} are matched by name, so ask regulars to join with the same name each time.
        </p>

        {!rows.length ? (
          <div className="card text-white/60">No finished games in this period yet. Play one and the standings show up here.</div>
        ) : (
          <div className="card overflow-x-auto !p-0">
            <table className="w-full min-w-[560px] text-sm">
              <thead className="bg-panel-2 text-left text-white/60">
                <tr>
                  <th className="px-3 py-2">#</th>
                  <th className="px-3 py-2">{mode === "team" ? "Team" : "Player"}</th>
                  <th className="px-3 py-2 text-right">Wins</th>
                  <th className="px-3 py-2 text-right">Games</th>
                  <th className="px-3 py-2 text-right">Win rate</th>
                  <th className="px-3 py-2 text-right">Podiums</th>
                  <th className="px-3 py-2 text-right">Total</th>
                  <th className="px-3 py-2 text-right">Average</th>
                  <th className="px-3 py-2 text-right">Best</th>
                </tr>
              </thead>
              <tbody>
                {rows.map((r, i) => (
                  <tr key={r.key} className="border-t border-line">
                    <td className="px-3 py-2 text-white/50">{i === 0 ? "🥇" : i === 1 ? "🥈" : i === 2 ? "🥉" : i + 1}</td>
                    <td className="px-3 py-2 font-semibold">{r.name}</td>
                    <td className="px-3 py-2 text-right font-semibold text-gold">{r.wins}</td>
                    <td className="px-3 py-2 text-right">{r.games}</td>
                    <td className="px-3 py-2 text-right">{Math.round(r.winRate * 100)}%</td>
                    <td className="px-3 py-2 text-right">{r.podiums}</td>
                    <td className={`px-3 py-2 text-right tabular-nums ${r.total < 0 ? "text-red-400" : ""}`}>{money(r.total)}</td>
                    <td className="px-3 py-2 text-right tabular-nums">{money(r.average)}</td>
                    <td className="px-3 py-2 text-right tabular-nums">{money(r.best)}</td>
                  </tr>
                ))}
              </tbody>
            </table>
          </div>
        )}
      </main>
    </>
  );
}
