import Link from "next/link";
import { APP_NAME } from "@/components/game";
import { currentUser } from "@/server/session";

export const dynamic = "force-dynamic";

export default async function Home() {
  const user = await currentUser();
  return (
    <main className="flex min-h-dvh flex-col items-center justify-center gap-8 bg-gradient-to-b from-[var(--board-deep)] to-[var(--board-edge)] p-6 text-center">
      <div>
        <div className="text-6xl">🐷</div>
        <h1 className="cat-text mt-2 text-5xl sm:text-7xl">{APP_NAME}</h1>
        <p className="mt-2 text-white/70">Quiz-show night: a big-screen board, host controls on any device, and buzzers on everyone&apos;s phone.</p>
      </div>
      <div className="grid w-full max-w-md gap-3">
        <Link href="/join" className="btn-primary py-4 text-xl">📱 Join a game</Link>
        <Link href="/display" className="btn-ghost py-3">📺 Open a display</Link>
        <Link href={user ? "/dashboard" : "/login"} className="btn-ghost py-3">🎙️ {user ? "Host dashboard" : "Host sign in"}</Link>
        <div className="grid grid-cols-2 gap-3">
          {!user && <Link href="/try" className="btn-ghost py-3 text-sm">✏️ Try the board builder</Link>}
          <Link href="/gallery" className={`btn-ghost py-3 text-sm ${user ? "col-span-2" : ""}`}>🖼️ Board gallery</Link>
        </div>
      </div>
    </main>
  );
}
