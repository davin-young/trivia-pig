"use client";

import { useState } from "react";
import { APP_NAME } from "@/components/game";

export default function LoginForm({ next, allowSignup, firstRun, linkError }: { next: string; allowSignup: boolean; firstRun: boolean; linkError: boolean }) {
  const [mode, setMode] = useState<"login" | "signup" | "magic">(firstRun ? "signup" : "login");
  const [email, setEmail] = useState("");
  const [password, setPassword] = useState("");
  const [name, setName] = useState("");
  const [busy, setBusy] = useState(false);
  const [msg, setMsg] = useState<string | null>(linkError ? "That sign-in link is invalid or expired." : null);
  const [devLink, setDevLink] = useState<string | null>(null);

  async function submit(e: React.FormEvent) {
    e.preventDefault();
    setBusy(true);
    setMsg(null);
    const url = mode === "login" ? "/api/auth/login" : mode === "signup" ? "/api/auth/signup" : "/api/auth/magic";
    const body = mode === "magic" ? { email } : mode === "signup" ? { email, password, name } : { email, password };
    const res = await fetch(url, { method: "POST", headers: { "content-type": "application/json" }, body: JSON.stringify(body) });
    const data = await res.json().catch(() => ({}));
    setBusy(false);
    if (!res.ok) return setMsg(data.error ?? "Something went wrong");
    if (mode === "magic") {
      setMsg(data.sent ? "Check your email for a sign-in link." : "Email isn't configured on this server — the sign-in link was printed to the server log.");
      if (data.devLink) setDevLink(data.devLink);
      return;
    }
    window.location.href = next;
  }

  return (
    <div className="card w-full max-w-sm">
      <div className="mb-4 text-center">
        <div className="text-4xl">🐷</div>
        <h1 className="cat-text text-3xl">{APP_NAME}</h1>
        <p className="text-sm text-white/60">{firstRun ? "Create the first (admin) account" : "Host sign in"}</p>
      </div>
      <form onSubmit={submit} className="flex flex-col gap-3">
        {mode === "signup" && <input className="input" placeholder="Your name" value={name} onChange={(e) => setName(e.target.value)} autoComplete="name" />}
        <input className="input" type="email" required placeholder="Email" value={email} onChange={(e) => setEmail(e.target.value)} autoComplete="email" />
        {mode !== "magic" && (
          <input className="input" type="password" required minLength={mode === "signup" ? 8 : 1} placeholder="Password" value={password} onChange={(e) => setPassword(e.target.value)} autoComplete={mode === "signup" ? "new-password" : "current-password"} />
        )}
        {msg && <div className="rounded-lg bg-white/10 p-2 text-sm">{msg}</div>}
        {devLink && <a className="break-all text-sm text-gold underline" href={devLink}>Dev: open sign-in link</a>}
        <button className="btn-primary py-3" disabled={busy}>
          {busy ? "…" : mode === "login" ? "Sign in" : mode === "signup" ? "Create account" : "Email me a sign-in link"}
        </button>
      </form>
      <div className="mt-4 flex flex-col items-center gap-1 text-sm text-white/60">
        {mode !== "magic" && <button className="underline" onClick={() => setMode("magic")}>Sign in with an email link instead</button>}
        {mode !== "login" && !firstRun && <button className="underline" onClick={() => setMode("login")}>Sign in with password</button>}
        {mode !== "signup" && allowSignup && <button className="underline" onClick={() => setMode("signup")}>Create an account</button>}
      </div>
    </div>
  );
}
