import type { Metadata } from "next";
import { notFound } from "next/navigation";
import { AppNav } from "@/components/AppNav";
import { BoardEditor } from "@/components/builder/BoardEditor";
import { boardForUser, parseContent } from "@/server/boards";
import { requireUser } from "@/server/session";

export const metadata: Metadata = { title: "Edit board" };
export const dynamic = "force-dynamic";

export default async function EditBoardPage({ params }: { params: Promise<{ id: string }> }) {
  const { id } = await params;
  const user = await requireUser(`/boards/${id}/edit`);
  const board = await boardForUser(id, user, "edit");
  if (!board) notFound();
  let content;
  try {
    content = parseContent(board.content);
  } catch {
    content = { rounds: [], final: null };
  }
  return (
    <div className="min-h-dvh">
      <AppNav user={user} active="boards" />
      <BoardEditor
        board={{
          id: board.id,
          title: board.title,
          description: board.description,
          tags: board.tags,
          folder: board.folder,
          content,
          shareToken: board.shareToken,
          shareMode: board.shareMode,
        }}
      />
    </div>
  );
}
