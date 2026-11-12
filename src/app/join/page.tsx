import Link from "next/link";
import { redirect } from "next/navigation";
import { CodeEntry } from "@/components/CodeEntry";
import { APP_NAME } from "@/shared/app";

export const metadata = {
  title: "Join a game",
  description: "Enter the code on the big screen to join a trivia game from your phone. No app and no account needed.",
  alternates: { canonical: "/join" },
};

export default async function JoinPage({ searchParams }: { searchParams: Promise<{ code?: string; audience?: string }> }) {
  const { code, audience } = await searchParams;
  // QR codes link straight here with ?code=XXXX — skip the form.
  // An audience link carries a watch token instead of the room code: it only opens the audience.
  if (code && /^[A-Za-z0-9]{7,80}$/.test(code)) redirect(`/play/${code.toLowerCase()}?audience=1`);
  if (code && /^[A-Za-z0-9]{4,6}$/.test(code)) redirect(`/play/${code.toUpperCase()}${audience === "1" ? "?audience=1" : ""}`);
  return (
    <main className="flex min-h-dvh flex-col items-center justify-center gap-6 bg-gradient-to-b from-[var(--board-deep)] to-[var(--board-edge)] p-6">
      <div className="text-center">
        <div className="text-5xl">🐷</div>
        <h1 className="cat-text mt-2 text-4xl">{APP_NAME}</h1>
        <p className="mt-1 text-white/60">Enter the code shown on the big screen</p>
      </div>
      <div className="w-full max-w-sm">
        <CodeEntry target="/play" cta="Join" />
      </div>
      <p className="text-sm text-white/60">
        Running the game?{" "}
        <Link href="/dashboard" className="underline underline-offset-2 hover:text-white">Host a game</Link>
        {" · "}
        <Link href="/display" className="underline underline-offset-2 hover:text-white">Open the big screen</Link>
      </p>
      <p className="text-sm text-white/60">
        <Link href="/player" className="underline underline-offset-2 hover:text-white">My player card</Link>: your saved name, signature and results
      </p>
    </main>
  );
}
