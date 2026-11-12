"use client";

import { useState } from "react";
import Link from "next/link";
import { DrawingPad } from "@/components/DrawingPad";
import { Ink } from "@/components/Ink";
import { forgetProfile, saveProfile, type ProfileView } from "@/client/playerProfile";
import { AVATAR_CANVAS, NAME_CANVAS, isEmptyDrawing, type Drawing } from "@/shared/strokes";

const ordinal = (n: number) => `${n}${["th", "st", "nd", "rd"][n % 100 > 10 && n % 100 < 14 ? 0 : Math.min(n % 10, 4) % 4]}`;
const money = (n: number) => `${n < 0 ? "-" : ""}$${Math.abs(n).toLocaleString("en-US")}`;

export function PlayerCard({ initial, signedIn }: { initial: ProfileView | null; signedIn: boolean }) {
  const [profile, setProfile] = useState(initial);
  const [editing, setEditing] = useState(!initial);
  const [name, setName] = useState(initial?.name ?? "");
  const [signature, setSignature] = useState<Drawing | null>(initial?.signature ?? null);
  const [avatar, setAvatar] = useState<Drawing | null>(initial?.avatar ?? null);
  const [busy, setBusy] = useState(false);
  const [msg, setMsg] = useState<{ ok: boolean; text: string } | null>(null);

  async function save() {
    setBusy(true);
    setMsg(null);
    const r = await saveProfile({
      name: name.trim(),
      signature: signature && !isEmptyDrawing(signature) ? signature : null,
      avatar: avatar && !isEmptyDrawing(avatar) ? avatar : null,
    });
    setBusy(false);
    if (!r.profile) return setMsg({ ok: false, text: r.error ?? "Could not save." });
    setProfile(r.profile);
    setEditing(false);
    setMsg({ ok: true, text: "Saved. Your next game starts with this name and signature." });
  }

  async function forget() {
    if (!window.confirm("Delete your saved name, drawings and results? This cannot be undone.")) return;
    setBusy(true);
    const ok = await forgetProfile();
    setBusy(false);
    if (!ok) return setMsg({ ok: false, text: "Could not delete. Try again." });
    setProfile(null);
    setName("");
    setSignature(null);
    setAvatar(null);
    setEditing(true);
    setMsg({ ok: true, text: "Deleted. This device no longer remembers you." });
  }

  const s = profile?.stats;
  const answered = s ? s.right + s.wrong : 0;

  return (
    <>
      <header className="text-center">
        <div className="text-4xl">🐷</div>
        <h1 className="cat-text mt-1 text-3xl">My player card</h1>
        <p className="mt-1 text-sm text-white/60">
          {profile ? "Your name, signature and results, ready for the next game." : "Save a name and signature once and every game starts with them filled in."}
        </p>
      </header>

      {msg && (
        <div role="status" className={`rounded-lg p-3 text-sm ${msg.ok ? "bg-green-600/20 text-green-200" : "bg-red-600/20 text-red-200"}`}>
          {msg.text}
        </div>
      )}

      {profile && !editing ? (
        <section className="card flex flex-col gap-3">
          <div className="flex items-center gap-3">
            {profile.avatar && <Ink drawing={profile.avatar} className="h-14 w-14 shrink-0 rounded-full bg-white/5" />}
            <div className="min-w-0 flex-1">
              <div className="text-xs uppercase tracking-wide text-white/50">Name</div>
              <div className="truncate text-2xl font-bold">{profile.name}</div>
            </div>
            <button className="btn-ghost !py-2" onClick={() => { setEditing(true); setMsg(null); }}>Change</button>
          </div>
          {profile.signature ? (
            <div className="h-28 rounded-xl bg-[var(--board-deep)] p-2"><Ink drawing={profile.signature} className="h-full w-full" /></div>
          ) : (
            <p className="text-sm text-white/50">No signature saved. Add one with Change.</p>
          )}
        </section>
      ) : (
        <section className="card flex flex-col gap-3">
          <label className="flex flex-col gap-1">
            <span className="text-sm text-white/70">Your name</span>
            <input className="input text-lg" value={name} maxLength={24} onChange={(e) => setName(e.target.value)} placeholder="Type your name" autoComplete="nickname" />
          </label>
          <div>
            <div className="mb-1 text-sm text-white/70">Sign your name ✍️ <span className="text-white/40">(optional)</span></div>
            <DrawingPad width={NAME_CANVAS.w} height={NAME_CANVAS.h} multiColor initial={signature} onChange={setSignature} placeholder="Draw your name here" />
          </div>
          <div>
            <div className="mb-1 text-sm text-white/70">Doodle yourself 🎨 <span className="text-white/40">(optional, used in games that turn avatars on)</span></div>
            <div className="mx-auto max-w-[16rem]">
              <DrawingPad width={AVATAR_CANVAS.w} height={AVATAR_CANVAS.h} multiColor initial={avatar} onChange={setAvatar} placeholder="A face, a pig, anything" />
            </div>
          </div>
          <div className="flex gap-2">
            {profile && <button className="btn-ghost flex-1 py-3" disabled={busy} onClick={() => { setEditing(false); setName(profile.name); setSignature(profile.signature); setAvatar(profile.avatar); }}>Cancel</button>}
            <button className="btn-primary flex-1 py-3" disabled={busy || !name.trim()} onClick={save}>{busy ? "Saving…" : "Save"}</button>
          </div>
        </section>
      )}

      {profile && s && (
        <section className="flex flex-col gap-3">
          <h2 className="text-lg font-semibold">Your games</h2>
          {s.games === 0 ? (
            <p className="card text-sm text-white/60">Nothing yet. Finish a game with “Remember me on this device” ticked and it shows up here.</p>
          ) : (
            <>
              <dl className="grid grid-cols-2 gap-2 sm:grid-cols-4">
                {[
                  ["Games", String(s.games)],
                  ["Wins", String(s.wins)],
                  ["Best score", s.best === null ? "–" : money(s.best)],
                  ["Right answers", answered ? `${Math.round((s.right / answered) * 100)}%` : "–"],
                ].map(([label, value]) => (
                  <div key={label} className="card !p-3 text-center">
                    <dt className="text-xs uppercase tracking-wide text-white/50">{label}</dt>
                    <dd className="text-2xl font-bold tabular-nums">{value}</dd>
                  </div>
                ))}
              </dl>
              {answered > 0 && <p className="text-xs text-white/50">{s.right} right and {s.wrong} wrong in games played solo. Team games count toward games, wins and best score only.</p>}
              <ol className="flex flex-col gap-1.5">
                {profile.recent.map((g, i) => (
                  <li key={i} className="flex items-center gap-3 rounded-xl bg-white/5 px-3 py-2">
                    <span className="w-10 shrink-0 text-center font-bold">{g.place === 1 ? "🥇" : ordinal(g.place)}</span>
                    <span className="min-w-0 flex-1">
                      <span className="block truncate font-semibold">{g.title}</span>
                      <span className="block text-xs text-white/50">
                        {new Date(g.at).toLocaleDateString(undefined, { month: "short", day: "numeric", year: "numeric" })} · {g.team ? "team game, " : ""}{ordinal(g.place)} of {g.contestants}
                      </span>
                    </span>
                    <span className={`money shrink-0 text-lg tabular-nums ${g.score < 0 ? "!text-red-400" : ""}`}>{money(g.score)}</span>
                  </li>
                ))}
              </ol>
            </>
          )}
        </section>
      )}

      <section className="card flex flex-col gap-2 text-sm">
        <h2 className="text-base font-semibold">Where this is kept</h2>
        {profile?.account ? (
          <p className="text-white/70">Saved to your account. Sign in on another phone or computer and it is there too.</p>
        ) : signedIn ? (
          <p className="text-white/70">You are signed in. Save your card and it is kept with your account, on every device you sign in on.</p>
        ) : (
          <>
            <p className="text-white/70">
              {profile ? "On this device only: it is found again by a cookie, so clearing your browser data loses it." : "Without an account it is remembered on this device only, by a cookie."} An account is optional and keeps it on every device.
            </p>
            <Link href="/login?next=/player" className="btn-ghost self-start !py-2">Sign in or create an account</Link>
          </>
        )}
        {profile && (
          <button className="self-start text-red-300 underline underline-offset-2 disabled:opacity-40" disabled={busy} onClick={forget}>
            Delete my saved name, drawings and results
          </button>
        )}
      </section>

      <p className="text-center text-sm text-white/60">
        <Link href="/join" className="underline underline-offset-2 hover:text-white">Join a game</Link>
      </p>
    </>
  );
}
