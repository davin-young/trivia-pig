import type { Metadata } from "next";
import { notFound } from "next/navigation";
import { PracticeGame } from "@/components/PracticeGame";
import { boardForUser, parseContent } from "@/server/boards";
import { requireUser } from "@/server/session";

export const metadata: Metadata = { title: "Solo practice" };
export const dynamic = "force-dynamic";

/** Play one of your boards alone against the clock. Nothing is saved on the server. */
export default async function PracticeBoardPage({ params }: { params: Promise<{ id: string }> }) {
  const { id } = await params;
  const user = await requireUser(`/boards/${id}/practice`);
  const board = await boardForUser(id, user, "view");
  if (!board || board.status === "TRASHED") notFound();
  return <PracticeGame content={parseContent(board.content)} title={board.title} boardKey={board.id} exitHref="/dashboard" exitLabel="Done" />;
}
