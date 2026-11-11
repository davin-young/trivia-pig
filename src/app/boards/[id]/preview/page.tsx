import type { Metadata } from "next";
import { notFound } from "next/navigation";
import { BoardPreview } from "@/components/builder/BoardPreview";
import { boardForUser, parseContent } from "@/server/boards";
import { requireUser } from "@/server/session";

export const metadata: Metadata = { title: "Preview board" };
export const dynamic = "force-dynamic";

export default async function PreviewBoardPage({ params }: { params: Promise<{ id: string }> }) {
  const { id } = await params;
  const user = await requireUser(`/boards/${id}/preview`);
  const board = await boardForUser(id, user, "view");
  if (!board) notFound();
  return <BoardPreview content={parseContent(board.content)} title={board.title} />;
}
