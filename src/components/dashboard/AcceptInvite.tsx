"use client";

import { useState } from "react";
import { useRouter } from "next/navigation";
import { call } from "./actions";

export function AcceptInvite({ token }: { token: string }) {
  const router = useRouter();
  const [busy, setBusy] = useState(false);
  const [error, setError] = useState<string | null>(null);
  return (
    <div className="mt-4 flex flex-col gap-2">
      <button
        className="btn-primary py-3"
        disabled={busy}
        onClick={async () => {
          setBusy(true);
          const r = await call("/api/invites/accept", "POST", { token });
          setBusy(false);
          if (!r.ok) return setError(String(r.data.error ?? "Couldn't accept"));
          router.push("/dashboard");
        }}
      >
        {busy ? "Accepting…" : "Accept invite"}
      </button>
      {error && <div className="text-sm text-red-300">{error}</div>}
    </div>
  );
}
