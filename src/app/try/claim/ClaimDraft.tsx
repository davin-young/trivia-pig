"use client";

import { useEffect, useRef, useState } from "react";
import Link from "next/link";
import { useRouter } from "next/navigation";
import { GUEST_DRAFT_KEY } from "@/components/builder/BoardEditor";
import { loadGuestDraft } from "../TryEditor";

export function ClaimDraft() {
  const router = useRouter();
  const [error, setError] = useState<string | null>(null);
  const started = useRef(false);

  useEffect(() => {
    if (started.current) return; // React strict mode runs effects twice in dev
    started.current = true;
    const draft = loadGuestDraft();
    if (!draft) {
      router.replace("/dashboard");
      return;
    }
    void (async () => {
      const res = await fetch("/api/boards", {
        method: "POST",
        headers: { "content-type": "application/json" },
        body: JSON.stringify({ title: draft.title, content: draft.content, tags: draft.tags }),
      });
      const data = await res.json().catch(() => ({}));
      if (!res.ok || !data.id) {
        // Keep the draft in the browser so nothing is lost.
        setError(data.error ?? "Couldn't save your board");
        return;
      }
      localStorage.removeItem(GUEST_DRAFT_KEY);
      router.replace(`/boards/${data.id}/edit`);
    })();
  }, [router]);

  return (
    <main className="grid min-h-dvh place-items-center p-6 text-center">
      {error ? (
        <div className="card max-w-md">
          <h1 className="mb-2 text-xl font-bold">Your board is still safe in this browser</h1>
          <p className="mb-4 text-sm text-red-300">{error}</p>
          <div className="flex justify-center gap-2">
            <button className="btn-primary" onClick={() => window.location.reload()}>Try again</button>
            <Link className="btn-ghost" href="/dashboard">Go to my boards</Link>
          </div>
        </div>
      ) : (
        <div className="text-white/70">
          <div className="text-5xl">🐷</div>
          <p className="mt-3">Saving your board to your account…</p>
        </div>
      )}
    </main>
  );
}
