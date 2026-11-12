"use client";

import { useEffect, useState } from "react";
import type { Settings } from "@/engine/types";
import { SOUNDBOARD, type SoundboardId } from "@/shared/protocol";
import { Qr, Signature, StatusDot, contestantName, useOrigin } from "@/components/game";
import { HOST_SOUND_KEY, hostSoundMode, useHost, type HostSoundMode } from "./HostClient";
import { sound } from "@/client/sound";

// ----------------------------------------------------------------- players

export function PlayersPanel() {
  const { view, act, presence } = useHost();
  const [renaming, setRenaming] = useState<string | null>(null);
  const [name, setName] = useState("");
  const [dragging, setDragging] = useState<string | null>(null);
  const teamMode = view.settings.mode === "team";
  const active = view.players.filter((p) => !p.removed);
  const removed = view.players.filter((p) => p.removed);

  const playerRow = (p: (typeof view.players)[number]) => (
    <div
      key={p.id}
      draggable={teamMode}
      onDragStart={() => setDragging(p.id)}
      onDragEnd={() => setDragging(null)}
      className="rounded-xl border border-line bg-panel-2 p-2"
    >
      <div className="flex items-center gap-2">
        <StatusDot status={presence?.players[p.id] ?? "offline"} />
        <div className="h-10 w-24 shrink-0 rounded bg-[var(--board-deep)] text-xs">
          <Signature player={p} className="h-full w-full" />
        </div>
        {renaming === p.id ? (
          <form className="flex flex-1 gap-1" onSubmit={async (e) => { e.preventDefault(); if (await act({ type: "player/rename", playerId: p.id, name })) setRenaming(null); }}>
            <input className="input !py-1" value={name} onChange={(e) => setName(e.target.value)} maxLength={40} autoFocus />
            <button className="btn-primary !py-1">OK</button>
          </form>
        ) : (
          <div className="min-w-0 flex-1">
            <div className="truncate font-semibold">{p.name}</div>
            <div className="text-xs text-white/50">{presence?.players[p.id] ?? "offline"}{p.signatureHidden && " · drawing hidden"}</div>
          </div>
        )}
      </div>
      <div className="mt-2 flex flex-wrap gap-1 text-xs">
        <SmallBtn onClick={() => { setRenaming(p.id); setName(p.name); }}>Rename</SmallBtn>
        <SmallBtn onClick={() => act({ type: "player/hideSignature", playerId: p.id, hidden: !p.signatureHidden })}>{p.signatureHidden ? (view.settings.familyMode ? "✓ Approve drawing" : "Show drawing") : "Hide drawing"}</SmallBtn>
        <SmallBtn onClick={() => confirm(`Erase ${p.name}'s drawing?`) && act({ type: "player/resetSignature", playerId: p.id })}>Reset drawing</SmallBtn>
        {teamMode && (
          <select className="rounded border border-line bg-panel px-1" value={p.teamId ?? ""} onChange={(e) => act({ type: "team/assign", playerId: p.id, teamId: e.target.value || null })}>
            <option value="">No team</option>
            {view.teams.map((t) => <option key={t.id} value={t.id}>{t.name}</option>)}
          </select>
        )}
        <SmallBtn danger onClick={() => confirm(`Kick ${p.name}? They can rejoin.`) && act({ type: "player/kick", playerId: p.id })}>Kick</SmallBtn>
        <SmallBtn danger onClick={() => confirm(`Ban ${p.name}? They can't rejoin with this name or device.`) && act({ type: "player/ban", playerId: p.id })}>Ban</SmallBtn>
      </div>
    </div>
  );

  return (
    <div className="flex flex-col gap-4">
      {teamMode ? (
        <>
          <TeamTools />
          {view.teams.map((t) => (
            <div
              key={t.id}
              onDragOver={(e) => e.preventDefault()}
              onDrop={() => dragging && act({ type: "team/assign", playerId: dragging, teamId: t.id })}
              className="rounded-2xl border-2 border-dashed p-2"
              style={{ borderColor: t.color }}
            >
              <TeamHeader teamId={t.id} />
              <div className="mt-2 flex flex-col gap-2">{active.filter((p) => p.teamId === t.id).map(playerRow)}</div>
            </div>
          ))}
          <div onDragOver={(e) => e.preventDefault()} onDrop={() => dragging && act({ type: "team/assign", playerId: dragging, teamId: null })} className="rounded-2xl border-2 border-dashed border-line p-2">
            <div className="mb-2 text-sm text-white/60">Unassigned (drag onto a team, or use the dropdown)</div>
            <div className="flex flex-col gap-2">{active.filter((p) => !p.teamId).map(playerRow)}</div>
          </div>
        </>
      ) : (
        <div className="flex flex-col gap-2">
          {active.map(playerRow)}
          {!active.length && <div className="text-white/50">No players yet.</div>}
        </div>
      )}
      {(view.crowd.members?.length ?? 0) > 0 && (
        <div>
          <div className="mb-1 text-sm text-white/60">Audience ({view.crowd.members!.length}) — watching, reacting and cheering</div>
          <div className="max-h-48 overflow-y-auto">
            {view.crowd.members!.map((m) => (
              <div key={m.id} className="flex items-center justify-between gap-2 py-1 text-sm">
                <span className="flex min-w-0 items-center gap-2">
                  <StatusDot status={presence?.players[m.id] ?? "offline"} />
                  <span className="truncate">{m.name}</span>
                </span>
                <SmallBtn danger onClick={() => confirm(`Remove ${m.name} from the audience?`) && act({ type: "player/ban", playerId: m.id })}>Remove</SmallBtn>
              </div>
            ))}
          </div>
        </div>
      )}
      {removed.length > 0 && (
        <div>
          <div className="mb-1 text-sm text-white/60">Removed</div>
          {removed.map((p) => (
            <div key={p.id} className="flex items-center justify-between py-1 text-sm">
              <span>{p.name} {p.banned && <b className="text-red-400">banned</b>}</span>
              <SmallBtn onClick={() => act({ type: "player/restore", playerId: p.id })}>Restore</SmallBtn>
            </div>
          ))}
        </div>
      )}
    </div>
  );
}

function TeamTools() {
  const { view, act } = useHost();
  const [name, setName] = useState("");
  return (
    <div className="flex flex-col gap-2">
      <form className="flex gap-2" onSubmit={async (e) => { e.preventDefault(); if (name.trim() && (await act({ type: "team/create", name: name.trim() }))) setName(""); }}>
        <input className="input" placeholder={`Team ${view.teams.length + 1} name`} value={name} onChange={(e) => setName(e.target.value)} maxLength={40} />
        <button className="btn-primary" disabled={view.settings.maxTeams > 0 && view.teams.length >= view.settings.maxTeams}>Add team</button>
      </form>
      <button className="btn-ghost" disabled={!view.teams.length} onClick={() => act({ type: "team/autoBalance" })}>⚖️ Auto-balance teams</button>
    </div>
  );
}

function TeamHeader({ teamId }: { teamId: string }) {
  const { view, act } = useHost();
  const t = view.teams.find((x) => x.id === teamId)!;
  const [edit, setEdit] = useState(false);
  const [name, setName] = useState(t.name);
  return edit ? (
    <form className="flex gap-1" onSubmit={async (e) => { e.preventDefault(); if (await act({ type: "team/rename", teamId, name })) setEdit(false); }}>
      <input className="input !py-1" value={name} onChange={(e) => setName(e.target.value)} autoFocus />
      <button className="btn-primary !py-1">OK</button>
    </form>
  ) : (
    <div className="flex items-center gap-2">
      <b style={{ color: t.color }}>{t.name}</b>
      <SmallBtn onClick={() => setEdit(true)}>Rename</SmallBtn>
      <SmallBtn danger onClick={() => confirm(`Delete team ${t.name}?`) && act({ type: "team/delete", teamId })}>Delete</SmallBtn>
    </div>
  );
}

function SmallBtn({ children, onClick, danger }: { children: React.ReactNode; onClick: () => void; danger?: boolean }) {
  return (
    <button onClick={onClick} className={`rounded-md border px-2 py-1 ${danger ? "border-red-500/40 text-red-300 hover:bg-red-500/20" : "border-line hover:bg-white/10"}`}>
      {children}
    </button>
  );
}

// ----------------------------------------------------------------- display

/** One shareable link with a copy button. */
function LinkRow({ label, hint, url }: { label: string; hint: string; url: string }) {
  const [copied, setCopied] = useState(false);
  return (
    <div className="rounded-lg bg-panel-2 p-2">
      <div className="flex items-center justify-between gap-2">
        <div className="min-w-0">
          <div className="text-sm font-semibold">{label}</div>
          <div className="text-xs text-white/60">{hint}</div>
        </div>
        <SmallBtn
          onClick={async () => {
            try {
              await navigator.clipboard.writeText(url);
              setCopied(true);
              setTimeout(() => setCopied(false), 1500);
            } catch {}
          }}
        >
          {copied ? "Copied ✓" : "Copy"}
        </SmallBtn>
      </div>
      <code className="mt-1 block select-all break-all text-xs text-white/70">{url}</code>
    </div>
  );
}

export function DisplayPanel() {
  const { view, act, presence } = useHost();
  const origin = useOrigin();
  const watchers = presence?.spectators ?? 0;
  const [text, setText] = useState("");
  const screens: { id: "none" | "blank" | "brb" | "scores"; label: string }[] = [
    { id: "none", label: "🎮 Game" },
    { id: "scores", label: "🏆 Scoreboard" },
    { id: "brb", label: "☕ Be right back" },
    { id: "blank", label: "⬛ Blank" },
  ];
  return (
    <div className="flex flex-col gap-5">
      <section>
        <h3 className="mb-2 font-semibold">What the display shows</h3>
        <div className="grid grid-cols-2 gap-2">
          {screens.map((s) => (
            <button key={s.id} className={`btn-ghost py-4 ${view.screen === s.id ? "!border-gold !text-gold" : ""}`} onClick={() => act({ type: "screen/set", screen: s.id })}>{s.label}</button>
          ))}
        </div>
      </section>
      <section className="flex flex-col gap-2">
        <h3 className="font-semibold">Announcement</h3>
        <form className="flex gap-2" onSubmit={async (e) => { e.preventDefault(); if (text.trim() && (await act({ type: "announce", text: text.trim() }))) setText(""); }}>
          <input className="input" placeholder="e.g. 5 minute break — grab a drink!" value={text} onChange={(e) => setText(e.target.value)} maxLength={280} />
          <button className="btn-primary">Show</button>
        </form>
        {view.announcement && (
          <div className="flex items-center justify-between rounded-lg bg-panel-2 p-2 text-sm">
            <span>Showing: “{view.announcement.text}”</span>
            <SmallBtn onClick={() => act({ type: "announce", text: null })}>Clear</SmallBtn>
          </div>
        )}
      </section>
      <section className="flex flex-col gap-2">
        <Toggle label="Show join QR code on the display" checked={view.showJoinQr} onChange={(v) => act({ type: "qr/show", show: v })} />
        <Toggle label="Pause game (buzzers disabled)" checked={view.paused} onChange={(v) => act({ type: "game/pause", paused: v })} />
        <Toggle label="Lock lobby (no new joins)" checked={view.lobbyLocked} onChange={(v) => act({ type: "lobby/lock", locked: v })} />
      </section>
      <a className="btn-ghost" href={`/display/${view.code}`} target="_blank" rel="noreferrer">Open display in a new tab ↗</a>
      {origin && (
        <section className="flex flex-col gap-2">
          <h3 className="font-semibold">
            Streaming and spectators
            {watchers > 0 && <span className="font-normal text-white/60"> · {watchers} watching</span>}
          </h3>
          {view.settings.spectators && <LinkRow label="Watch link" hint="Viewers follow the game on their own screen. They cannot buzz or score." url={`${origin}/watch/${view.watchToken ?? view.code}`} />}
          {view.settings.audience && <LinkRow label="Audience link" hint="Viewers join from their phone to send reactions and cheer for a player." url={`${origin}/join?code=${view.watchToken ?? view.code}&audience=1`} />}
          <LinkRow label="Streaming software (browser source)" hint="The big screen with no buttons; sound starts by itself. Add &mute=1 for no sound." url={`${origin}/display/${view.code}?obs=1`} />
          <LinkRow label="Score overlay" hint="A see-through score strip to lay over your camera. Add ?pos=top to move it up." url={`${origin}/overlay/${view.watchToken ?? view.code}`} />
          <Toggle label="Streamer mode: keep the room code and QR off the big screen" checked={view.settings.hideCode} onChange={(v) => act({ type: "settings/update", settings: { hideCode: v } })} />
        </section>
      )}
    </div>
  );
}

// ------------------------------------------------------------------- sound

const SOUND_LABELS: Record<SoundboardId, string> = {
  applause: "👏 Applause",
  boo: "👎 Boo",
  drumroll: "🥁 Drumroll",
  timer: "⏱ Timer",
  ding: "🔔 Ding",
  buzzer: "📢 Buzzer",
  laugh: "😂 Laugh",
  fanfare: "🎺 Fanfare",
};

export function SoundPanel() {
  const { view, act, emit, toast } = useHost();
  const s = view.settings.sound;
  const set = (patch: Partial<Settings["sound"]>) => act({ type: "settings/update", settings: { sound: patch } });
  const [vol, setVol] = useState(s.master);
  useEffect(() => setVol(s.master), [s.master]);
  const { presence } = useHost();
  const [here, setHere] = useState<HostSoundMode>(() => hostSoundMode());
  const displayOn = presence?.display === "online";
  return (
    <div className="flex flex-col gap-5">
      <p className="text-sm text-white/60">
        Game audio plays on the big screen (click it once to enable sound).{" "}
        {displayOn ? "A display is connected." : "No display is connected right now, so this device plays the sounds unless you turn that off below."}
      </p>
      <label className="flex flex-col gap-1">
        <span>Sounds on this device</span>
        <select
          className="input"
          value={here}
          onChange={(e) => {
            const v = e.target.value as HostSoundMode;
            setHere(v);
            try {
              localStorage.setItem(HOST_SOUND_KEY, v);
            } catch {}
            if (v !== "off") void sound().unlock().then(() => sound().play("correct"));
          }}
        >
          <option value="auto">Only when no big screen is connected</option>
          <option value="on">Always</option>
          <option value="off">Never</option>
        </select>
      </label>
      <label className="flex flex-col gap-1">
        <span>Master volume: {Math.round(vol * 100)}%</span>
        <input type="range" min={0} max={1} step={0.05} value={vol} onChange={(e) => setVol(Number(e.target.value))} onPointerUp={() => set({ master: vol })} onKeyUp={() => set({ master: vol })} />
      </label>
      <Toggle label="Mute everything" checked={s.muted} onChange={(v) => set({ muted: v })} />
      <Toggle label="Music (Final think music)" checked={s.music} onChange={(v) => set({ music: v })} />
      <Toggle label="Sound effects" checked={s.sfx} onChange={(v) => set({ sfx: v })} />
      <Toggle label="Buzz sound on players' own phones" checked={s.playerBuzzSound} onChange={(v) => set({ playerBuzzSound: v })} />
      <section>
        <h3 className="mb-2 font-semibold">Soundboard</h3>
        <div className="grid grid-cols-2 gap-2 sm:grid-cols-4">
          {SOUNDBOARD.map((id) => (
            <button key={id} className="btn-ghost py-4" onClick={async () => { const r = await emit("host:sound", { id }); if (!r.ok) toast(r.error); }}>
              {SOUND_LABELS[id]}
            </button>
          ))}
        </div>
      </section>
    </div>
  );
}

// ---------------------------------------------------------------- settings

export function SettingsPanel() {
  const { view, act, toast } = useHost();
  const s = view.settings;
  const lobby = view.phase === "lobby";
  const set = (patch: Partial<Settings>) => act({ type: "settings/update", settings: patch });
  return (
    <div className="flex flex-col gap-4">
      <Field label="Mode">
        <div className="flex gap-2">
          {(["solo", "team"] as const).map((m) => (
            <button key={m} disabled={!lobby} className={`btn-ghost flex-1 ${s.mode === m ? "!border-gold !text-gold" : ""}`} onClick={() => set({ mode: m })}>{m === "solo" ? "Individual" : "Teams"}</button>
          ))}
        </div>
        {!lobby && <span className="text-xs text-white/40">Mode can only change in the lobby.</span>}
      </Field>
      <Field label="Clues">
        <div className="flex gap-2">
          {([false, true] as const).map((v) => (
            <button key={String(v)} className={`btn-ghost flex-1 ${s.everyoneAnswers === v ? "!border-gold !text-gold" : ""}`} onClick={() => set({ everyoneAnswers: v })}>{v ? "Everyone answers" : "Buzz in"}</button>
          ))}
        </div>
        <span className="text-xs text-white/40">
          {s.everyoneAnswers ? "Every clue opens for all players to write an answer. Right answers score, wrong answers cost nothing." : "First to buzz answers. You can still open any single clue for everyone."}
        </span>
      </Field>
      <NumField label="Max players (0 = up to 500)" value={s.maxPlayers} min={0} max={100000} onSave={(v) => set({ maxPlayers: v })} />
      {s.mode === "team" && <NumField label="Max teams (0 = no limit)" value={s.maxTeams} min={0} max={100000} onSave={(v) => set({ maxTeams: v })} />}
      <Toggle label="Allow late joins after the game starts" checked={s.allowLateJoin} onChange={(v) => set({ allowLateJoin: v })} />
      <h3 className="mt-2 font-semibold">Party</h3>
      <Toggle label="First player in can start the game from their phone (👑)" checked={s.vipStart} onChange={(v) => set({ vipStart: v })} />
      <NumField label="Start countdown on the big screen (seconds, 0 = off)" value={s.startCountdownSec} min={0} max={30} onSave={(v) => set({ startCountdownSec: v })} />
      <Toggle label="Doodle avatars next to drawn names" checked={s.avatars} onChange={(v) => set({ avatars: v })} />
      <Toggle label="Players who lost their phone can take their seat back by name" checked={s.reclaimSeats} onChange={(v) => set({ reclaimSeats: v })} />
      <Toggle label="Family friendly: you approve every drawing before it shows on the big screen" checked={s.familyMode} onChange={(v) => set({ familyMode: v })} />
      <h3 className="mt-2 font-semibold">Streaming and audience</h3>
      <Toggle label="Streamer mode: keep the room code and QR off the big screen" checked={s.hideCode} onChange={(v) => set({ hideCode: v })} />
      <Toggle label="Watch link: anyone with the link can follow the game on their own screen" checked={s.spectators} onChange={(v) => set({ spectators: v })} />
      <Toggle label="Audience: extra people can join to react and cheer without playing" checked={s.audience} onChange={(v) => set({ audience: v })} />
      {s.audience && <NumField label="Audience limit (0 = up to 5000)" value={s.maxAudience} min={0} max={100000} onSave={(v) => set({ maxAudience: v })} />}
      <span className="text-xs text-white/40">Links for viewers and streaming software are under Display.</span>
      <h3 className="mt-2 font-semibold">Accessibility</h3>
      <Field label="Timers">
        <div className="flex gap-2">
          {([1, 1.5, 2] as const).map((x) => (
            <button key={x} className={`btn-ghost flex-1 ${s.timerScale === x ? "!border-gold !text-gold" : ""}`} onClick={() => set({ timerScale: x })}>
              {x === 1 ? "Normal" : `${x}× longer`}
            </button>
          ))}
        </div>
        <span className="text-xs text-white/40">Stretches the answer, all-play, reading and Final timers.</span>
      </Field>
      <Toggle label="Captions on the big screen for sound cues" checked={s.captions} onChange={(v) => set({ captions: v })} />
      <h3 className="mt-2 font-semibold">Buzzers</h3>
      <NumField label="Answer timer (seconds, 0 = off)" value={s.answerTimerSec} min={0} max={120} onSave={(v) => set({ answerTimerSec: v })} />
      <NumField label="Early-buzz lockout (ms, 0 = off)" value={s.earlyBuzzLockoutMs} min={0} max={5000} onSave={(v) => set({ earlyBuzzLockoutMs: v })} />
      <Toggle label="Players who answered wrong can buzz again" checked={s.allowRebuzz} onChange={(v) => set({ allowRebuzz: v })} />
      <Toggle label="Latency-fair buzzing (first press wins, not best Wi-Fi)" checked={s.fairBuzz} onChange={(v) => set({ fairBuzz: v })} />
      <Toggle label="Open buzzers automatically after reading time (lights count down on the display)" checked={s.autoUnlock} onChange={(v) => set({ autoUnlock: v })} />
      <NumField label="All-play writing time (seconds)" value={s.allPlayTimerSec} min={5} max={180} onSave={(v) => set({ allPlayTimerSec: v })} />
      <Toggle label="Emoji reactions from phones on the display" checked={s.reactions} onChange={(v) => set({ reactions: v })} />
      <h3 className="mt-2 font-semibold">Daily Doubles</h3>
      <Field label="Placement">
        <div className="flex gap-2">
          {(["author", "random"] as const).map((m) => (
            <button key={m} disabled={!lobby} className={`btn-ghost flex-1 ${s.dailyDoublePlacement === m ? "!border-gold !text-gold" : ""}`} onClick={() => set({ dailyDoublePlacement: m })}>{m === "author" ? "As marked on board" : "Random"}</button>
          ))}
        </div>
        {!lobby && <span className="text-xs text-white/40">Placement is fixed when the game starts.</span>}
      </Field>
      {s.dailyDoublePlacement === "random" && (
        <>
          <NumField label="Random DDs in single rounds" value={s.dailyDoublesSingle} min={0} max={5} onSave={(v) => set({ dailyDoublesSingle: v })} disabled={!lobby} />
          <NumField label="Random DDs in double rounds" value={s.dailyDoublesDouble} min={0} max={5} onSave={(v) => set({ dailyDoublesDouble: v })} disabled={!lobby} />
        </>
      )}
      <h3 className="mt-2 font-semibold">Other</h3>
      <NumField label="Final Jeopardy timer (seconds)" value={s.finalTimerSec} min={10} max={300} onSave={(v) => set({ finalTimerSec: v })} />
      <Toggle label="Multi-colour drawing" checked={s.multiColor} onChange={(v) => set({ multiColor: v })} />
      <button
        className="btn-ghost mt-2"
        onClick={async () => {
          const r = await fetch("/api/me/defaults", { method: "PUT", headers: { "content-type": "application/json" }, body: JSON.stringify(s) });
          toast(r.ok ? "Saved as your defaults for new games" : "Couldn't save defaults");
        }}
      >
        💾 Save these as my defaults
      </button>
    </div>
  );
}

function Field({ label, children }: { label: string; children: React.ReactNode }) {
  return (
    <div className="flex flex-col gap-1">
      <span className="text-sm text-white/70">{label}</span>
      {children}
    </div>
  );
}

function NumField({ label, value, min, max, onSave, disabled }: { label: string; value: number; min: number; max: number; onSave: (v: number) => void; disabled?: boolean }) {
  const [v, setV] = useState(String(value));
  useEffect(() => setV(String(value)), [value]);
  const commit = () => {
    const n = Math.max(min, Math.min(max, parseInt(v, 10) || 0));
    setV(String(n));
    if (n !== value) onSave(n);
  };
  return (
    <label className="flex items-center justify-between gap-3">
      <span className="text-sm text-white/70">{label}</span>
      <input className="input !w-24 text-center" inputMode="numeric" value={v} disabled={disabled} onChange={(e) => setV(e.target.value.replace(/\D/g, ""))} onBlur={commit} onKeyDown={(e) => e.key === "Enter" && commit()} />
    </label>
  );
}

export function Toggle({ label, checked, onChange }: { label: string; checked: boolean; onChange: (v: boolean) => void }) {
  return (
    <label className="flex cursor-pointer items-center justify-between gap-3 py-1">
      <span>{label}</span>
      <button
        type="button"
        role="switch"
        aria-checked={checked}
        onClick={() => onChange(!checked)}
        className={`relative h-7 w-12 shrink-0 rounded-full transition ${checked ? "bg-green-600" : "bg-white/20"}`}
      >
        <span className={`absolute top-0.5 h-6 w-6 rounded-full bg-white transition-all ${checked ? "left-[22px]" : "left-0.5"}`} />
      </button>
    </label>
  );
}

// ----------------------------------------------------------------- history

export function HistoryPanel() {
  const { view, emit, toast } = useHost();
  const [showPlayers, setShowPlayers] = useState(false);
  const items = [...(view.host?.history ?? [])].reverse().filter((h) => showPlayers || !h.player);
  return (
    <div className="flex flex-col gap-2">
      <p className="text-sm text-white/60">Undo any step — the game replays everything else around it. Undone steps can be redone.</p>
      <Toggle label="Show player actions (joins, buzzes, wagers)" checked={showPlayers} onChange={setShowPlayers} />
      {items.map((h) => (
        <div key={h.seq} className={`flex items-center gap-2 rounded-lg border border-line px-3 py-2 text-sm ${h.undone ? "opacity-50" : ""}`}>
          <span className="w-14 shrink-0 text-xs text-white/40">{new Date(h.at).toLocaleTimeString([], { hour: "2-digit", minute: "2-digit", second: "2-digit" })}</span>
          <span className={`min-w-0 flex-1 ${h.undone ? "line-through" : ""}`}>{h.label}</span>
          {h.by !== "system" && (
            <button
              className="rounded-md border border-line px-2 py-1 text-xs hover:bg-white/10"
              onClick={async () => {
                const r = await emit("host:undo", { seq: h.seq, undone: !h.undone });
                if (!r.ok) toast(r.error);
              }}
            >
              {h.undone ? "Redo" : "Undo"}
            </button>
          )}
        </div>
      ))}
      {!items.length && <div className="text-white/50">Nothing yet.</div>}
    </div>
  );
}

// ----------------------------------------------------------------- devices

export function DevicesPanel() {
  const { view, presence, gameId, role, toast } = useHost();
  const origin = useOrigin();
  const [pair, setPair] = useState<{ url: string; expiresAt: string; role: string } | null>(null);
  const [pairRole, setPairRole] = useState<"HOST" | "COHOST" | "SCOREKEEPER">("HOST");

  async function makePair(r: typeof pairRole) {
    setPairRole(r);
    const res = await fetch(`/api/games/${gameId}/pair`, { method: "POST", headers: { "content-type": "application/json" }, body: JSON.stringify({ role: r }) });
    const data = await res.json().catch(() => ({}));
    if (!res.ok) return toast(data.error ?? "Couldn't create pairing code");
    setPair(data);
  }

  return (
    <div className="flex flex-col gap-5">
      <section>
        <h3 className="mb-2 font-semibold">Connected devices</h3>
        <div className="flex flex-col gap-1 text-sm">
          <div className="flex items-center gap-2"><StatusDot status={presence?.display ?? "offline"} /> Display {presence?.displays ? `(${presence.displays})` : ""}</div>
          {presence?.hosts.map((h) => (
            <div key={h.role} className="flex items-center gap-2"><StatusDot status="online" /> {h.role.toLowerCase()} controls ({h.count})</div>
          ))}
          {view.players.filter((p) => !p.removed).map((p) => (
            <div key={p.id} className="flex items-center gap-2">
              <StatusDot status={presence?.players[p.id] ?? "offline"} /> {p.name} <span className="text-white/40">{presence?.players[p.id]}{view.settings.mode === "team" && ` · ${contestantName(view, p.teamId)}`}</span>
            </div>
          ))}
        </div>
      </section>

      <section className="flex flex-col gap-2">
        <h3 className="font-semibold">Hand off to another device</h3>
        <p className="text-sm text-white/60">Scan with an iPad or phone camera to open these controls there, with no password. The code works once and expires in 5 minutes.</p>
        {role !== "SCOREKEEPER" && (
          <div className="flex flex-wrap gap-2">
            {(["HOST", "COHOST", "SCOREKEEPER"] as const).filter((r) => role === "HOST" || r !== "HOST").map((r) => (
              <button key={r} className={`btn-ghost ${pair && pairRole === r ? "!border-gold" : ""}`} onClick={() => makePair(r)}>
                {r === "HOST" ? "Host controls" : r === "COHOST" ? "Co-host" : "Scorekeeper only"}
              </button>
            ))}
          </div>
        )}
        {pair && (
          <div className="flex flex-col items-center gap-2 rounded-xl bg-white p-4 text-black">
            <Qr value={pair.url} className="w-56 [&>svg]:h-auto [&>svg]:w-full" />
            <div className="text-sm">{pair.role.toLowerCase()} access · expires {new Date(pair.expiresAt).toLocaleTimeString()}</div>
            <button className="text-sm underline" onClick={() => navigator.clipboard?.writeText(pair.url).then(() => toast("Link copied"))}>Copy link</button>
          </div>
        )}
      </section>

      <section className="flex flex-col gap-2">
        <h3 className="font-semibold">Big screen</h3>
        <p className="text-sm text-white/60">Open on the computer connected to your TV (HDMI), or open it in Chrome and use Cast → Cast tab. No login needed.</p>
        {origin && (
          <div className="flex items-center gap-3">
            <Qr value={`${origin}/display/${view.code}`} className="w-28 rounded bg-white p-1 [&>svg]:h-auto [&>svg]:w-full" />
            <code className="break-all text-sm">{origin}/display/{view.code}</code>
          </div>
        )}
      </section>
    </div>
  );
}
