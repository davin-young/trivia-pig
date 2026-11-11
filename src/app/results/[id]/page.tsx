import Link from "next/link";
import { notFound } from "next/navigation";
import { AppNav } from "@/components/AppNav";
import { RematchSameButton } from "@/components/dashboard/RematchSameButton";
import { requireUser } from "@/server/session";
import { gameForUser, gameLog, gameSetup } from "@/server/gameAccess";
import { getManager } from "@/server/live";
import { buildResults } from "@/server/results";
import { computeAwards } from "@/engine/awards";
import { replay } from "@/engine/reducer";

export const metadata = { title: "Results" };
export const dynamic = "force-dynamic";

function money(n: number) {
  return (n < 0 ? "-$" : "$") + Math.abs(n).toLocaleString();
}

export default async function ResultsPage({ params }: { params: Promise<{ id: string }> }) {
  const { id } = await params;
  const user = await requireUser(`/results/${id}`);
  const found = await gameForUser(id, user);
  if (!found) notFound();
  const { game, role } = found;
  const live = getManager().cached(game.id);
  const setup = live?.history.setup ?? gameSetup(game);
  const log = live?.history.log ?? gameLog(game);
  const res = buildResults(setup, log);
  const awards = game.status === "FINISHED" ? computeAwards(live?.state ?? replay(setup, log)) : [];
  const { standings, contestants, clueRows } = res;
  const top = standings[0]?.score;
  const canRematch = role === "HOST" || role === "COHOST";
  const adjusted = contestants.some((c) => res.adjustments[c.id]);

  return (
    <>
      <AppNav user={user} active="games" />
      <main className="mx-auto flex max-w-6xl flex-col gap-6 px-4 py-6">
        <div className="flex flex-wrap items-end gap-3">
          <div className="flex-1">
            <h1 className="text-2xl font-bold">{game.boardTitle}</h1>
            <div className="text-sm text-white/50">
              {(game.finishedAt ?? game.createdAt).toLocaleString()} · code <span className="tracking-widest">{game.code}</span>
              {game.status !== "FINISHED" && " · still in progress"}
            </div>
          </div>
          <a className="btn-ghost" href={`/api/games/${game.id}/export`}>⬇ CSV</a>
          {canRematch && <RematchSameButton gameId={game.id} />}
          {canRematch && <Link className="btn-ghost" href={`/dashboard?rematch=${game.id}`}>🔁 Rematch, new board</Link>}
          <Link className="btn-ghost" href="/dashboard/games">← History</Link>
        </div>

        <section className="grid gap-2 sm:grid-cols-2 lg:grid-cols-4">
          {standings.map((s) => (
            <div key={s.id} className={`card !p-3 ${s.score === top && standings.length > 0 ? "border-gold" : ""}`}>
              <div className="text-sm text-white/50">#{s.rank}{s.score === top ? " 🏆" : ""}</div>
              <div className="truncate text-lg font-semibold" style={{ color: s.color }}>{s.name}</div>
              <div className={`money text-3xl ${s.score < 0 ? "!text-red-400" : ""}`}>{money(s.score)}</div>
            </div>
          ))}
          {!standings.length && <div className="card text-white/60">No contestants.</div>}
        </section>

        {awards.length > 0 && (
          <section>
            <h2 className="mb-2 text-lg font-semibold">Awards</h2>
            <div className="grid gap-2 sm:grid-cols-2 lg:grid-cols-4">
              {awards.map((a) => (
                <div key={a.id} className="card !p-3">
                  <div className="text-2xl">{a.emoji}</div>
                  <div className="text-sm font-semibold text-gold">{a.title}</div>
                  <div className="truncate font-semibold">{a.name}</div>
                  <div className="text-xs text-white/50">{a.detail}</div>
                </div>
              ))}
            </div>
          </section>
        )}

        {clueRows.length > 0 && (
          <section className="card overflow-x-auto !p-0">
            <table className="w-full min-w-[640px] text-sm">
              <thead className="bg-panel-2 text-left text-white/60">
                <tr>
                  <th className="px-3 py-2">Round</th>
                  <th className="px-3 py-2">Category</th>
                  <th className="px-3 py-2 text-right">Value</th>
                  <th className="px-3 py-2">Clue</th>
                  {contestants.map((c) => (
                    <th key={c.id} className="px-3 py-2 text-right" style={{ color: c.color }}>{c.name}</th>
                  ))}
                </tr>
              </thead>
              <tbody>
                {clueRows.map((r) => (
                  <tr key={r.clueId} className="border-t border-line align-top">
                    <td className="px-3 py-2 whitespace-nowrap text-white/60">{r.roundName}</td>
                    <td className="px-3 py-2">{r.category}</td>
                    <td className="px-3 py-2 text-right">${r.value}</td>
                    <td className="max-w-xs px-3 py-2">
                      <div className="line-clamp-2">{r.text}</div>
                      <div className="text-xs text-gold/80">{r.answer}</div>
                    </td>
                    {contestants.map((c) => {
                      const d = r.deltas[c.id];
                      return (
                        <td key={c.id} className={`px-3 py-2 text-right font-semibold ${d > 0 ? "text-green-400" : d < 0 ? "text-red-400" : "text-white/20"}`}>
                          {d ? `${d > 0 ? "+" : ""}${d.toLocaleString()}` : "—"}
                        </td>
                      );
                    })}
                  </tr>
                ))}
                {adjusted && (
                  <tr className="border-t border-line">
                    <td className="px-3 py-2 text-white/60" colSpan={4}>Manual adjustments</td>
                    {contestants.map((c) => {
                      const d = res.adjustments[c.id];
                      return (
                        <td key={c.id} className="px-3 py-2 text-right text-white/70">{d ? `${d > 0 ? "+" : ""}${d.toLocaleString()}` : "—"}</td>
                      );
                    })}
                  </tr>
                )}
                {res.final && (
                  <tr className="border-t border-line">
                    <td className="px-3 py-2 text-white/60">Final</td>
                    <td className="px-3 py-2">{res.final.category}</td>
                    <td />
                    <td className="max-w-xs px-3 py-2">
                      <div className="line-clamp-2">{res.final.text}</div>
                      <div className="text-xs text-gold/80">{res.final.answer}</div>
                    </td>
                    {contestants.map((c) => {
                      const row = res.final!.rows.find((r) => r.id === c.id);
                      if (!row) return <td key={c.id} className="px-3 py-2 text-right text-white/20">sat out</td>;
                      const d = row.correct === null || row.wager === null ? null : row.correct ? row.wager : -row.wager;
                      return (
                        <td key={c.id} className={`px-3 py-2 text-right font-semibold ${d === null ? "text-white/40" : d >= 0 ? "text-green-400" : "text-red-400"}`}>
                          {d === null ? (row.wager === null ? "no wager" : "not revealed") : `${d >= 0 ? "+" : ""}${d.toLocaleString()}`}
                        </td>
                      );
                    })}
                  </tr>
                )}
                <tr className="border-t-2 border-line bg-panel-2">
                  <td className="px-3 py-2 font-semibold" colSpan={4}>Final score</td>
                  {contestants.map((c) => (
                    <td key={c.id} className="money px-3 py-2 text-right">{money(res.state.scores[c.id] ?? 0)}</td>
                  ))}
                </tr>
              </tbody>
            </table>
          </section>
        )}

        {res.final && res.final.rows.length > 0 && (
          <section className="card">
            <h2 className="mb-2 font-semibold">Final Jeopardy — {res.final.category}</h2>
            <div className="flex flex-col gap-1 text-sm">
              {res.final.rows.map((r) => (
                <div key={r.id} className="flex flex-wrap items-center gap-3 border-b border-line py-1 last:border-0">
                  <span className="w-40 truncate font-semibold" style={{ color: r.color }}>{r.name}</span>
                  <span>wager {r.wager === null ? "—" : `$${r.wager.toLocaleString()}`}</span>
                  <span>{r.correct === null ? "not judged" : r.correct ? "✓ correct" : "✗ wrong"}</span>
                  {r.typed && <span className="text-white/60">typed: “{r.typed}”</span>}
                  {r.hasDrawing && <span className="text-white/40">(handwritten)</span>}
                </div>
              ))}
            </div>
          </section>
        )}
      </main>
    </>
  );
}
