"use client";

import { useRef, useState } from "react";
import { useRouter } from "next/navigation";
import { TEMPLATES } from "@/shared/board";

export async function call(url: string, method: string, body?: unknown): Promise<{ ok: boolean; data: Record<string, unknown> }> {
  const res = await fetch(url, {
    method,
    headers: body !== undefined ? { "content-type": "application/json" } : undefined,
    body: body !== undefined ? JSON.stringify(body) : undefined,
  });
  const data = (await res.json().catch(() => ({}))) as Record<string, unknown>;
  return { ok: res.ok, data };
}

/** Button that runs an API call (with optional confirm) and refreshes the page. */
export function ActionButton({
  url,
  method = "POST",
  body,
  confirmText,
  children,
  className = "btn-ghost !px-3 !py-1.5 text-sm",
  onDone,
}: {
  url: string;
  method?: string;
  body?: unknown;
  confirmText?: string;
  children: React.ReactNode;
  className?: string;
  onDone?: (data: Record<string, unknown>) => void;
}) {
  const router = useRouter();
  const [busy, setBusy] = useState(false);
  return (
    <button
      type="button"
      className={className}
      disabled={busy}
      onClick={async () => {
        if (confirmText && !confirm(confirmText)) return;
        setBusy(true);
        const r = await call(url, method, body);
        setBusy(false);
        if (!r.ok) return alertError(r.data.error);
        if (onDone) onDone(r.data);
        else router.refresh();
      }}
    >
      {children}
    </button>
  );
}

function alertError(e: unknown) {
  window.alert(typeof e === "string" ? e : "Something went wrong");
}

/** Start a game (or a rematch) from a board, then offer host + display links. */
export function StartGameButton({ boardId, rematchOf, label = "▶ Start game" }: { boardId: string; rematchOf?: string; label?: string }) {
  const [busy, setBusy] = useState(false);
  const [code, setCode] = useState<string | null>(null);
  async function start() {
    setBusy(true);
    const r = rematchOf ? await call(`/api/games/${rematchOf}/rematch`, "POST", { boardId }) : await call("/api/games", "POST", { boardId });
    setBusy(false);
    if (!r.ok) return alertError(r.data.error);
    setCode(String(r.data.code));
  }
  return (
    <>
      <button type="button" className="btn-primary !px-3 !py-1.5 text-sm" disabled={busy} onClick={start}>
        {busy ? "Starting…" : label}
      </button>
      {code && <StartedModal code={code} onClose={() => setCode(null)} />}
    </>
  );
}

function StartedModal({ code, onClose }: { code: string; onClose: () => void }) {
  return (
    <div className="fixed inset-0 z-50 grid place-items-center bg-black/60 p-4" onClick={onClose}>
      <div className="card w-full max-w-sm text-center" onClick={(e) => e.stopPropagation()}>
        <div className="text-sm text-white/60">Game started — join code</div>
        <div className="money my-2 text-5xl tracking-[0.2em]">{code}</div>
        <p className="mb-4 text-sm text-white/60">Open the display on the computer connected to your TV (or cast this tab), then run the game from the host controls.</p>
        <div className="flex flex-col gap-2">
          <a className="btn-ghost" href={`/display/${code}`} target="_blank" rel="noreferrer">📺 Open display in a new tab</a>
          <a className="btn-primary py-3" href={`/host/${code}`}>🎙️ Open host controls</a>
        </div>
      </div>
    </div>
  );
}

/** "New board" picker: templates or import from JSON/CSV. */
export function NewBoardButton() {
  const router = useRouter();
  const [open, setOpen] = useState(false);
  const [title, setTitle] = useState("");
  const [busy, setBusy] = useState(false);
  const [msg, setMsg] = useState<string | null>(null);
  const fileRef = useRef<HTMLInputElement>(null);

  async function create(template: string) {
    setBusy(true);
    const r = await call("/api/boards", "POST", { title: title.trim() || "Untitled board", template });
    setBusy(false);
    if (!r.ok) return setMsg(String(r.data.error ?? "Couldn't create board"));
    router.push(`/boards/${r.data.id}/edit`);
  }

  async function importFile(file: File) {
    if (file.size > 2_000_000) return setMsg("That file is too large (2 MB max)");
    setBusy(true);
    const text = await file.text();
    const r = await call("/api/boards/import", "POST", { text, filename: file.name, title: title.trim() || undefined });
    setBusy(false);
    if (!r.ok) return setMsg(String(r.data.error ?? "Import failed"));
    router.push(`/boards/${r.data.id}/edit`);
  }

  return (
    <>
      <button className="btn-primary" onClick={() => setOpen(true)}>＋ New board</button>
      {open && (
        <div className="fixed inset-0 z-50 grid place-items-center bg-black/60 p-4" onClick={() => setOpen(false)}>
          <div className="card w-full max-w-lg" onClick={(e) => e.stopPropagation()}>
            <h2 className="mb-3 text-xl font-bold">New board</h2>
            <input className="input mb-3" placeholder="Board title" value={title} onChange={(e) => setTitle(e.target.value)} autoFocus maxLength={120} />
            <div className="grid gap-2">
              {TEMPLATES.map((t) => (
                <button key={t.id} disabled={busy} onClick={() => create(t.id)} className="rounded-xl border border-line bg-panel-2 p-3 text-left hover:border-gold">
                  <div className="font-semibold">{t.name}</div>
                  <div className="text-sm text-white/60">{t.description}</div>
                </button>
              ))}
              <button disabled={busy} onClick={() => fileRef.current?.click()} className="rounded-xl border border-dashed border-line p-3 text-left hover:border-gold">
                <div className="font-semibold">📥 Import from file</div>
                <div className="text-sm text-white/60">A board exported as JSON, or a CSV (round, category, value, clue, answer).</div>
              </button>
              <input
                ref={fileRef}
                type="file"
                accept=".json,.csv,application/json,text/csv"
                className="hidden"
                onChange={(e) => {
                  const f = e.target.files?.[0];
                  if (f) void importFile(f);
                  e.target.value = "";
                }}
              />
            </div>
            {msg && <div className="mt-3 rounded-lg bg-red-600/20 p-2 text-sm text-red-300">{msg}</div>}
          </div>
        </div>
      )}
    </>
  );
}

export function CopyButton({ text, label = "Copy link" }: { text: string; label?: string }) {
  const [copied, setCopied] = useState(false);
  return (
    <button
      type="button"
      className="btn-ghost !px-3 !py-1.5 text-sm"
      onClick={() => navigator.clipboard?.writeText(text).then(() => {
        setCopied(true);
        setTimeout(() => setCopied(false), 1500);
      })}
    >
      {copied ? "Copied!" : label}
    </button>
  );
}
