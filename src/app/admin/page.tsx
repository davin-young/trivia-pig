import { notFound } from "next/navigation";
import { AppNav } from "@/components/AppNav";
import { ActionButton } from "@/components/dashboard/actions";
import { prisma } from "@/server/db";
import { requireUser } from "@/server/session";

export const metadata = { title: "Admin" };
export const dynamic = "force-dynamic";

function bytes(n: number) {
  if (n < 1024) return `${n} B`;
  if (n < 1024 ** 2) return `${(n / 1024).toFixed(1)} KB`;
  if (n < 1024 ** 3) return `${(n / 1024 ** 2).toFixed(1)} MB`;
  return `${(n / 1024 ** 3).toFixed(2)} GB`;
}

export default async function AdminPage({ searchParams }: { searchParams: Promise<{ media?: string }> }) {
  const user = await requireUser("/admin");
  if (!user.isAdmin) notFound();
  const { media: mediaPage } = await searchParams;
  const take = mediaPage === "all" ? 1000 : 60;

  const [users, usage, media, totals] = await Promise.all([
    prisma.user.findMany({ orderBy: { createdAt: "asc" }, include: { _count: { select: { boards: true, games: true } } } }),
    prisma.media.groupBy({ by: ["ownerId"], _sum: { size: true }, _count: true }),
    prisma.media.findMany({ orderBy: { size: "desc" }, take, include: { owner: { select: { email: true } } } }),
    Promise.all([prisma.board.count(), prisma.game.count(), prisma.game.count({ where: { status: { not: "FINISHED" } } }), prisma.media.aggregate({ _sum: { size: true }, _count: true })]),
  ]);
  const usageBy = new Map(usage.map((u) => [u.ownerId, { size: u._sum.size ?? 0, count: u._count }]));
  const [boardCount, gameCount, liveCount, mediaAgg] = totals;

  return (
    <>
      <AppNav user={user} active="admin" />
      <main className="mx-auto flex max-w-6xl flex-col gap-6 px-4 py-6">
        <h1 className="text-2xl font-bold">Admin</h1>
        <section className="grid grid-cols-2 gap-2 sm:grid-cols-5">
          {[
            ["Users", users.length],
            ["Boards", boardCount],
            ["Games", gameCount],
            ["Live games", liveCount],
            ["Media", `${mediaAgg._count} · ${bytes(mediaAgg._sum.size ?? 0)}`],
          ].map(([label, value]) => (
            <div key={label} className="card !p-3">
              <div className="text-xs text-white/50">{label}</div>
              <div className="text-xl font-bold">{value}</div>
            </div>
          ))}
        </section>

        <section className="card overflow-x-auto !p-0">
          <table className="w-full min-w-[720px] text-sm">
            <thead className="bg-panel-2 text-left text-white/60">
              <tr>
                <th className="px-3 py-2">User</th>
                <th className="px-3 py-2">Joined</th>
                <th className="px-3 py-2 text-right">Boards</th>
                <th className="px-3 py-2 text-right">Games</th>
                <th className="px-3 py-2 text-right">Storage</th>
                <th className="px-3 py-2">Sign-in</th>
                <th className="px-3 py-2" />
              </tr>
            </thead>
            <tbody>
              {users.map((u) => {
                const use = usageBy.get(u.id);
                const me = u.id === user.id;
                return (
                  <tr key={u.id} className="border-t border-line">
                    <td className="px-3 py-2">
                      <div className="font-semibold">{u.name || "—"} {u.isAdmin && <span className="rounded bg-gold px-1.5 text-xs text-black">admin</span>}</div>
                      <div className="text-xs text-white/50">{u.email}</div>
                    </td>
                    <td className="px-3 py-2 text-white/60">{u.createdAt.toLocaleDateString()}</td>
                    <td className="px-3 py-2 text-right">{u._count.boards}</td>
                    <td className="px-3 py-2 text-right">{u._count.games}</td>
                    <td className="px-3 py-2 text-right">{use ? `${bytes(use.size)} (${use.count})` : "—"}</td>
                    <td className="px-3 py-2 text-xs text-white/60">{[u.passwordHash && "password", u.oidcSub && "SSO"].filter(Boolean).join(" + ") || "email link"}</td>
                    <td className="px-3 py-2">
                      {!me && (
                        <div className="flex justify-end gap-1.5">
                          <ActionButton url={`/api/admin/users/${u.id}`} method="PATCH" body={{ isAdmin: !u.isAdmin }} confirmText={u.isAdmin ? `Remove admin from ${u.email}?` : `Make ${u.email} an admin?`}>
                            {u.isAdmin ? "Revoke admin" : "Make admin"}
                          </ActionButton>
                          <ActionButton
                            url={`/api/admin/users/${u.id}`}
                            method="DELETE"
                            className="btn-bad !px-3 !py-1.5 text-sm"
                            confirmText={`Permanently delete ${u.email} with all their boards, games and uploads? This can't be undone.`}
                          >
                            Delete
                          </ActionButton>
                        </div>
                      )}
                    </td>
                  </tr>
                );
              })}
            </tbody>
          </table>
        </section>

        <section className="flex flex-col gap-2">
          <div className="flex items-baseline justify-between">
            <h2 className="text-lg font-bold">Media (largest first)</h2>
            {mediaAgg._count > media.length && <a className="text-sm text-gold underline" href="/admin?media=all">Show all {mediaAgg._count}</a>}
          </div>
          {!media.length && <div className="card text-white/60">No uploads yet.</div>}
          <div className="grid grid-cols-2 gap-2 sm:grid-cols-3 lg:grid-cols-4">
            {media.map((m) => (
              <div key={m.id} className="card flex flex-col gap-1.5 !p-2 text-xs">
                <a href={`/media/${m.key}`} target="_blank" rel="noreferrer" className="grid aspect-video place-items-center overflow-hidden rounded bg-black/40">
                  {m.mime.startsWith("image/") ? (
                    <img src={`/media/${m.key}`} alt={m.filename} loading="lazy" className="h-full w-full object-contain" />
                  ) : (
                    <span className="text-3xl">{m.mime.startsWith("audio/") ? "🎵" : m.mime.startsWith("video/") ? "🎬" : "📄"}</span>
                  )}
                </a>
                <div className="truncate" title={m.filename}>{m.filename || m.key}</div>
                <div className="truncate text-white/50">{bytes(m.size)} · {m.owner.email}</div>
                <ActionButton url={`/api/admin/media/${m.id}`} method="DELETE" confirmText="Delete this file? Boards using it will show a broken image." className="btn-ghost !px-2 !py-1 text-xs text-red-300">
                  Delete
                </ActionButton>
              </div>
            ))}
          </div>
        </section>
      </main>
    </>
  );
}
