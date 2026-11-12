import Link from "next/link";
import { CodeEntry } from "@/components/CodeEntry";

export const metadata = {
  title: "Open the big screen",
  description: "Show a trivia game on a TV or projector: enter the game code, then cast or plug in this screen. No sign-in needed.",
  alternates: { canonical: "/display" },
};

export default function DisplayEntry() {
  return (
    <main className="grid min-h-dvh place-items-center p-6">
      <div className="card w-full max-w-sm">
        <h1 className="mb-1 text-2xl font-bold">Open the big screen</h1>
        <p className="mb-4 text-sm text-white/60">Enter the game code, then cast this tab or plug the computer into the TV. No sign-in needed.</p>
        <CodeEntry target="/display" cta="Open display" />
        <p className="mt-4 text-center text-sm text-white/60">
          No code yet? <Link href="/dashboard" className="underline underline-offset-2 hover:text-white">Start a game</Link>
          {" · "}
          <Link href="/join" className="underline underline-offset-2 hover:text-white">Join as a player</Link>
        </p>
      </div>
    </main>
  );
}
