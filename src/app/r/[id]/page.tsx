import type { Metadata } from "next";
import Link from "next/link";
import { notFound } from "next/navigation";
import { prisma } from "@/server/db";
import { gameLog, gameSetup, gameSummary, summaryStandings } from "@/server/gameAccess";
import { buildRecap, RECAP_CHART_SERIES, type Recap } from "@/server/recap";
import { replay } from "@/engine/reducer";
import { ScoreChart } from "@/components/ScoreChart";
import { ShareButton } from "@/components/ShareButton";
import { APP_NAME } from "@/shared/app";
import type { Award } from "@/engine/awards";

export const dynamic = "force-dynamic";
export const metadata: Metadata = { title: "Game results", robots: { index: false } };

function money(n: number) {
  return (n < 0 ? "-$" : "$") + Math.abs(n).toLocaleString("en-US");
}

/**
 * Public, read-only recap of a finished game: final standings, how the scores moved,
 * a few facts about the game, and the awards.
 * Reached from the QR on the winner screen or the host's "copy results link".
 * The id is unguessable. Category names and point values appear; clue text and answers never do.
 */
export default async function PublicResults({ params }: { params: Promise<{ id: string }> }) {
  const { id } = await params;
  if (!/^[a-z0-9]{10,40}$/i.test(id)) notFound();
  const game = await prisma.game.findUnique({ where: { id }, select: { id: true, status: true, boardTitle: true, finishedAt: true, state: true, code: true, ownerId: true, createdAt: true, updatedAt: true, boardId: true, setup: true, actions: true, rematchOfId: true } });
  if (!game || game.status !== "FINISHED") notFound();
  const sum = gameSummary(game);
  const standings = summaryStandings(sum);
  const awards = (((game.state ?? {}) as { awards?: Award[] }).awards ?? []).filter((a) => a && typeof a.title === "string");
  const top = standings[0]?.score;
  let recap: Recap | null = null;
  try {
    recap = buildRecap(replay(gameSetup(game), gameLog(game)));
  } catch {
    // An old or damaged log: the standings above still stand on their own.
  }
  // The chart shows the top finishers, in finishing order, so colours follow the podium.
  const lines = recap ? standings.slice(0, RECAP_CHART_SERIES).map((s) => recap!.series.find((x) => x.id === s.id)).filter((x) => !!x) : [];
  const facts: { label: string; value: string; detail?: string }[] = [];
  if (recap && recap.steps.length) {
    if (recap.margin !== null) facts.push({ label: "Winning margin", value: recap.margin === 0 ? "A tie" : money(recap.margin) });
    facts.push({ label: "Lead changes", value: String(recap.leadChanges) });
    if (recap.biggest) facts.push({ label: "Biggest swing", value: `${recap.biggest.delta >= 0 ? "+" : "-"}${money(Math.abs(recap.biggest.delta))}`, detail: `${recap.biggest.name} · ${recap.biggest.where}` });
    if (recap.toughest) facts.push({ label: "Toughest category", value: recap.toughest.category, detail: `${recap.toughest.wrong} wrong, ${recap.toughest.right} right` });
    facts.push({ label: "Clues played", value: String(recap.cluesPlayed), detail: recap.nobody ? `${recap.nobody} that nobody got` : undefined });
    if (recap.right + recap.wrong > 0) facts.push({ label: "Answers right", value: `${Math.round((recap.right / (recap.right + recap.wrong)) * 100)}%`, detail: `${recap.right} of ${recap.right + recap.wrong}` });
    if (recap.runaway) facts.push({ label: "Runaway", value: recap.runaway, detail: "Could not be caught going into the final" });
    if (recap.minutes) facts.push({ label: "Game length", value: `${recap.minutes} min` });
  }

  return (
    <main className="mx-auto flex min-h-dvh max-w-2xl flex-col gap-5 px-4 py-8">
      <header className="text-center">
        <Link href="/" className="inline-flex items-center gap-2 font-bold text-white/70">
          <span className="text-2xl">🐷</span>
          <span className="cat-text">{APP_NAME}</span>
        </Link>
        <h1 className="cat-text mt-2 text-3xl sm:text-4xl">{game.boardTitle}</h1>
        <p className="mt-1 text-sm text-white/50">
          Final results{game.finishedAt ? ` · ${game.finishedAt.toLocaleDateString("en-US", { year: "numeric", month: "long", day: "numeric" })}` : ""}
        </p>
      </header>

      <section className="card !p-0">
        {standings.map((s, i) => (
          <div key={s.id} className={`flex items-center gap-3 border-b border-line px-4 py-3 last:border-0 ${s.score === top ? "bg-gold/10" : ""}`}>
            <span className="w-8 text-center text-xl">{s.score === top ? "🏆" : i === 1 ? "🥈" : i === 2 ? "🥉" : i + 1}</span>
            <span className="min-w-0 flex-1 truncate text-lg font-semibold">{s.name}</span>
            <span className={`money text-2xl ${s.score < 0 ? "!text-red-400" : ""}`}>{money(s.score)}</span>
          </div>
        ))}
        {!standings.length && <div className="p-4 text-white/60">Nobody played this one.</div>}
      </section>

      {recap && lines.length > 0 && recap.steps.length > 1 && (
        <section>
          <h2 className="mb-2 text-lg font-bold">How it went{standings.length > lines.length ? ` (top ${lines.length})` : ""}</h2>
          <ScoreChart series={lines} steps={recap.steps} />
        </section>
      )}

      {facts.length > 0 && (
        <section>
          <h2 className="mb-2 text-lg font-bold">The game in numbers</h2>
          <div className="grid grid-cols-2 gap-2 sm:grid-cols-3">
            {facts.map((f) => (
              <div key={f.label} className="card !p-3">
                <div className="text-xs text-white/60">{f.label}</div>
                <div className="truncate text-xl font-bold">{f.value}</div>
                {f.detail && <div className="truncate text-xs text-white/60">{f.detail}</div>}
              </div>
            ))}
          </div>
        </section>
      )}

      {recap && recap.steps.length > 0 && (
        <section>
          <h2 className="mb-2 text-lg font-bold">Player by player</h2>
          <div className="card overflow-x-auto !p-0">
            <table className="w-full text-sm">
              <thead>
                <tr className="border-b border-line text-left text-xs text-white/60">
                  <th className="px-3 py-2 font-medium">Name</th>
                  <th className="px-2 py-2 text-right font-medium">Right</th>
                  <th className="px-2 py-2 text-right font-medium">Wrong</th>
                  {recap.rounds.length > 1 && recap.rounds.map((r, i) => <th key={i} className="px-2 py-2 text-right font-medium">{r}</th>)}
                  {recap.lines.some((l) => l.final !== null) && <th className="px-2 py-2 text-right font-medium">Final</th>}
                  <th className="px-2 py-2 text-right font-medium" title="Clue values only: wagers and the final clue left out">No wagers</th>
                  <th className="px-3 py-2 text-right font-medium">Total</th>
                </tr>
              </thead>
              <tbody>
                {recap.lines.map((l) => (
                  <tr key={l.id} className="border-b border-line last:border-0">
                    <td className="max-w-[9rem] truncate px-3 py-2 font-semibold">{l.name}</td>
                    <td className="px-2 py-2 text-right tabular-nums text-green-400">{l.right}</td>
                    <td className="px-2 py-2 text-right tabular-nums text-red-400">{l.wrong}</td>
                    {recap!.rounds.length > 1 && l.byRound.map((v, i) => <td key={i} className="px-2 py-2 text-right tabular-nums">{money(v)}</td>)}
                    {recap!.lines.some((x) => x.final !== null) && <td className="px-2 py-2 text-right tabular-nums">{l.final === null ? "–" : money(l.final)}</td>}
                    <td className="px-2 py-2 text-right tabular-nums text-white/70">{money(l.base)}</td>
                    <td className="px-3 py-2 text-right font-bold tabular-nums">{money(l.total)}</td>
                  </tr>
                ))}
              </tbody>
            </table>
          </div>
          <p className="mt-1 text-xs text-white/50">“No wagers” counts clue values only, so it shows who knew the most apart from who bet best.</p>
        </section>
      )}

      {awards.length > 0 && (
        <section>
          <h2 className="mb-2 text-lg font-bold">Awards</h2>
          <div className="grid gap-2 sm:grid-cols-2">
            {awards.map((a) => (
              <div key={a.id} className="card flex items-center gap-3 !p-3">
                <span className="text-3xl">{a.emoji}</span>
                <div className="min-w-0">
                  <div className="font-bold text-gold">{a.title}</div>
                  <div className="truncate font-semibold">{a.name}</div>
                  <div className="text-xs text-white/60">{a.detail}</div>
                </div>
              </div>
            ))}
          </div>
        </section>
      )}

      <footer className="mt-auto flex flex-wrap justify-center gap-2 pt-4">
        <ShareButton title={`${game.boardTitle}: results`} text={standings[0] ? `${standings[0].name} won ${game.boardTitle} on ${APP_NAME}.` : `${game.boardTitle} on ${APP_NAME}`} />
        <Link href="/join" className="btn-ghost">Join a game</Link>
        <Link href="/" className="btn-primary">Host your own</Link>
      </footer>
    </main>
  );
}
