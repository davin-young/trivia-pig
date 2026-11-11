import type { Metadata } from "next";
import Link from "next/link";
import { notFound } from "next/navigation";
import { prisma } from "@/server/db";
import { gameSummary, summaryStandings } from "@/server/gameAccess";
import { APP_NAME } from "@/shared/app";
import type { Award } from "@/engine/awards";

export const dynamic = "force-dynamic";
export const metadata: Metadata = { title: "Game results", robots: { index: false } };

function money(n: number) {
  return (n < 0 ? "-$" : "$") + Math.abs(n).toLocaleString("en-US");
}

/**
 * Public, read-only results for a finished game: final standings and awards.
 * Reached from the QR on the winner screen or the host's "copy results link".
 * The id is unguessable, and nothing here includes clues or answers.
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
        <Link href="/join" className="btn-ghost">Join a game</Link>
        <Link href="/" className="btn-primary">Host your own</Link>
      </footer>
    </main>
  );
}
