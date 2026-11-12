import type { Metadata } from "next";
import { notFound } from "next/navigation";
import { PracticeGame } from "@/components/PracticeGame";
import { prisma } from "@/server/db";
import { parseContent } from "@/server/boards";

export const metadata: Metadata = { title: "Solo practice", robots: { index: false } };
export const dynamic = "force-dynamic";

/** Play a shared board alone. The share link already shows every answer, so this exposes nothing new. */
export default async function PracticeSharedPage({ params }: { params: Promise<{ token: string }> }) {
  const { token } = await params;
  if (!/^[A-Za-z0-9_-]{6,64}$/.test(token)) notFound();
  const board = await prisma.board.findUnique({ where: { shareToken: token }, select: { id: true, title: true, status: true, content: true } });
  if (!board || board.status === "TRASHED") notFound();
  let content;
  try {
    content = parseContent(board.content);
  } catch {
    notFound();
  }
  return <PracticeGame content={content} title={board.title} boardKey={board.id} exitHref={`/share/${token}`} exitLabel="Done" />;
}
