"use client";

import { useState } from "react";
import { useRouter } from "next/navigation";
import { call, CopyButton } from "./actions";

export function InviteForm() {
  const router = useRouter();
  const [email, setEmail] = useState("");
  const [role, setRole] = useState<"COHOST" | "SCOREKEEPER">("COHOST");
  const [busy, setBusy] = useState(false);
  const [result, setResult] = useState<{ url: string; sent: boolean } | null>(null);
  const [error, setError] = useState<string | null>(null);

  return (
    <div className="flex flex-col gap-3">
      <form
        className="flex flex-wrap gap-2"
        onSubmit={async (e) => {
          e.preventDefault();
          setBusy(true);
          setError(null);
          const r = await call("/api/invites", "POST", { email, role });
          setBusy(false);
          if (!r.ok) return setError(String(r.data.error ?? "Couldn't send invite"));
          setResult({ url: String(r.data.url), sent: !!r.data.sent });
          setEmail("");
          router.refresh();
        }}
      >
        <input className="input !w-auto min-w-48 flex-1" type="email" required placeholder="their@email.com" value={email} onChange={(e) => setEmail(e.target.value)} />
        <select className="input !w-auto" value={role} onChange={(e) => setRole(e.target.value as "COHOST" | "SCOREKEEPER")}>
          <option value="COHOST">Co-host</option>
          <option value="SCOREKEEPER">Scorekeeper</option>
        </select>
        <button className="btn-primary" disabled={busy}>{busy ? "Sending…" : "Invite"}</button>
      </form>
      {error && <div className="rounded-lg bg-red-600/20 p-2 text-sm text-red-300">{error}</div>}
      {result && (
        <div className="flex flex-col gap-2 rounded-lg bg-panel-2 p-3 text-sm">
          <div>{result.sent ? "Invite emailed. You can also share this link:" : "Email isn't set up on this server — send them this link yourself:"}</div>
          <div className="flex flex-wrap items-center gap-2">
            <code className="min-w-0 flex-1 break-all text-xs text-white/70">{result.url}</code>
            <CopyButton text={result.url} />
          </div>
          <div className="text-xs text-white/40">The link works once and expires in 7 days. They&apos;ll need to sign in (or create an account) to accept.</div>
        </div>
      )}
    </div>
  );
}
