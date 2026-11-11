import { AppNav } from "@/components/AppNav";
import { ActionButton } from "@/components/dashboard/actions";
import { InviteForm } from "@/components/dashboard/InviteForm";
import { prisma } from "@/server/db";
import { requireUser } from "@/server/session";

export const metadata = { title: "Co-hosts" };
export const dynamic = "force-dynamic";

const ROLE_TEXT = {
  COHOST: "Co-host — runs games and edits your boards",
  SCOREKEEPER: "Scorekeeper — adjusts scores during your games",
} as const;

export default async function TeamPage() {
  const user = await requireUser("/dashboard/team");
  const [members, invites, memberships] = await Promise.all([
    prisma.membership.findMany({ where: { ownerId: user.id }, include: { member: { select: { email: true, name: true } } }, orderBy: { createdAt: "asc" } }),
    prisma.invite.findMany({ where: { ownerId: user.id, acceptedAt: null, expiresAt: { gt: new Date() } }, orderBy: { createdAt: "desc" } }),
    prisma.membership.findMany({ where: { memberId: user.id }, include: { owner: { select: { email: true, name: true } } } }),
  ]);

  return (
    <>
      <AppNav user={user} active="team" />
      <main className="mx-auto flex max-w-3xl flex-col gap-6 px-4 py-6">
        <div>
          <h1 className="text-2xl font-bold">Co-hosts & scorekeepers</h1>
          <p className="text-sm text-white/60">
            Invite people to help run your games. Co-hosts get full host controls and can edit your boards. Scorekeepers can only judge answers and adjust scores.
          </p>
        </div>

        <section className="card flex flex-col gap-3">
          <h2 className="font-semibold">Invite someone</h2>
          <InviteForm />
        </section>

        <section className="card flex flex-col gap-2">
          <h2 className="font-semibold">Your team</h2>
          {!members.length && <div className="text-sm text-white/50">Nobody yet.</div>}
          {members.map((m) => (
            <div key={m.id} className="flex flex-wrap items-center gap-2 border-b border-line py-2 last:border-0">
              <div className="min-w-0 flex-1">
                <div className="truncate font-semibold">{m.member.name || m.member.email}</div>
                <div className="truncate text-xs text-white/50">{m.member.email} · {ROLE_TEXT[m.role]}</div>
              </div>
              <ActionButton url={`/api/members/${m.id}`} method="DELETE" confirmText={`Remove ${m.member.email}?`}>Remove</ActionButton>
            </div>
          ))}
        </section>

        {invites.length > 0 && (
          <section className="card flex flex-col gap-2">
            <h2 className="font-semibold">Pending invites</h2>
            {invites.map((i) => (
              <div key={i.id} className="flex flex-wrap items-center gap-2 border-b border-line py-2 last:border-0">
                <div className="min-w-0 flex-1">
                  <div className="truncate">{i.email}</div>
                  <div className="text-xs text-white/50">{i.role === "COHOST" ? "Co-host" : "Scorekeeper"} · expires {i.expiresAt.toLocaleDateString()}</div>
                </div>
                <ActionButton url={`/api/invites/${i.id}`} method="DELETE">Revoke</ActionButton>
              </div>
            ))}
          </section>
        )}

        {memberships.length > 0 && (
          <section className="card flex flex-col gap-2">
            <h2 className="font-semibold">Teams you&apos;re on</h2>
            {memberships.map((m) => (
              <div key={m.id} className="flex flex-wrap items-center gap-2 border-b border-line py-2 last:border-0">
                <div className="min-w-0 flex-1">
                  <div className="truncate font-semibold">{m.owner.name || m.owner.email}</div>
                  <div className="text-xs text-white/50">You&apos;re a {m.role === "COHOST" ? "co-host" : "scorekeeper"}. Their live games show on your dashboard.</div>
                </div>
                <ActionButton url={`/api/members/${m.id}`} method="DELETE" confirmText="Leave this team?">Leave</ActionButton>
              </div>
            ))}
          </section>
        )}
      </main>
    </>
  );
}
