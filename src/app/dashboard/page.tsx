import Link from "next/link";
import type { Prisma } from "@prisma/client";
import { AppNav } from "@/components/AppNav";
import { ActionButton, AiDraftButton, NewBoardButton, StartGameButton } from "@/components/dashboard/actions";
import { prisma } from "@/server/db";
import { requireUser } from "@/server/session";
import { visibleOwnerIds } from "@/server/access";
import { boardSummary } from "@/server/boards";
import { gameSummary } from "@/server/gameAccess";

export const metadata = { title: "Dashboard" };
export const dynamic = "force-dynamic";

type Search = { q?: string; sort?: string; tag?: string; folder?: string; tab?: string; rematch?: string };

const SORTS: Record<string, Prisma.BoardOrderByWithRelationInput> = {
  updated: { updatedAt: "desc" },
  created: { createdAt: "desc" },
  title: { title: "asc" },
};

export default async function Dashboard({ searchParams }: { searchParams: Promise<Search> }) {
  const user = await requireUser("/dashboard");
  const sp = await searchParams;
  const tab = sp.tab === "archived" ? "ARCHIVED" : sp.tab === "trash" ? "TRASHED" : "ACTIVE";
  const sort = sp.sort && SORTS[sp.sort] ? sp.sort : "updated";
  const q = sp.q?.trim() ?? "";

  const visible = await visibleOwnerIds(user.id);
  const boardOwners = visible.filter((o) => o.role !== "SCOREKEEPER").map((o) => o.ownerId);
  const gameOwners = visible.map((o) => o.ownerId);

  const [boards, facets, games, rematchGame, gamesEver] = await Promise.all([
    prisma.board.findMany({
      where: {
        ownerId: { in: boardOwners },
        status: tab,
        ...(sp.tag ? { tags: { has: sp.tag } } : {}),
        ...(sp.folder !== undefined && sp.folder !== "" ? { folder: sp.folder === "-" ? "" : sp.folder } : {}),
        ...(q
          ? {
              OR: [
                { title: { contains: q, mode: "insensitive" } },
                { description: { contains: q, mode: "insensitive" } },
                { tags: { has: q.toLowerCase() } },
                { folder: { contains: q, mode: "insensitive" } },
              ],
            }
          : {}),
      },
      include: { owner: { select: { name: true, email: true } } },
      orderBy: SORTS[sort],
      take: 500,
    }),
    prisma.board.findMany({ where: { ownerId: { in: boardOwners }, status: { not: "TRASHED" } }, select: { tags: true, folder: true } }),
    prisma.game.findMany({
      where: { ownerId: { in: gameOwners }, status: { in: ["LOBBY", "ACTIVE"] } },
      orderBy: { updatedAt: "desc" },
      take: 50,
    }),
    sp.rematch ? prisma.game.findUnique({ where: { id: sp.rematch }, select: { id: true, boardTitle: true, ownerId: true } }) : null,
    prisma.game.count({ where: { ownerId: { in: gameOwners } } }),
  ]);

  const tags = [...new Set(facets.flatMap((b) => b.tags))].sort();
  const folders = [...new Set(facets.map((b) => b.folder).filter(Boolean))].sort();
  const rematch = rematchGame && gameOwners.includes(rematchGame.ownerId) ? rematchGame : null;
  const list = boards.map(boardSummary);

  const href = (patch: Partial<Search>) => {
    const next = { ...sp, ...patch };
    const params = new URLSearchParams(Object.entries(next).filter(([, v]) => v !== undefined && v !== "") as [string, string][]);
    const s = params.toString();
    return `/dashboard${s ? `?${s}` : ""}`;
  };

  return (
    <>
      <AppNav user={user} active="boards" />
      <main className="mx-auto flex max-w-6xl flex-col gap-6 px-4 py-6">
        {rematch && (
          <div className="flex flex-wrap items-center gap-3 rounded-2xl border border-gold/50 bg-gold/10 p-4">
            <span className="text-2xl">🔁</span>
            <div className="flex-1">
              <div className="font-semibold">Pick a board for the rematch</div>
              <div className="text-sm text-white/60">Same players as “{rematch.boardTitle}”, fresh scores. Phones move over automatically.</div>
            </div>
            <Link href={href({ rematch: undefined })} className="btn-ghost !py-1.5 text-sm">Cancel</Link>
          </div>
        )}

        {/* Shown until the first game: the whole flow in three lines. */}
        {gamesEver === 0 && tab === "ACTIVE" && !rematch && (
          <section aria-labelledby="first-game" className="rounded-2xl border border-gold/40 bg-gold/10 p-4 sm:p-5">
            <h2 id="first-game" className="text-lg font-bold">Your first game takes about a minute</h2>
            <ol className="mt-3 grid gap-3 text-sm sm:grid-cols-3">
              <li><span className="font-bold text-gold">1. Start.</span> Press <b>▶ Start game</b> on a board below. The demo board is ready to play.</li>
              <li><span className="font-bold text-gold">2. Show.</span> Open the display on your TV. It shows the room code and a QR code.</li>
              <li><span className="font-bold text-gold">3. Play.</span> Players scan the QR with their phones. You run the game from this device.</li>
            </ol>
            <p className="mt-3 text-sm text-white/70">
              Want your own questions? Use <b>New board</b>, or <Link href="/gallery" className="underline underline-offset-2 hover:text-white">copy one from the gallery</Link>. Playing alone to try it? Add practice bots in the lobby.
            </p>
          </section>
        )}

        {games.length > 0 && (
          <section>
            <h2 className="mb-2 text-lg font-bold">Live games</h2>
            <div className="grid gap-2 sm:grid-cols-2 lg:grid-cols-3">
              {games.map((g) => {
                const sum = gameSummary(g);
                return (
                  <div key={g.id} className="card flex flex-col gap-2 !p-3">
                    <div className="flex items-baseline justify-between gap-2">
                      <span className="money text-2xl tracking-widest">{g.code}</span>
                      <span className={`rounded px-2 text-xs ${g.status === "LOBBY" ? "bg-white/10" : "bg-green-600"}`}>{g.status === "LOBBY" ? "lobby" : "playing"}</span>
                    </div>
                    <div className="truncate font-semibold">{g.boardTitle}</div>
                    <div className="text-xs text-white/50">
                      {sum.players.length} player{sum.players.length === 1 ? "" : "s"} · started {g.createdAt.toLocaleString()}
                    </div>
                    <div className="flex flex-wrap gap-1.5">
                      <Link className="btn-primary !px-3 !py-1.5 text-sm" href={`/host/${g.code}`}>Resume</Link>
                      <a className="btn-ghost !px-3 !py-1.5 text-sm" href={`/display/${g.code}`} target="_blank" rel="noreferrer">Display ↗</a>
                      <ActionButton url={`/api/games/${g.id}/end`} confirmText={`End game ${g.code}?`}>End</ActionButton>
                    </div>
                  </div>
                );
              })}
            </div>
          </section>
        )}

        <section className="flex flex-col gap-3">
          <div className="flex flex-wrap items-center gap-2">
            <h2 className="mr-2 text-lg font-bold">Boards</h2>
            <div className="flex overflow-hidden rounded-lg border border-line text-sm">
              {(
                [
                  ["active", "Active"],
                  ["archived", "Archived"],
                  ["trash", "Trash"],
                ] as const
              ).map(([key, label]) => (
                <Link
                  key={key}
                  href={href({ tab: key === "active" ? undefined : key })}
                  className={`px-3 py-1.5 ${(sp.tab ?? "active") === key ? "bg-white/15" : "hover:bg-white/5"}`}
                >
                  {label}
                </Link>
              ))}
            </div>
            <div className="ml-auto flex gap-2">
              <AiDraftButton />
              <NewBoardButton />
            </div>
          </div>

          <form method="get" action="/dashboard" className="flex flex-wrap gap-2">
            {sp.tab && <input type="hidden" name="tab" value={sp.tab} />}
            {sp.rematch && <input type="hidden" name="rematch" value={sp.rematch} />}
            <input className="input !w-auto flex-1" name="q" defaultValue={q} placeholder="Search boards, tags, folders…" />
            <select name="sort" defaultValue={sort} className="input !w-auto">
              <option value="updated">Recently edited</option>
              <option value="created">Newest</option>
              <option value="title">Title A–Z</option>
            </select>
            <select name="folder" defaultValue={sp.folder ?? ""} className="input !w-auto">
              <option value="">All folders</option>
              <option value="-">No folder</option>
              {folders.map((f) => (
                <option key={f} value={f}>📁 {f}</option>
              ))}
            </select>
            <select name="tag" defaultValue={sp.tag ?? ""} className="input !w-auto">
              <option value="">All tags</option>
              {tags.map((t) => (
                <option key={t} value={t}>#{t}</option>
              ))}
            </select>
            <button className="btn-ghost">Filter</button>
          </form>

          {tab === "TRASHED" && list.length > 0 && <p className="text-sm text-white/50">Boards in the trash can be restored. “Delete forever” can&apos;t be undone.</p>}

          <div className="grid gap-3 sm:grid-cols-2 lg:grid-cols-3">
            {list.map((b) => {
              const mine = b.ownerId === user.id;
              return (
                <div key={b.id} className="card flex flex-col gap-2 !p-4">
                  <div className="flex items-start gap-2">
                    <div className="min-w-0 flex-1">
                      {tab === "TRASHED" ? (
                        <div className="truncate text-lg font-semibold">{b.title}</div>
                      ) : (
                        <Link href={`/boards/${b.id}/edit`} className="block truncate text-lg font-semibold hover:text-gold">{b.title}</Link>
                      )}
                      <div className="text-xs text-white/50">
                        {b.rounds.join(" + ")}{b.hasFinal ? " + Final" : ""} · edited {b.updatedAt.toLocaleDateString()}
                        {!mine && b.ownerName ? ` · ${b.ownerName}’s board` : ""}
                      </div>
                    </div>
                  </div>
                  {b.description && <p className="line-clamp-2 text-sm text-white/60">{b.description}</p>}
                  {(b.folder || b.tags.length > 0) && (
                    <div className="flex flex-wrap gap-1 text-xs">
                      {b.folder && <Link href={href({ folder: b.folder })} className="rounded bg-white/10 px-1.5 py-0.5">📁 {b.folder}</Link>}
                      {b.tags.map((t) => (
                        <Link key={t} href={href({ tag: t })} className="rounded bg-white/10 px-1.5 py-0.5">#{t}</Link>
                      ))}
                    </div>
                  )}
                  <div className="mt-auto flex flex-wrap gap-1.5 pt-1">
                    {tab === "ACTIVE" && (
                      <>
                        <StartGameButton boardId={b.id} rematchOf={rematch?.id} label={rematch ? "🔁 Rematch with this" : "▶ Start game"} />
                        <Link className="btn-ghost !px-3 !py-1.5 text-sm" href={`/boards/${b.id}/edit`}>Edit</Link>
                        <Link className="btn-ghost !px-3 !py-1.5 text-sm" href={`/boards/${b.id}/practice`} title="Play this board alone against the clock">Practice</Link>
                        <ActionButton url={`/api/boards/${b.id}/duplicate`}>Duplicate</ActionButton>
                        <a className="btn-ghost !px-3 !py-1.5 text-sm" href={`/api/boards/${b.id}/export`}>Export</a>
                        <ActionButton url={`/api/boards/${b.id}`} method="PATCH" body={{ action: "archive" }}>Archive</ActionButton>
                        <ActionButton url={`/api/boards/${b.id}`} method="PATCH" body={{ action: "trash" }} confirmText={`Move “${b.title}” to the trash?`}>Trash</ActionButton>
                      </>
                    )}
                    {tab === "ARCHIVED" && (
                      <>
                        <ActionButton url={`/api/boards/${b.id}`} method="PATCH" body={{ action: "unarchive" }}>Unarchive</ActionButton>
                        <ActionButton url={`/api/boards/${b.id}/duplicate`}>Duplicate</ActionButton>
                        <ActionButton url={`/api/boards/${b.id}`} method="PATCH" body={{ action: "trash" }} confirmText={`Move “${b.title}” to the trash?`}>Trash</ActionButton>
                      </>
                    )}
                    {tab === "TRASHED" && (
                      <>
                        <ActionButton url={`/api/boards/${b.id}`} method="PATCH" body={{ action: "restore" }}>Restore</ActionButton>
                        {mine && (
                          <ActionButton
                            url={`/api/boards/${b.id}`}
                            method="DELETE"
                            confirmText={`Permanently delete “${b.title}” and its version history? This can't be undone.`}
                            className="btn-bad !px-3 !py-1.5 text-sm"
                          >
                            Delete forever
                          </ActionButton>
                        )}
                      </>
                    )}
                  </div>
                </div>
              );
            })}
          </div>
          {!list.length && (
            <div className="card flex flex-col items-center gap-3 text-center text-white/60">
              {q || sp.tag || sp.folder ? (
                <>
                  <span>No boards match those filters.</span>
                  <Link href="/dashboard" className="btn-ghost !py-1.5 text-sm">Clear filters</Link>
                </>
              ) : tab === "ACTIVE" ? (
                <>
                  <span>No boards yet. Make one, or copy a ready-made board.</span>
                  <div className="flex flex-wrap justify-center gap-2">
                    <NewBoardButton />
                    <Link href="/gallery" className="btn-ghost">Browse the gallery</Link>
                  </div>
                </>
              ) : tab === "ARCHIVED" ? (
                "No archived boards."
              ) : (
                "The trash is empty."
              )}
            </div>
          )}
        </section>
      </main>
    </>
  );
}
