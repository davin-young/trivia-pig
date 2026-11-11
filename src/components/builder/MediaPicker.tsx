"use client";

import { useRef, useState } from "react";
import type { Media } from "@/shared/board";
import { MediaView, youtubeId } from "@/components/game";

export async function uploadFile(file: File): Promise<Media> {
  const fd = new FormData();
  fd.append("file", file);
  const res = await fetch("/api/media", { method: "POST", body: fd });
  const data = await res.json().catch(() => ({}));
  if (!res.ok) throw new Error(data.error ?? "Upload failed");
  return { type: data.type === "audio" ? "audio" : data.type === "video" ? "video" : "image", url: data.url };
}

/** Guess the media type of a pasted URL. */
export function mediaFromUrl(url: string): Media | null {
  const u = url.trim();
  if (!/^(https?:\/\/|\/media\/)/i.test(u)) return null;
  if (youtubeId(u) && /youtu/i.test(u)) return { type: "youtube", url: u };
  if (/\.(mp3|ogg|wav|m4a|aac)(\?|$)/i.test(u)) return { type: "audio", url: u };
  if (/\.(mp4|webm|mov|m4v)(\?|$)/i.test(u)) return { type: "video", url: u };
  return { type: "image", url: u };
}

/**
 * Media slot for a clue or an answer: drag & drop, paste, or pick an image /
 * audio / video file, or paste a video/audio/YouTube/image URL.
 */
export function MediaPicker({ label, value, onChange }: { label: string; value: Media | null | undefined; onChange: (m: Media | null) => void }) {
  const [busy, setBusy] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const [over, setOver] = useState(false);
  const [url, setUrl] = useState("");
  const fileRef = useRef<HTMLInputElement>(null);

  async function handleFile(file: File | undefined | null) {
    if (!file) return;
    setBusy(true);
    setError(null);
    try {
      onChange(await uploadFile(file));
    } catch (e) {
      setError((e as Error).message);
    } finally {
      setBusy(false);
    }
  }

  return (
    <div className="flex flex-col gap-2">
      <div className="text-sm text-white/70">{label}</div>
      {value ? (
        <div className="flex flex-col gap-2 rounded-xl border border-line bg-black/20 p-2">
          <MediaView media={value} className="max-h-40 max-w-full rounded" />
          <div className="flex items-center gap-2 text-xs text-white/50">
            <span className="min-w-0 flex-1 truncate">{value.type} · {value.url}</span>
            <button type="button" className="rounded border border-line px-2 py-1 text-red-300 hover:bg-red-500/20" onClick={() => onChange(null)}>
              Remove
            </button>
          </div>
        </div>
      ) : (
        <div
          tabIndex={0}
          role="button"
          aria-label={`${label}: drop, paste, or click to upload`}
          onClick={() => fileRef.current?.click()}
          onKeyDown={(e) => (e.key === "Enter" || e.key === " ") && fileRef.current?.click()}
          onDragOver={(e) => {
            e.preventDefault();
            setOver(true);
          }}
          onDragLeave={() => setOver(false)}
          onDrop={(e) => {
            e.preventDefault();
            setOver(false);
            void handleFile(e.dataTransfer.files[0]);
          }}
          onPaste={(e) => {
            const file = [...e.clipboardData.files][0];
            if (file) {
              e.preventDefault();
              void handleFile(file);
            }
          }}
          className={`grid min-h-20 cursor-pointer place-items-center rounded-xl border-2 border-dashed p-3 text-center text-sm transition ${
            over ? "border-gold bg-gold/10" : "border-line text-white/50 hover:border-white/40"
          }`}
        >
          {busy ? "Uploading…" : "Drop an image, audio or video file — or click, or paste"}
        </div>
      )}
      <input
        ref={fileRef}
        type="file"
        accept="image/png,image/jpeg,image/gif,image/webp,audio/*,video/mp4,video/webm"
        className="hidden"
        onChange={(e) => {
          void handleFile(e.target.files?.[0]);
          e.target.value = "";
        }}
      />
      {!value && (
        <form
          className="flex gap-2"
          onSubmit={(e) => {
            e.preventDefault();
            const m = mediaFromUrl(url);
            if (!m) return setError("Enter an http(s) URL");
            onChange(m);
            setUrl("");
          }}
        >
          <input className="input !py-1.5 text-sm" placeholder="…or paste a YouTube / video / audio / image URL" value={url} onChange={(e) => setUrl(e.target.value)} />
          <button className="btn-ghost !px-3 !py-1.5 text-sm" disabled={!url.trim()}>
            Add
          </button>
        </form>
      )}
      {error && <div className="text-sm text-red-300">{error}</div>}
    </div>
  );
}
