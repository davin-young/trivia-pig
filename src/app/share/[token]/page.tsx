import type { Metadata } from "next";
import Link from "next/link";
import { notFound } from "next/navigation";
import { prisma } from "@/server/db";
import { parseContent } from "@/server/boards";
import { currentUser } from "@/server/session";
import { BoardPreview } from "@/components/builder/BoardPreview";
import { APP_NAME } from "@/shared/app";
import { CopyBoardButton } from "./CopyBoardButton";

export const dynamic = "force-dynamic";
export const metadata: Metadata = { title: "Shared board", robots: { index: false } };

export default async function SharedBoardPage({ params }: { params: Promise<{ token: string }> }) {
  const { token } = await params;
  if (!/^[A-Za-z0-9_-]{6,64}$/.test(token)) notFound();
  const board = await prisma.board.findUnique({ where: { shareToken: token }, include: { owner: { select: { name: true } } } });
  if (!board || board.status === "TRASHED") notFound();
  const user = await currentUser();
  let content;
  try {
    content = parseContent(board.content);
  } catch {
    notFound();
  }
  const clueCount = content.rounds.reduce((n, r) => n + r.categories.reduce((m, c) => m + c.clues.filter((q) => q.text.trim()).length, 0), 0);
  return (
    <div className="min-h-dvh">
      <div className="mx-auto flex max-w-5xl flex-wrap items-center gap-3 px-4 py-4">
        <Link href="/" className="text-2xl" title={APP_NAME}>
          🐷
        </Link>
        <div className="min-w-0 flex-1">
          <h1 className="truncate text-2xl font-bold">{board.title}</h1>
          <p className="text-sm text-white/60">
            Shared by {board.owner.name || "a host"} · {content.rounds.length} round{content.rounds.length === 1 ? "" : "s"} · {clueCount} clues
            {content.final ? " · Final" : ""}
          </p>
          {board.description && <p className="mt-1 text-sm text-white/70">{board.description}</p>}
        </div>
        <Link href={`/share/${token}/practice`} className="btn-ghost" title="Play this board alone against the clock">🎯 Practice solo</Link>
        {board.shareMode === "COPY" && <CopyBoardButton token={token} signedIn={!!user} />}
      </div>
      <div className="h-[80dvh] overflow-hidden border-y border-line">
        <BoardPreview content={content} title={board.title} />
      </div>
      <p className="px-4 py-3 text-center text-xs text-white/40">Click a clue to see it, click again for the answer. Spoiler warning: this shows every answer.</p>
    </div>
  );
}
