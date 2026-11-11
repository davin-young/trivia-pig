import type { Metadata } from "next";
import Link from "next/link";
import { cookies } from "next/headers";
import { getManager } from "@/server/live";
import { currentUser } from "@/server/session";
import { hostRoleFor } from "@/server/access";
import { pairing } from "@/server/pairingStore";
import { grantCookieName } from "@/server/pairing";
import HostClient from "./HostClient";

export const metadata: Metadata = { title: "Host" };
export const dynamic = "force-dynamic";

export default async function HostPage({ params }: { params: Promise<{ code: string }> }) {
  const code = (await params).code.toUpperCase();
  const game = await getManager().findByCode(code);
  if (!game) {
    return (
      <main className="grid min-h-dvh place-items-center p-6">
        <div className="card text-center">
          <h1 className="mb-2 text-xl font-bold">No game with code {code}</h1>
          <Link href="/dashboard" className="btn-primary">Dashboard</Link>
        </div>
      </main>
    );
  }
  const user = await currentUser();
  let role = user ? await hostRoleFor(user.id, game.ownerId) : null;
  if (!role) {
    const grant = (await cookies()).get(grantCookieName(code))?.value;
    role = (await pairing.verifyGrant(grant, game.id))?.role ?? null;
  }
  if (!role) {
    return (
      <main className="grid min-h-dvh place-items-center p-6">
        <div className="card max-w-md text-center">
          <h1 className="mb-2 text-xl font-bold">Host controls are private</h1>
          <p className="mb-4 text-white/70">Sign in as the game&apos;s owner, or scan the pairing QR code from the host&apos;s screen (Devices → Hand off).</p>
          <Link href={`/login?next=/host/${code}`} className="btn-primary">Sign in</Link>
        </div>
      </main>
    );
  }
  return <HostClient code={code} gameId={game.id} role={role} />;
}
