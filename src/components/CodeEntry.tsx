"use client";

import { useRouter } from "next/navigation";
import { useState } from "react";

/** `focus={false}` on pages where the code box is not the main thing (it would pop the phone keyboard). */
export function CodeEntry({ target, cta, initial = "", focus = true }: { target: string; cta: string; initial?: string; focus?: boolean }) {
  const router = useRouter();
  const [code, setCode] = useState(initial.toUpperCase());
  const valid = /^[A-Z0-9]{4,6}$/.test(code);
  return (
    <form
      onSubmit={(e) => {
        e.preventDefault();
        if (valid) router.push(`${target}/${code}`);
      }}
      className="flex flex-col gap-3"
    >
      <input
        className="input text-center font-[family-name:var(--font-display)] text-4xl tracking-[0.3em] uppercase"
        value={code}
        onChange={(e) => setCode(e.target.value.toUpperCase().replace(/[^A-Z0-9]/g, "").slice(0, 6))}
        placeholder="CODE"
        inputMode="text"
        autoCapitalize="characters"
        autoComplete="off"
        autoCorrect="off"
        spellCheck={false}
        autoFocus={focus}
        aria-label="Game code"
      />
      <button className="btn-primary py-3 text-lg" disabled={!valid}>
        {cta}
      </button>
    </form>
  );
}
