"use client";

import { useState } from "react";

/**
 * Allow / Cancel on the consent screen. The answer is sent with fetch and the browser is
 * then pointed at the app's return address by script: a plain form would be stopped by the
 * site's own content security policy, which does not let forms end up on another site.
 */
export function ConsentButtons({ fields }: { fields: Record<string, string> }) {
  const [busy, setBusy] = useState(false);
  const [error, setError] = useState<string | null>(null);

  async function answer(decision: "allow" | "deny") {
    setBusy(true);
    setError(null);
    try {
      const r = await fetch("/api/oauth/authorize", {
        method: "POST",
        headers: { "content-type": "application/x-www-form-urlencoded" },
        body: new URLSearchParams({ ...fields, decision }).toString(),
      });
      const data = (await r.json().catch(() => null)) as { to?: string; error?: string } | null;
      if (r.ok && data?.to) {
        window.location.assign(data.to);
        return;
      }
      setError(data?.error ?? "That did not work. Go back to your AI app and connect again.");
    } catch {
      setError("Could not reach the server. Check your connection and try again.");
    }
    setBusy(false);
  }

  return (
    <div className="flex flex-col gap-2">
      {error && <div role="alert" className="rounded-lg bg-red-600/20 p-3 text-sm text-red-200">{error}</div>}
      <div className="flex gap-2">
        <button type="button" className="btn-ghost flex-1 py-3" disabled={busy} onClick={() => answer("deny")}>Cancel</button>
        <button type="button" className="btn-primary flex-1 py-3" disabled={busy} onClick={() => answer("allow")}>{busy ? "One moment…" : "Allow"}</button>
      </div>
    </div>
  );
}
