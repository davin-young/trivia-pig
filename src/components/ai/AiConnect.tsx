"use client";

import { useEffect, useState } from "react";
import { useRouter } from "next/navigation";

/** A block of text with a Copy button (prompts, commands, config). */
export function CopyBlock({ text, label, tall }: { text: string; label?: string; tall?: boolean }) {
  const [copied, setCopied] = useState(false);
  return (
    <div className="overflow-hidden rounded-xl border border-line bg-black/30">
      <div className="flex items-center justify-between gap-2 border-b border-line px-3 py-1.5">
        <span className="text-xs text-white/60">{label}</span>
        <button
          type="button"
          className="rounded bg-white/10 px-2.5 py-1 text-xs font-semibold hover:bg-white/20"
          onClick={async () => {
            try {
              await navigator.clipboard.writeText(text);
              setCopied(true);
              setTimeout(() => setCopied(false), 1500);
            } catch {}
          }}
        >
          {copied ? "Copied ✓" : "Copy"}
        </button>
      </div>
      <pre className={`overflow-auto whitespace-pre-wrap break-words p-3 text-xs leading-relaxed text-white/85 ${tall ? "max-h-72" : "max-h-48"}`}>{text}</pre>
    </div>
  );
}

/** AI replies often arrive wrapped in a ```json fence or with a sentence around them. */
function extractJson(text: string): unknown {
  // Everything from the first { to the last } is the board, whatever is wrapped around it.
  const body = text;
  const start = body.indexOf("{");
  const end = body.lastIndexOf("}");
  if (start < 0 || end <= start) throw new Error("That does not look like a board. Paste the whole reply, from the first { to the last }.");
  return JSON.parse(body.slice(start, end + 1));
}

type Review = { ok: boolean; clues: number; rounds: string[]; hasFinal: boolean; problems: string[]; warnings: string[] };

/** Paste what the assistant wrote and get a board. Signed-in hosts only. */
export function PasteBoard() {
  const router = useRouter();
  const [text, setText] = useState("");
  const [busy, setBusy] = useState(false);
  const [msg, setMsg] = useState<string | null>(null);
  const [review, setReview] = useState<Review | null>(null);

  async function send(path: string) {
    setMsg(null);
    setReview(null);
    let board: unknown;
    try {
      board = extractJson(text);
    } catch (e) {
      return setMsg(e instanceof SyntaxError ? "The reply is not complete JSON. Ask the assistant to send the whole board again." : (e as Error).message);
    }
    setBusy(true);
    try {
      const r = await fetch(path, { method: "POST", headers: { "content-type": "application/json" }, body: JSON.stringify(board) });
      const data = (await r.json().catch(() => ({}))) as { error?: string; id?: string } & Partial<Review>;
      if (!r.ok) return setMsg(data.error ?? "That did not work. Try again.");
      if (data.id) return router.push(`/boards/${data.id}/edit`);
      setReview(data as Review);
    } catch {
      setMsg("Could not reach the server. Check your connection and try again.");
    } finally {
      setBusy(false);
    }
  }

  return (
    <div className="flex flex-col gap-2">
      <textarea
        className="input min-h-36 font-mono text-xs"
        placeholder="Paste the assistant's reply here"
        aria-label="The assistant's reply"
        value={text}
        onChange={(e) => setText(e.target.value)}
        spellCheck={false}
      />
      <div className="flex flex-wrap gap-2">
        <button className="btn-primary" disabled={busy || !text.trim()} onClick={() => send("/api/v1/boards")}>
          {busy ? "Working…" : "Create board"}
        </button>
        <button className="btn-ghost" disabled={busy || !text.trim()} onClick={() => send("/api/v1/boards/check")}>
          Check it first
        </button>
      </div>
      {msg && <div role="alert" className="rounded-lg bg-red-600/20 p-3 text-sm text-red-200">{msg}</div>}
      {review && (
        <div className="rounded-lg bg-white/5 p-3 text-sm">
          <div className="font-semibold">
            {review.ok ? "✓ Ready to create" : "✗ Needs fixing"}: {review.clues} clues, {review.rounds.join(" + ")}
            {review.hasFinal ? ", with a final" : ", no final"}
          </div>
          {[...review.problems, ...review.warnings].length > 0 && (
            <ul className="mt-1 list-disc pl-5 text-white/70">
              {[...review.problems, ...review.warnings].slice(0, 12).map((w, i) => (
                <li key={i}>{w}</li>
              ))}
            </ul>
          )}
        </div>
      )}
    </div>
  );
}

type TokenRow = { id: string; name: string; hint: string; lastUsedAt: string | null; createdAt: string };

/** Create, see and revoke personal tokens, with ready-to-paste setup for the new one. */
interface AppRow {
  id: string;
  name: string;
  createdAt: string;
  lastUsedAt: string | null;
}

/** Apps connected by signing in (OAuth), with a button to disconnect each one. */
export function ConnectedApps() {
  const [apps, setApps] = useState<AppRow[] | null>(null);
  async function load() {
    const r = await fetch("/api/me/apps");
    if (r.ok) setApps(((await r.json()) as { apps: AppRow[] }).apps);
  }
  useEffect(() => {
    void load();
  }, []);
  async function disconnect(a: AppRow) {
    if (!confirm(`Disconnect "${a.name}"? It stops working at once and has to sign in again.`)) return;
    await fetch(`/api/me/apps/${a.id}`, { method: "DELETE" });
    void load();
  }
  if (!apps) return null;
  if (!apps.length) return <p className="text-sm text-white/50">No apps connected by sign-in yet.</p>;
  return (
    <ul className="flex flex-col gap-1.5">
      {apps.map((a) => (
        <li key={a.id} className="flex items-center gap-3 rounded-lg bg-white/5 px-3 py-2 text-sm">
          <span className="min-w-0 flex-1 truncate font-semibold">{a.name}</span>
          <span className="hidden text-xs text-white/50 sm:inline">
            connected {new Date(a.createdAt).toLocaleDateString()} · {a.lastUsedAt ? `used ${new Date(a.lastUsedAt).toLocaleDateString()}` : "never used"}
          </span>
          <button className="rounded bg-white/10 px-2.5 py-1 text-xs font-semibold hover:bg-red-600" onClick={() => disconnect(a)}>Disconnect</button>
        </li>
      ))}
    </ul>
  );
}

export function TokenManager({ origin }: { origin: string }) {
  const [tokens, setTokens] = useState<TokenRow[] | null>(null);
  const [name, setName] = useState("");
  const [fresh, setFresh] = useState<string | null>(null);
  const [msg, setMsg] = useState<string | null>(null);
  const [busy, setBusy] = useState(false);

  async function load() {
    const r = await fetch("/api/me/tokens");
    if (r.ok) setTokens(((await r.json()) as { tokens: TokenRow[] }).tokens);
  }
  useEffect(() => {
    void load();
  }, []);

  async function create(e: React.FormEvent) {
    e.preventDefault();
    setBusy(true);
    setMsg(null);
    const r = await fetch("/api/me/tokens", { method: "POST", headers: { "content-type": "application/json" }, body: JSON.stringify({ name: name.trim() || "My AI" }) });
    const data = (await r.json().catch(() => ({}))) as { token?: string; error?: string };
    setBusy(false);
    if (!r.ok || !data.token) return setMsg(data.error ?? "Could not create a token.");
    setFresh(data.token);
    setName("");
    void load();
  }

  async function revoke(t: TokenRow) {
    if (!confirm(`Revoke "${t.name}"? Anything using it stops working at once.`)) return;
    await fetch(`/api/me/tokens/${t.id}`, { method: "DELETE" });
    if (fresh?.endsWith(t.hint)) setFresh(null);
    void load();
  }

  const mcpUrl = `${origin}/mcp`;
  return (
    <div className="flex flex-col gap-3">
      <form onSubmit={create} className="flex flex-wrap gap-2">
        <input className="input max-w-xs flex-1" placeholder="Name it, e.g. Claude on my laptop" aria-label="Token name" value={name} maxLength={60} onChange={(e) => setName(e.target.value)} />
        <button className="btn-primary" disabled={busy}>{busy ? "Creating…" : "Create token"}</button>
      </form>
      {msg && <div role="alert" className="rounded-lg bg-red-600/20 p-3 text-sm text-red-200">{msg}</div>}

      {fresh && (
        <div className="flex flex-col gap-2 rounded-xl border border-gold/60 bg-gold/10 p-3">
          <div className="text-sm font-semibold text-gold">Copy your token now. It is not shown again.</div>
          <CopyBlock label="Token" text={fresh} />
          <CopyBlock label="Claude Code: run this once in a terminal" text={`claude mcp add --transport http trivia-pig ${mcpUrl} --header "Authorization: Bearer ${fresh}"`} />
          <CopyBlock
            label="Other MCP apps (Cursor, VS Code and similar): add to the MCP settings file"
            text={JSON.stringify({ mcpServers: { "trivia-pig": { type: "http", url: mcpUrl, headers: { Authorization: `Bearer ${fresh}` } } } }, null, 2)}
          />
          <CopyBlock label="Plain HTTP: list your boards" text={`curl -H "Authorization: Bearer ${fresh}" ${origin}/api/v1/boards`} />
        </div>
      )}

      {tokens && tokens.length > 0 && (
        <ul className="flex flex-col gap-1.5">
          {tokens.map((t) => (
            <li key={t.id} className="flex items-center gap-3 rounded-lg bg-white/5 px-3 py-2 text-sm">
              <span className="min-w-0 flex-1 truncate font-semibold">{t.name}</span>
              <code className="text-xs text-white/50">tp_…{t.hint}</code>
              <span className="hidden text-xs text-white/50 sm:inline">{t.lastUsedAt ? `used ${new Date(t.lastUsedAt).toLocaleDateString()}` : "never used"}</span>
              <button className="rounded bg-white/10 px-2.5 py-1 text-xs font-semibold hover:bg-red-600" onClick={() => revoke(t)}>Revoke</button>
            </li>
          ))}
        </ul>
      )}
      {tokens && tokens.length === 0 && !fresh && <p className="text-sm text-white/50">No tokens yet.</p>}
    </div>
  );
}
