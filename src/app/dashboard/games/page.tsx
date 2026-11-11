import Link from "next/link";
import { AppNav } from "@/components/AppNav";
import { ActionButton } from "@/components/dashboard/actions";
import { prisma } from "@/server/db";
import { requireUser } from "@/server/session";
import { visibleOwnerIds } from "@/server/access";
import { gameSummary, summaryStandings } from "@/server/gameAccess";

export const metadata = { title: "Game history" };
export const dynamic = "force-dynamic";

export default async function GamesHistory() {
  const user = await requireUser("/dashboard/games");
  const owners = (await visibleOwnerIds(user.id)).map((o) => o.ownerId);
  const games = await prisma.game.findMany({
    where: { ownerId: { in: owners }, status: "FINISHED" },
    orderBy: [{ finishedAt: "desc" }, { createdAt: "desc" }],
    take: 200,
  });

  return (
    <>
      <AppNav user={user} active="games" />
      <main className="mx-auto flex max-w-6xl flex-col gap-4 px-4 py-6">
        <h1 className="text-2xl font-bold">Game history</h1>
        {!games.length && <div className="card text-white/60">No finished games yet.</div>}
        <div className="flex flex-col gap-2">
          {games.map((g) => {
            const sum = gameSummary(g);
            const standings = summaryStandings(sum);
            const top = standings[0];
            const winners = top ? standings.filter((s) => s.score === top.score) : [];
            return (
              <div key={g.id} className="card flex flex-wrap items-center gap-4 !p-3">
                <div className="min-w-40">
                  <div className="font-semibold">{g.boardTitle}</div>
                  <div className="text-xs text-white/50">
                    {(g.finishedAt ?? g.createdAt).toLocaleString()} · <span className="tracking-widest">{g.code}</span>
                    {sum.mode === "team" && " · teams"}
                  </div>
                </div>
                <div className="min-w-0 flex-1 text-sm">
                  {winners.length > 0 ? (
                    <div>
                      🏆 <b>{winners.map((w) => w.name).join(" & ")}</b> <span className="money">${top.score.toLocaleString()}</span>
                    </div>
                  ) : (
                    <div className="text-white/50">No players</div>
                  )}
                  <div className="truncate text-xs text-white/50">
                    {standings.map((s) => `${s.name} ${s.score < 0 ? "-$" : "$"}${Math.abs(s.score).toLocaleString()}`).join(" · ")}
                  </div>
                </div>
                <div className="flex flex-wrap gap-1.5">
                  <Link href={`/results/${g.id}`} className="btn-ghost !px-3 !py-1.5 text-sm">Results</Link>
                  <a href={`/api/games/${g.id}/export`} className="btn-ghost !px-3 !py-1.5 text-sm">CSV</a>
                  <Link href={`/dashboard?rematch=${g.id}`} className="btn-ghost !px-3 !py-1.5 text-sm">Rematch</Link>
                  {g.ownerId === user.id && (
                    <ActionButton url={`/api/games/${g.id}`} method="DELETE" confirmText="Delete this game's history? This can't be undone." className="btn-ghost !px-3 !py-1.5 text-sm text-red-300">
                      Delete
                    </ActionButton>
                  )}
                </div>
              </div>
            );
          })}
        </div>
      </main>
    </>
  );
}
