import Link from "next/link";
import { prisma } from "@/server/db";
import { requireUser } from "@/server/session";
import { sha256 } from "@/server/crypto";
import { AcceptInvite } from "@/components/dashboard/AcceptInvite";

export const metadata = { title: "Invitation" };
export const dynamic = "force-dynamic";

export default async function InvitePage({ params }: { params: Promise<{ token: string }> }) {
  const { token } = await params;
  const user = await requireUser(`/invite/${token}`);
  const invite = await prisma.invite.findUnique({ where: { tokenHash: sha256(token) }, include: { owner: { select: { name: true, email: true } } } });
  const valid = invite && !invite.acceptedAt && invite.expiresAt > new Date();

  return (
    <main className="grid min-h-dvh place-items-center p-6">
      <div className="card w-full max-w-md text-center">
        {!valid ? (
          <>
            <div className="text-5xl">⌛</div>
            <h1 className="my-2 text-xl font-bold">This invite is invalid or has expired</h1>
            <p className="mb-4 text-white/60">Ask the host to send you a new one.</p>
            <Link className="btn-ghost" href="/dashboard">Dashboard</Link>
          </>
        ) : invite.ownerId === user.id ? (
          <>
            <h1 className="my-2 text-xl font-bold">That&apos;s your own invite</h1>
            <p className="mb-4 text-white/60">Send the link to the person you invited.</p>
            <Link className="btn-ghost" href="/dashboard/team">Back</Link>
          </>
        ) : (
          <>
            <div className="text-5xl">🎙️</div>
            <h1 className="my-2 text-xl font-bold">{invite.owner.name || invite.owner.email} invited you</h1>
            <p className="mb-1 text-white/70">
              to be a <b>{invite.role === "COHOST" ? "co-host" : "scorekeeper"}</b>
              {invite.role === "COHOST" ? " — you can run their games and edit their boards." : " — you can judge answers and adjust scores in their games."}
            </p>
            {invite.email !== user.email && (
              <p className="mb-2 text-sm text-yellow-300">
                Heads up: this invite was sent to {invite.email}, but you&apos;re signed in as {user.email}.
              </p>
            )}
            <AcceptInvite token={token} />
          </>
        )}
      </div>
    </main>
  );
}
