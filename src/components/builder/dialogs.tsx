"use client";

import { useEffect, useRef, useState } from "react";
import { useRouter } from "next/navigation";
import type { BoardContent, Round } from "@/shared/board";
import { roundFromBulkPaste } from "@/shared/importBoard";

export function Modal({ title, onClose, children, wide }: { title: string; onClose: () => void; children: React.ReactNode; wide?: boolean }) {
  useEffect(() => {
    const onKey = (e: KeyboardEvent) => e.key === "Escape" && onClose();
    window.addEventListener("keydown", onKey);
    return () => window.removeEventListener("keydown", onKey);
  }, [onClose]);
  return (
    <div className="fixed inset-0 z-50 grid place-items-center bg-black/60 p-4" onMouseDown={onClose}>
      <div
        role="dialog"
        aria-label={title}
        className={`card flex max-h-[90dvh] w-full flex-col ${wide ? "max-w-3xl" : "max-w-lg"}`}
        onMouseDown={(e) => e.stopPropagation()}
      >
        <div className="mb-3 flex items-center justify-between gap-2">
          <h2 className="text-lg font-bold">{title}</h2>
          <button className="btn-ghost !px-3 !py-1" onClick={onClose}>
            Close
          </button>
        </div>
        <div className="min-h-0 overflow-y-auto">{children}</div>
      </div>
    </div>
  );
}

// ------------------------------------------------------------- bulk paste

export function BulkPasteDialog({ round, onApply, onClose }: { round: Round; onApply: (r: Round) => void; onClose: () => void }) {
  const [text, setText] = useState("");
  const [error, setError] = useState<string | null>(null);
  let preview: Round | null = null;
  try {
    preview = text.trim() ? roundFromBulkPaste(text, round) : null;
  } catch {
    preview = null;
  }
  return (
    <Modal title={`Bulk paste into ${round.name}`} onClose={onClose} wide>
      <p className="mb-2 text-sm text-white/60">
        Paste rows from a spreadsheet (tab-separated) or CSV: <code>category, value, clue, answer</code> (optional 5th column: <code>dd</code> for a Daily Double). A header row is skipped. This replaces the current round.
      </p>
      <textarea
        className="input min-h-56 font-mono text-sm"
        autoFocus
        placeholder={"Science\t100\tH2O is this\tWhat is water?\nScience\t200\t…\t…"}
        value={text}
        onChange={(e) => setText(e.target.value)}
      />
      {preview && (
        <p className="mt-2 text-sm text-green-300">
          {preview.categories.length} categor{preview.categories.length === 1 ? "y" : "ies"} × {preview.values.length} rows ({preview.values.map((v) => `$${v}`).join(", ")})
        </p>
      )}
      {error && <p className="mt-2 text-sm text-red-300">{error}</p>}
      <div className="mt-3 flex justify-end gap-2">
        <button className="btn-ghost" onClick={onClose}>
          Cancel
        </button>
        <button
          className="btn-primary"
          disabled={!text.trim()}
          onClick={() => {
            try {
              onApply(roundFromBulkPaste(text, round));
              onClose();
            } catch (e) {
              setError((e as Error).message);
            }
          }}
        >
          Replace round
        </button>
      </div>
    </Modal>
  );
}

// --------------------------------------------------------------- details

export interface BoardMeta {
  title: string;
  description: string;
  tags: string[];
  folder: string;
}

export function DetailsDialog({ meta, onSave, onClose }: { meta: BoardMeta; onSave: (m: BoardMeta) => void; onClose: () => void }) {
  const [m, setM] = useState(meta);
  const [tags, setTags] = useState(meta.tags.join(", "));
  return (
    <Modal title="Board details" onClose={onClose}>
      <form
        className="flex flex-col gap-3"
        onSubmit={(e) => {
          e.preventDefault();
          onSave({ ...m, title: m.title.trim() || "Untitled board", tags: tags.split(",").map((t) => t.trim().toLowerCase()).filter(Boolean).slice(0, 20) });
          onClose();
        }}
      >
        <label className="flex flex-col gap-1 text-sm">
          Title
          <input className="input" value={m.title} maxLength={120} onChange={(e) => setM({ ...m, title: e.target.value })} />
        </label>
        <label className="flex flex-col gap-1 text-sm">
          Description
          <textarea className="input min-h-20" value={m.description} maxLength={1000} onChange={(e) => setM({ ...m, description: e.target.value })} />
        </label>
        <label className="flex flex-col gap-1 text-sm">
          Tags (comma separated)
          <input className="input" value={tags} onChange={(e) => setTags(e.target.value)} placeholder="history, kids, holiday" />
        </label>
        <label className="flex flex-col gap-1 text-sm">
          Folder
          <input className="input" value={m.folder} maxLength={80} onChange={(e) => setM({ ...m, folder: e.target.value })} placeholder="e.g. Office parties" />
        </label>
        <div className="flex justify-end gap-2">
          <button type="button" className="btn-ghost" onClick={onClose}>
            Cancel
          </button>
          <button className="btn-primary">Save</button>
        </div>
      </form>
    </Modal>
  );
}

// ----------------------------------------------------------------- share

export function ShareDialog({
  boardId,
  initial,
  onClose,
}: {
  boardId: string;
  initial: { token: string | null; mode: "VIEW" | "COPY"; listed?: boolean };
  onClose: () => void;
}) {
  const [listed, setListed] = useState(!!initial.token && !!initial.listed);
  const [mode, setMode] = useState<"VIEW" | "COPY" | "OFF">(initial.token ? initial.mode : "OFF");
  const [url, setUrl] = useState<string | null>(initial.token ? `${typeof window !== "undefined" ? window.location.origin : ""}/share/${initial.token}` : null);
  const [busy, setBusy] = useState(false);
  const [copied, setCopied] = useState(false);
  const [error, setError] = useState<string | null>(null);

  async function apply(next: "VIEW" | "COPY" | "OFF", list?: boolean) {
    setBusy(true);
    setError(null);
    const res = await fetch(`/api/boards/${boardId}/share`, { method: "POST", headers: { "content-type": "application/json" }, body: JSON.stringify({ mode: next, listed: list }) });
    const data = await res.json().catch(() => ({}));
    setBusy(false);
    if (!res.ok) return setError(data.error ?? "Couldn't update sharing");
    setMode(next);
    setUrl(data.url ?? null);
    setListed(!!data.listed);
  }

  const options: { id: "OFF" | "VIEW" | "COPY"; label: string; hint: string }[] = [
    { id: "OFF", label: "Not shared", hint: "Only you (and co-hosts) can see this board." },
    { id: "VIEW", label: "View-only link", hint: "Anyone with the link can browse the clues and answers." },
    { id: "COPY", label: "View + make a copy", hint: "Signed-in hosts can copy it into their own boards." },
  ];
  return (
    <Modal title="Share board" onClose={onClose}>
      <div className="flex flex-col gap-2">
        {options.map((o) => (
          <button key={o.id} disabled={busy} onClick={() => apply(o.id)} className={`rounded-xl border p-3 text-left ${mode === o.id ? "border-gold bg-gold/10" : "border-line hover:bg-white/5"}`}>
            <div className="font-semibold">{o.label}</div>
            <div className="text-sm text-white/60">{o.hint}</div>
          </button>
        ))}
        {url && mode !== "OFF" && (
          <div className="mt-2 flex gap-2">
            <input className="input text-sm" readOnly value={url} onFocus={(e) => e.target.select()} />
            <button
              className="btn-primary"
              onClick={() => {
                void navigator.clipboard?.writeText(url).then(() => {
                  setCopied(true);
                  setTimeout(() => setCopied(false), 1500);
                });
              }}
            >
              {copied ? "Copied" : "Copy"}
            </button>
          </div>
        )}
        {mode === "COPY" && (
          <label className="mt-1 flex cursor-pointer items-start gap-3 rounded-xl border border-line p-3">
            <input type="checkbox" className="mt-1 h-4 w-4" checked={listed} disabled={busy} onChange={(e) => apply("COPY", e.target.checked)} />
            <span>
              <span className="font-semibold">List in the public gallery</span>
              <span className="block text-sm text-white/60">
                Anyone can find this board at <a className="underline" href="/gallery" target="_blank" rel="noreferrer">/gallery</a>, with its title, description, tags and your name.
              </span>
            </span>
          </label>
        )}
        <p className="text-xs text-white/40">Sharing a board shows its answers. Don&apos;t share a board you&apos;re about to play with the same people.</p>
        {error && <p className="text-sm text-red-300">{error}</p>}
      </div>
    </Modal>
  );
}

// --------------------------------------------------------------- versions

interface VersionRow {
  id: string;
  title: string;
  label: string;
  createdAt: string;
}

export function VersionsDialog({ boardId, onClose, beforeRestore }: { boardId: string; onClose: () => void; beforeRestore: () => Promise<void> }) {
  const [versions, setVersions] = useState<VersionRow[] | null>(null);
  const [viewing, setViewing] = useState<{ id: string; title: string; content: BoardContent } | null>(null);
  const [label, setLabel] = useState("");
  const [error, setError] = useState<string | null>(null);
  const [busy, setBusy] = useState(false);

  async function load() {
    const res = await fetch(`/api/boards/${boardId}/versions`);
    const data = await res.json().catch(() => ({}));
    if (!res.ok) return setError(data.error ?? "Couldn't load versions");
    setVersions(data.versions);
  }
  const loaded = useRef(false);
  useEffect(() => {
    if (loaded.current) return;
    loaded.current = true;
    void load();
  });

  async function view(id: string) {
    const res = await fetch(`/api/boards/${boardId}/versions/${id}`);
    const data = await res.json().catch(() => ({}));
    if (res.ok) setViewing({ id, title: data.title, content: data.content });
  }

  async function restore(id: string) {
    if (!confirm("Restore this version? Your current board is saved as a version first, so you can undo this.")) return;
    setBusy(true);
    await beforeRestore();
    const res = await fetch(`/api/boards/${boardId}/versions/${id}`, { method: "POST" });
    setBusy(false);
    if (!res.ok) return setError("Restore failed");
    window.location.reload();
  }

  return (
    <Modal title="Version history" onClose={onClose} wide>
      <form
        className="mb-3 flex gap-2"
        onSubmit={async (e) => {
          e.preventDefault();
          setBusy(true);
          await beforeRestore();
          await fetch(`/api/boards/${boardId}/versions`, { method: "POST", headers: { "content-type": "application/json" }, body: JSON.stringify({ label }) });
          setBusy(false);
          setLabel("");
          void load();
        }}
      >
        <input className="input" placeholder="Label (optional), e.g. Before party edits" value={label} maxLength={80} onChange={(e) => setLabel(e.target.value)} />
        <button className="btn-primary shrink-0" disabled={busy}>
          Save version now
        </button>
      </form>
      <p className="mb-2 text-xs text-white/40">Versions are also saved automatically while you edit (at most every 10 minutes).</p>
      {error && <p className="text-sm text-red-300">{error}</p>}
      {!versions && <p className="text-white/50">Loading…</p>}
      {versions?.length === 0 && <p className="text-white/50">No versions yet.</p>}
      <div className="flex flex-col gap-1">
        {versions?.map((v) => (
          <div key={v.id} className={`rounded-lg border px-3 py-2 ${viewing?.id === v.id ? "border-gold" : "border-line"}`}>
            <div className="flex flex-wrap items-center gap-2 text-sm">
              <span className="font-semibold">{new Date(v.createdAt).toLocaleString()}</span>
              {v.label && <span className="rounded bg-white/10 px-2 text-xs">{v.label}</span>}
              <span className="min-w-0 flex-1 truncate text-white/50">{v.title}</span>
              <button className="rounded border border-line px-2 py-1 text-xs hover:bg-white/10" onClick={() => (viewing?.id === v.id ? setViewing(null) : view(v.id))}>
                {viewing?.id === v.id ? "Hide" : "View"}
              </button>
              <button className="rounded border border-gold/50 px-2 py-1 text-xs text-gold hover:bg-gold/10" disabled={busy} onClick={() => restore(v.id)}>
                Restore
              </button>
            </div>
            {viewing?.id === v.id && <VersionSummary content={viewing.content} />}
          </div>
        ))}
      </div>
    </Modal>
  );
}

function VersionSummary({ content }: { content: BoardContent }) {
  return (
    <div className="mt-2 flex flex-col gap-2 text-xs text-white/70">
      {content.rounds.map((r) => (
        <div key={r.id}>
          <div className="font-semibold text-white">{r.name}</div>
          <ul className="ml-4 list-disc">
            {r.categories.map((c) => (
              <li key={c.id}>
                {c.name || "(untitled)"}: {c.clues.filter((q) => q.text.trim()).length}/{c.clues.length} clues
              </li>
            ))}
          </ul>
        </div>
      ))}
      {content.final && (
        <div>
          <span className="font-semibold text-white">Final:</span> {content.final.category} — {content.final.text}
        </div>
      )}
    </div>
  );
}

// ----------------------------------------------------------------- import

/** "Import CSV/JSON as a new board" button; navigates to the new board's editor. */
export function ImportBoardButton({ className, label = "Import CSV / JSON" }: { className?: string; label?: string }) {
  const router = useRouter();
  const ref = useRef<HTMLInputElement>(null);
  const [busy, setBusy] = useState(false);
  return (
    <>
      <button type="button" className={className ?? "btn-ghost"} disabled={busy} onClick={() => ref.current?.click()}>
        {busy ? "Importing…" : label}
      </button>
      <input
        ref={ref}
        type="file"
        accept=".csv,.tsv,.txt,.json,text/csv,application/json"
        className="hidden"
        onChange={async (e) => {
          const file = e.target.files?.[0];
          e.target.value = "";
          if (!file) return;
          setBusy(true);
          const fd = new FormData();
          fd.append("file", file);
          const res = await fetch("/api/boards/import", { method: "POST", body: fd });
          const data = await res.json().catch(() => ({}));
          setBusy(false);
          if (!res.ok) return alert(data.error ?? "Import failed");
          router.push(`/boards/${data.id}/edit`);
        }}
      />
    </>
  );
}
