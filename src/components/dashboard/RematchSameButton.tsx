"use client";

import { useState } from "react";
import { useRouter } from "next/navigation";
import { call } from "./actions";

/** Rematch with the same players and board, then jump to the new game's host controls. */
export function RematchSameButton({ gameId }: { gameId: string }) {
  const router = useRouter();
  const [busy, setBusy] = useState(false);
  return (
    <button
      className="btn-primary"
      disabled={busy}
      onClick={async () => {
        if (!confirm("Start a rematch with the same players and board?")) return;
        setBusy(true);
        const r = await call(`/api/games/${gameId}/rematch`, "POST", { sameBoard: true });
        setBusy(false);
        if (!r.ok) return window.alert(String(r.data.error ?? "Rematch failed"));
        router.push(`/host/${r.data.code}`);
      }}
    >
      🔁 Rematch
    </button>
  );
}
