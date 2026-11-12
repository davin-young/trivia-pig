import type { Metadata } from "next";
import Link from "next/link";
import { redirect } from "next/navigation";
import { APP_NAME } from "@/shared/app";
import { currentUser } from "@/server/session";
import { TryEditor } from "./TryEditor";

export const dynamic = "force-dynamic";
export const metadata: Metadata = {
  title: "Make a trivia board, no account needed",
  description: "Build a quiz board in your browser right now. Sign in only when you want to save it and host a game.",
  alternates: { canonical: "/try" },
};

/** The board builder with no account: the draft lives in this browser until the person signs in. */
export default async function TryPage() {
  if (await currentUser()) redirect("/try/claim");
  return (
    <div className="min-h-dvh">
      <header className="sticky top-0 z-30 border-b border-line bg-panel/95 backdrop-blur">
        <div className="mx-auto flex max-w-6xl items-center gap-3 px-4 py-2">
          <Link href="/" className="flex items-center gap-2 font-bold">
            <span className="text-2xl">🐷</span>
            <span className="cat-text text-lg">{APP_NAME}</span>
          </Link>
          <span className="rounded-full bg-white/10 px-2 py-0.5 text-xs text-white/70">Trying it out</span>
          <Link href="/gallery" className="ml-auto text-sm text-white/60 hover:text-white">Gallery</Link>
          <Link href="/login?next=/try/claim" className="btn-primary !py-1.5 text-sm">Sign in to save</Link>
        </div>
      </header>
      <TryEditor />
    </div>
  );
}
