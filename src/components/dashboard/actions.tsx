"use client";

import { useEffect, useRef, useState } from "react";
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

/** "Draft with AI": only shown when the server has an Anthropic API key configured. */
export function AiDraftButton() {
  const router = useRouter();
  const [enabled, setEnabled] = useState(false);
  const [open, setOpen] = useState(false);
  const [busy, setBusy] = useState(false);
  const [msg, setMsg] = useState<string | null>(null);
  const [form, setForm] = useState({ topic: "", audience: "", difficulty: "medium", rounds: 2, categories: 6, cluesPerCategory: 5, final: true });

  useEffect(() => {
    let live = true;
    void call("/api/boards/generate", "GET").then((r) => live && setEnabled(r.ok && r.data.enabled === true));
    return () => {
      live = false;
    };
  }, []);
  if (!enabled) return null;

  async function submit(e: React.FormEvent) {
    e.preventDefault();
    setBusy(true);
    setMsg(null);
    const r = await call("/api/boards/generate", "POST", { ...form, audience: form.audience.trim() || undefined });
    setBusy(false);
    if (!r.ok) return setMsg(String(r.data.error ?? "Couldn't create a draft"));
    router.push(`/boards/${r.data.id}/edit`);
  }
  const num = (key: "rounds" | "categories" | "cluesPerCategory", label: string, options: number[]) => (
    <label className="flex flex-col gap-1 text-sm">
      <span className="text-white/60">{label}</span>
      <select className="input" value={form[key]} onChange={(e) => setForm({ ...form, [key]: Number(e.target.value) })}>
        {options.map((o) => (
          <option key={o} value={o}>{o}</option>
        ))}
      </select>
    </label>
  );

  return (
    <>
      <button className="btn-ghost" onClick={() => setOpen(true)}>✨ Draft with AI</button>
      {open && (
        <div className="fixed inset-0 z-50 grid place-items-center bg-black/60 p-4" onClick={() => !busy && setOpen(false)}>
          <form className="card flex w-full max-w-lg flex-col gap-3" onClick={(e) => e.stopPropagation()} onSubmit={submit}>
            <h2 className="text-xl font-bold">✨ Draft a board with AI</h2>
            <p className="text-sm text-white/60">Describe a topic and get a full board of categories, clues and answers to edit. AI can get facts wrong, so check each clue before game night.</p>
            <label className="flex flex-col gap-1 text-sm">
              <span className="text-white/60">Topic</span>
              <textarea className="input min-h-20" required minLength={2} maxLength={300} autoFocus placeholder="e.g. 90s movies, our company history, Colorado geography" value={form.topic} onChange={(e) => setForm({ ...form, topic: e.target.value })} />
            </label>
            <label className="flex flex-col gap-1 text-sm">
              <span className="text-white/60">Who is playing? (optional)</span>
              <input className="input" maxLength={200} placeholder="e.g. coworkers, family with kids 10+, trivia regulars" value={form.audience} onChange={(e) => setForm({ ...form, audience: e.target.value })} />
            </label>
            <div className="grid grid-cols-2 gap-3 sm:grid-cols-4">
              <label className="flex flex-col gap-1 text-sm">
                <span className="text-white/60">Difficulty</span>
                <select className="input" value={form.difficulty} onChange={(e) => setForm({ ...form, difficulty: e.target.value })}>
                  <option value="easy">Easy</option>
                  <option value="medium">Medium</option>
                  <option value="hard">Hard</option>
                </select>
              </label>
              {num("rounds", "Rounds", [1, 2])}
              {num("categories", "Categories", [3, 4, 5, 6])}
              {num("cluesPerCategory", "Clues each", [3, 4, 5])}
            </div>
            <label className="flex items-center gap-2 text-sm">
              <input type="checkbox" className="h-4 w-4" checked={form.final} onChange={(e) => setForm({ ...form, final: e.target.checked })} />
              Include Final Jeopardy
            </label>
            {msg && <div className="rounded-lg bg-red-600/20 p-2 text-sm text-red-300">{msg}</div>}
            <div className="flex justify-end gap-2">
              <button type="button" className="btn-ghost" disabled={busy} onClick={() => setOpen(false)}>Cancel</button>
              <button className="btn-primary" disabled={busy || form.topic.trim().length < 2}>{busy ? "Writing clues… (up to a minute)" : "Create draft"}</button>
            </div>
          </form>
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
