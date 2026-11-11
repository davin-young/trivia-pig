"use client";

import { useEffect, useState } from "react";
import { BoardEditor, GUEST_DRAFT_KEY, type EditorBoard } from "@/components/builder/BoardEditor";
import { TEMPLATES, boardContentSchema, normalizeRound } from "@/shared/board";

/** Read the guest's draft from this browser, or null if there is none (or it is damaged). */
export function loadGuestDraft(): Pick<EditorBoard, "title" | "description" | "tags" | "folder" | "content"> | null {
  try {
    const raw = localStorage.getItem(GUEST_DRAFT_KEY);
    if (!raw) return null;
    const data = JSON.parse(raw) as Record<string, unknown>;
    const parsed = boardContentSchema.parse(data.content);
    return {
      title: typeof data.title === "string" && data.title.trim() ? data.title : "My first board",
      description: typeof data.description === "string" ? data.description : "",
      tags: Array.isArray(data.tags) ? data.tags.filter((t): t is string => typeof t === "string") : [],
      folder: "",
      content: { ...parsed, rounds: parsed.rounds.map(normalizeRound) },
    };
  } catch {
    return null;
  }
}

export function TryEditor() {
  const [board, setBoard] = useState<EditorBoard | null>(null);
  useEffect(() => {
    const draft = loadGuestDraft() ?? { title: "My first board", description: "", tags: [], folder: "", content: TEMPLATES[0].build() };
    // localStorage is only available after mount, so the editor starts on the client.
    setBoard({ id: "guest", shareToken: null, shareMode: "VIEW", ...draft });
  }, []);
  if (!board) return <div className="grid min-h-[60dvh] place-items-center text-white/50">Loading the builder…</div>;
  return <BoardEditor board={board} guest />;
}
