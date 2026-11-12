import type { Metadata } from "next";
import Link from "next/link";
import type { Prisma } from "@prisma/client";
import { prisma } from "@/server/db";
import { currentUser } from "@/server/session";
import { APP_NAME } from "@/shared/app";
import type { BoardContent } from "@/shared/board";

export const dynamic = "force-dynamic";
export const metadata: Metadata = {
  title: "Trivia board gallery",
  description: "Free, ready-to-play trivia boards shared by other hosts. Preview one, copy it, and start a game in a minute.",
  alternates: { canonical: "/gallery" },
};

const PAGE = 48;

/** Public gallery of boards their owners chose to list. No sign-in needed to browse. */
export default async function GalleryPage({ searchParams }: { searchParams: Promise<{ q?: string; sort?: string }> }) {
  const sp = await searchParams;
  const q = (sp.q ?? "").trim().slice(0, 80);
  const sort = sp.sort === "popular" ? "popular" : "new";
  const user = await currentUser();
  const where: Prisma.BoardWhereInput = {
    listed: true,
    status: "ACTIVE",
    shareToken: { not: null },
    ...(q ? { OR: [{ title: { contains: q, mode: "insensitive" } }, { description: { contains: q, mode: "insensitive" } }, { tags: { has: q.toLowerCase() } }] } : {}),
  };
  const boards = await prisma.board.findMany({
    where,
    orderBy: sort === "popular" ? [{ copies: "desc" }, { listedAt: "desc" }] : [{ listedAt: "desc" }],
    take: PAGE,
    select: { id: true, title: true, description: true, tags: true, shareToken: true, copies: true, content: true, owner: { select: { name: true } } },
  });

  return (
    <main className="mx-auto flex min-h-dvh max-w-6xl flex-col gap-5 px-4 py-6">
      <header className="flex flex-wrap items-center gap-3">
        <Link href="/" className="flex items-center gap-2 font-bold">
          <span className="text-3xl">🐷</span>
          <span className="cat-text text-xl">{APP_NAME}</span>
        </Link>
        <h1 className="mr-auto text-2xl font-bold">Board gallery</h1>
        <Link href={user ? "/dashboard" : "/try"} className="btn-ghost !py-2 text-sm">
          {user ? "My boards" : "Build your own"}
        </Link>
      </header>

      <form method="get" action="/gallery" className="flex flex-wrap gap-2">
        <input className="input min-w-0 flex-1" name="q" defaultValue={q} placeholder="Search by title, topic, or tag" aria-label="Search boards" />
        <select className="input !w-auto" name="sort" defaultValue={sort} aria-label="Sort">
          <option value="new">Newest</option>
          <option value="popular">Most copied</option>
        </select>
        <button className="btn-primary">Search</button>
      </form>

      {!boards.length ? (
        <div className="card text-white/60">
          {q ? `No listed boards match “${q}”.` : "Nobody has listed a board yet."} Hosts can list one from the board editor: Share → “List in the public gallery”.
        </div>
      ) : (
        <div className="grid gap-3 sm:grid-cols-2 lg:grid-cols-3">
          {boards.map((b) => {
            const content = b.content as unknown as BoardContent;
            const clues = (content.rounds ?? []).reduce((n, r) => n + r.categories.reduce((m, c) => m + c.clues.filter((x) => x.text?.trim()).length, 0), 0);
            const cats = (content.rounds?.[0]?.categories ?? []).map((c) => c.name).filter(Boolean).slice(0, 4);
            return (
              <Link key={b.id} href={`/share/${b.shareToken}`} className="card flex flex-col gap-2 transition-colors hover:border-gold">
                <div className="text-lg font-bold leading-tight">{b.title}</div>
                {b.description && <p className="line-clamp-2 text-sm text-white/70">{b.description}</p>}
                {cats.length > 0 && <p className="line-clamp-1 text-xs text-white/50">{cats.join(" · ")}</p>}
                <div className="mt-auto flex flex-wrap items-center gap-1.5 pt-1 text-xs text-white/50">
                  <span>
                    {content.rounds?.length ?? 0} round{content.rounds?.length === 1 ? "" : "s"} · {clues} clues{content.final ? " · Final" : ""}
                  </span>
                  <span className="ml-auto">
                    by {b.owner.name || "a host"}
                    {b.copies > 0 && ` · copied ${b.copies}×`}
                  </span>
                </div>
                {b.tags.length > 0 && (
                  <div className="flex flex-wrap gap-1">
                    {b.tags.slice(0, 5).map((t) => (
                      <span key={t} className="rounded-full bg-white/10 px-2 py-0.5 text-xs">{t}</span>
                    ))}
                  </div>
                )}
              </Link>
            );
          })}
        </div>
      )}
      <p className="text-center text-xs text-white/40">Opening a board shows its answers. Copy it to your own boards to edit and host it.</p>
    </main>
  );
}
