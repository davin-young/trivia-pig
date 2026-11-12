"use client";

import { useState } from "react";

/** Share the current page: the phone's share sheet where there is one, otherwise copy the link. */
export function ShareButton({ title, text, className = "btn-ghost" }: { title: string; text: string; className?: string }) {
  const [done, setDone] = useState<string | null>(null);
  return (
    <button
      type="button"
      className={className}
      onClick={async () => {
        const url = window.location.href;
        try {
          if (navigator.share) {
            await navigator.share({ title, text, url });
            return;
          }
          await navigator.clipboard.writeText(url);
          setDone("Link copied");
        } catch (e) {
          // The person closed the share sheet: nothing to report.
          if ((e as Error)?.name !== "AbortError") setDone("Couldn't share. Copy the address from the bar above.");
        }
        setTimeout(() => setDone(null), 2500);
      }}
    >
      {done ?? "🔗 Share these results"}
    </button>
  );
}
