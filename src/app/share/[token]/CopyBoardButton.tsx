"use client";

import { useState } from "react";
import { useRouter } from "next/navigation";

export function CopyBoardButton({ token, signedIn }: { token: string; signedIn: boolean }) {
  const router = useRouter();
  const [busy, setBusy] = useState(false);
  const [error, setError] = useState<string | null>(null);
  if (!signedIn) {
    return (
      <a className="btn-primary" href={`/login?next=${encodeURIComponent(`/share/${token}`)}`}>
        Sign in to make a copy
      </a>
    );
  }
  return (
    <div className="flex flex-col items-end gap-1">
      <button
        className="btn-primary"
        disabled={busy}
        onClick={async () => {
          setBusy(true);
          setError(null);
          const res = await fetch(`/api/share/${token}/copy`, { method: "POST" });
          const data = await res.json().catch(() => ({}));
          setBusy(false);
          if (!res.ok) return setError(data.error ?? "Copy failed");
          router.push(`/boards/${data.id}/edit`);
        }}
      >
        {busy ? "Copying…" : "📄 Make a copy"}
      </button>
      {error && <span className="text-sm text-red-300">{error}</span>}
    </div>
  );
}
