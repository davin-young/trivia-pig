"use client";

import { useEffect, useRef } from "react";
import type { Clue } from "@/shared/board";
import { MediaPicker, uploadFile } from "./MediaPicker";

/**
 * Full editor for one clue: text, answer, Daily Double, and media for both.
 * Pasting an image anywhere in the panel (outside the text fields) attaches it to the clue.
 */
export function ClueEditor({
  clue,
  category,
  value,
  onChange,
  onClose,
  onNext,
  onPrev,
}: {
  clue: Clue;
  category: string;
  value: number;
  onChange: (patch: Partial<Clue>) => void;
  onClose: () => void;
  onNext: () => void;
  onPrev: () => void;
}) {
  const textRef = useRef<HTMLTextAreaElement>(null);
  useEffect(() => {
    textRef.current?.focus();
  }, [clue.id]);

  return (
    <div className="fixed inset-0 z-50 flex justify-end bg-black/40" onMouseDown={onClose}>
      <div
        role="dialog"
        aria-label="Edit clue"
        className="flex h-full w-full max-w-lg flex-col bg-panel shadow-2xl"
        onMouseDown={(e) => e.stopPropagation()}
        onKeyDown={(e) => {
          if (e.key === "Escape") onClose();
          if (e.key === "Enter" && (e.metaKey || e.ctrlKey)) {
            e.preventDefault();
            onNext();
          }
        }}
        onPaste={async (e) => {
          const target = e.target as HTMLElement;
          const file = [...e.clipboardData.files].find((f) => f.type.startsWith("image/"));
          if (!file || target.closest("[role=button]")) return;
          e.preventDefault();
          try {
            onChange({ media: await uploadFile(file) });
          } catch (err) {
            alert((err as Error).message);
          }
        }}
      >
        <div className="flex items-center gap-2 border-b border-line px-4 py-3">
          <div className="min-w-0 flex-1">
            <div className="truncate text-sm text-white/60">{category || "Untitled category"}</div>
            <div className="money text-2xl">${value}</div>
          </div>
          <button className="btn-ghost !px-3 !py-1" onClick={onPrev} title="Previous clue">
            ↑
          </button>
          <button className="btn-ghost !px-3 !py-1" onClick={onNext} title="Next clue (Ctrl+Enter)">
            ↓
          </button>
          <button className="btn-primary !px-3 !py-1" onClick={onClose}>
            Done
          </button>
        </div>
        <div className="flex min-h-0 flex-1 flex-col gap-4 overflow-y-auto p-4">
          <label className="flex flex-col gap-1">
            <span className="text-sm text-white/70">Clue (what the board shows)</span>
            <textarea ref={textRef} className="input min-h-28 text-lg" maxLength={2000} value={clue.text} onChange={(e) => onChange({ text: e.target.value })} />
          </label>
          <label className="flex flex-col gap-1">
            <span className="text-sm text-white/70">Answer (host only until revealed)</span>
            <input
              className="input text-lg"
              maxLength={1000}
              value={clue.answer}
              onChange={(e) => onChange({ answer: e.target.value })}
              onKeyDown={(e) => {
                if (e.key === "Enter" && !e.metaKey && !e.ctrlKey) {
                  e.preventDefault();
                  onNext();
                }
              }}
              placeholder="What is …?"
            />
          </label>
          <label className="flex cursor-pointer items-center gap-3 rounded-xl border border-line p-3">
            <input type="checkbox" className="h-5 w-5" checked={clue.dailyDouble} onChange={(e) => onChange({ dailyDouble: e.target.checked })} />
            <span>
              <b className="text-gold">Daily Double</b>
              <span className="block text-xs text-white/50">Used when the game&apos;s Daily Double placement is “as marked on board”.</span>
            </span>
          </label>
          <MediaPicker label="Clue media (shown with the clue)" value={clue.media} onChange={(m) => onChange({ media: m })} />
          <MediaPicker label="Answer media (shown when the answer is revealed)" value={clue.answerMedia} onChange={(m) => onChange({ answerMedia: m })} />
          <p className="text-xs text-white/40">Enter in the answer field (or Ctrl+Enter) saves and moves to the next clue. Esc closes. Changes save automatically.</p>
        </div>
      </div>
    </div>
  );
}
