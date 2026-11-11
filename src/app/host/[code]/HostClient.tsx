"use client";

import { createContext, useCallback, useContext, useState } from "react";
import Link from "next/link";
import { useGame } from "@/client/useGame";
import { useWakeLock } from "@/client/useWakeLock";
import type { GameView } from "@/engine/views";
import type { HostIntent, PresenceView } from "@/shared/protocol";
import { ConnBanner, StatusDot, contestants, formatScore, useBoardTheme } from "@/components/game";
import { MainPane } from "./main";
import { DevicesPanel, DisplayPanel, HistoryPanel, PlayersPanel, SettingsPanel, SoundPanel } from "./panels";

export interface HostCtx {
  view: GameView;
  presence: PresenceView | null;
  act: (intent: HostIntent) => Promise<boolean>;
  emit: ReturnType<typeof useGame>["emit"];
  now: () => number;
  gameId: string;
  role: string;
  toast: (msg: string) => void;
}
const Ctx = createContext<HostCtx | null>(null);
export function useHost(): HostCtx {
  const c = useContext(Ctx);
  if (!c) throw new Error("useHost outside HostClient");
  return c;
}

type Panel = "players" | "display" | "sound" | "settings" | "history" | "devices" | null;

export default function HostClient({ code, gameId, role }: { code: string; gameId: string; role: string }) {
  const { view, presence, status, error, emit, now } = useGame({
    role: "host",
    code,
    onRedirect: (next) => window.location.replace(`/host/${next}`),
  });
  useBoardTheme(view?.theme);
  const [panel, setPanel] = useState<Panel>(null);
  useWakeLock();
  const [mobileTab, setMobileTab] = useState<"game" | "scores">("game");
  const [toastMsg, setToastMsg] = useState<string | null>(null);

  const toast = useCallback((msg: string) => {
    setToastMsg(msg);
    setTimeout(() => setToastMsg((m) => (m === msg ? null : m)), 2500);
  }, []);

  const act = useCallback(
    async (intent: HostIntent) => {
      const r = await emit("host:action", { action: intent });
      if (!r.ok) toast(r.error);
      return r.ok;
    },
    [emit, toast],
  );

  if (!view) {
    return (
      <main className="grid min-h-dvh place-items-center p-6 text-center">
        <ConnBanner status={status} error={error} />
        {status === "error" ? (
          <div className="card max-w-md">
            <h1 className="mb-2 text-xl font-bold">Can&apos;t open host controls</h1>
            <p className="mb-4 text-white/70">{error}</p>
            <div className="flex justify-center gap-2">
              <Link className="btn-primary" href={`/login?next=/host/${code}`}>Sign in</Link>
              <Link className="btn-ghost" href="/dashboard">Dashboard</Link>
            </div>
          </div>
        ) : (
          <div className="text-white/60">Connecting…</div>
        )}
      </main>
    );
  }

  const ctx: HostCtx = { view, presence, act, emit, now, gameId, role, toast };
  const scorekeeper = role === "SCOREKEEPER";

  return (
    <Ctx.Provider value={ctx}>
      <ConnBanner status={status} error={error} />
      {presence?.saveFailing && (
        <div className="sticky top-0 z-40 bg-red-700 px-4 py-2 text-center text-sm font-semibold" role="alert">
          ⚠ This game is not being saved right now (database problem). Keep playing: it retries automatically, but a server restart before it recovers would lose recent steps.
        </div>
      )}
      <main className="flex h-dvh flex-col overflow-hidden bg-ui-bg pb-[env(safe-area-inset-bottom)]">
        <TopBar onPanel={setPanel} status={status} />
        {/* Phones: toggle between game controls and scores. Tablets/laptops: side by side. */}
        <div className="flex shrink-0 border-b border-line bg-panel md:hidden">
          {(["game", "scores"] as const).map((t) => (
            <button
              key={t}
              onClick={() => setMobileTab(t)}
              className={`flex-1 py-2 text-sm font-semibold capitalize ${mobileTab === t ? "border-b-2 border-gold text-gold" : "text-white/60"}`}
            >
              {t}
            </button>
          ))}
        </div>
        {mobileTab === "game" && <ScoreStrip onOpen={() => setMobileTab("scores")} />}
        <div className="flex min-h-0 flex-1 flex-col md:flex-row">
          <section className={`min-h-0 flex-1 overflow-y-auto p-3 ${mobileTab === "game" ? "" : "max-md:hidden"}`}>
            <MainPane />
          </section>
          <aside
            className={`shrink-0 overflow-y-auto bg-panel p-3 md:w-[280px] md:border-l md:border-line lg:w-[320px] ${mobileTab === "scores" ? "max-md:flex-1" : "max-md:hidden"}`}
          >
            <Scoreboard />
          </aside>
        </div>
        <nav className="flex shrink-0 gap-1 overflow-x-auto border-t border-line bg-panel px-2 py-2">
          {!scorekeeper && (
            <>
              <TabBtn onClick={() => setPanel("players")} label="Players" icon="👥" badge={view.players.filter((p) => !p.removed).length} />
              <TabBtn onClick={() => setPanel("display")} label="Display" icon="📺" />
              <TabBtn onClick={() => setPanel("sound")} label="Sound" icon="🔊" />
              <TabBtn onClick={() => setPanel("settings")} label="Settings" icon="⚙️" />
              <TabBtn onClick={() => setPanel("history")} label="History" icon="🕘" />
            </>
          )}
          <TabBtn onClick={() => setPanel("devices")} label="Devices" icon="📱" />
        </nav>
      </main>
      {panel && (
        <Sheet onClose={() => setPanel(null)} title={PANEL_TITLES[panel]}>
          {panel === "players" && <PlayersPanel />}
          {panel === "display" && <DisplayPanel />}
          {panel === "sound" && <SoundPanel />}
          {panel === "settings" && <SettingsPanel />}
          {panel === "history" && <HistoryPanel />}
          {panel === "devices" && <DevicesPanel />}
        </Sheet>
      )}
      {toastMsg && (
        <div className="fixed bottom-20 left-1/2 z-[70] -translate-x-1/2 rounded-xl bg-red-600 px-4 py-2 font-semibold shadow-xl">{toastMsg}</div>
      )}
    </Ctx.Provider>
  );
}

const PANEL_TITLES: Record<Exclude<Panel, null>, string> = {
  players: "Players & teams",
  display: "Display controls",
  sound: "Sound",
  settings: "Game settings",
  history: "Action history",
  devices: "Devices & pairing",
};

function TopBar({ onPanel, status }: { onPanel: (p: Panel) => void; status: ReturnType<typeof useGame>["status"] }) {
  const { view, presence, act, emit, toast, role } = useHost();
  const scorekeeper = role === "SCOREKEEPER";
  const players = view.players.filter((p) => !p.removed);
  const online = players.filter((p) => presence?.players[p.id] === "online").length;
  return (
    <header className="flex shrink-0 flex-wrap items-center gap-2 border-b border-line bg-panel px-3 py-2">
      <Link href="/dashboard" className="text-white/50 hover:text-white" title="Dashboard">←</Link>
      <div className="min-w-0">
        <div className="truncate text-sm font-semibold">{view.title}</div>
        <div className="flex items-center gap-2 text-xs text-white/60">
          <span className="money tracking-widest">{view.code}</span>
          <span className="flex items-center gap-1"><StatusDot status={status} />you</span>
          <button className="flex items-center gap-1" onClick={() => onPanel("devices")}>
            <StatusDot status={presence?.display ?? "offline"} />display
          </button>
          <button className="flex items-center gap-1" onClick={() => onPanel("players")}>
            <StatusDot status={online === players.length && players.length ? "online" : online ? "reconnecting" : "offline"} />
            {online}/{players.length} players
          </button>
          {role !== "HOST" && <span className="rounded bg-white/10 px-1.5">{role.toLowerCase()}</span>}
        </div>
      </div>
      <div className="ml-auto flex flex-wrap items-center gap-1.5">
        {!scorekeeper && view.phase !== "lobby" && (
          <>
            {view.rounds.map((r, i) => (
              <button
                key={i}
                className={`btn-ghost !px-3 !py-1.5 text-sm ${view.phase !== "final" && view.phase !== "finished" && view.roundIndex === i ? "!border-gold !text-gold" : ""}`}
                onClick={() => {
                  if (view.roundIndex !== i || view.phase === "final" || view.phase === "finished") {
                    if (confirm(`Switch to ${r.name}?`)) void act({ type: "round/set", index: i });
                  }
                }}
              >
                R{i + 1}
              </button>
            ))}
            {view.hasFinal && (
              <button
                className={`btn-ghost !px-3 !py-1.5 text-sm ${view.phase === "final" ? "!border-gold !text-gold" : ""}`}
                onClick={() => view.phase !== "final" && confirm("Go to Final Jeopardy?") && void act({ type: "final/start" })}
              >
                Final
              </button>
            )}
            <button className={`btn-ghost !px-3 !py-1.5 text-sm ${view.paused ? "!bg-yellow-500 !text-black" : ""}`} onClick={() => act({ type: "game/pause", paused: !view.paused })}>
              {view.paused ? "▶ Resume" : "⏸ Pause"}
            </button>
          </>
        )}
        {!scorekeeper && (
          <button
            className="btn-ghost !px-3 !py-1.5 text-sm"
            title="Undo last host action"
            onClick={async () => {
              const r = await emit("host:undoLast", {});
              if (!r.ok) toast(r.error);
            }}
          >
            ↶ Undo
          </button>
        )}
      </div>
    </header>
  );
}

function TabBtn({ onClick, label, icon, badge }: { onClick: () => void; label: string; icon: string; badge?: number }) {
  return (
    <button onClick={onClick} className="flex min-w-[60px] flex-1 flex-col items-center gap-0.5 rounded-lg px-2 py-1 text-xs text-white/80 hover:bg-white/5 active:bg-white/10">
      <span className="text-xl">{icon}</span>
      <span>
        {label}
        {badge !== undefined && <span className="ml-1 rounded-full bg-white/15 px-1.5">{badge}</span>}
      </span>
    </button>
  );
}

export function Sheet({ title, onClose, children }: { title: string; onClose: () => void; children: React.ReactNode }) {
  return (
    <div className="fixed inset-0 z-[60] flex justify-end bg-black/50" onClick={onClose}>
      <div
        className="flex h-full w-full max-w-xl flex-col bg-panel shadow-2xl"
        onClick={(e) => e.stopPropagation()}
        role="dialog"
        aria-label={title}
      >
        <div className="flex items-center justify-between border-b border-line px-4 py-3">
          <h2 className="text-lg font-bold">{title}</h2>
          <button onClick={onClose} className="btn-ghost !px-3 !py-1">Done</button>
        </div>
        <div className="min-h-0 flex-1 overflow-y-auto p-4">{children}</div>
      </div>
    </div>
  );
}

/** Compact one-line scores for phones, above the game controls. */
function ScoreStrip({ onOpen }: { onOpen: () => void }) {
  const { view } = useHost();
  const list = contestants(view);
  if (!list.length) return null;
  return (
    <button onClick={onOpen} className="flex shrink-0 gap-3 overflow-x-auto border-b border-line bg-panel-2 px-3 py-1.5 text-sm md:hidden">
      {list.map((c) => (
        <span key={c.id} className={`shrink-0 ${view.controlId === c.id ? "text-gold" : ""}`}>
          {c.name} <b className={(view.scores[c.id] ?? 0) < 0 ? "text-red-400" : ""}>{formatScore(view.scores[c.id] ?? 0)}</b>
        </span>
      ))}
    </button>
  );
}

function Scoreboard() {
  const { view, act, presence } = useHost();
  const list = contestants(view);
  const [editing, setEditing] = useState<string | null>(null);
  const [amount, setAmount] = useState("");
  const step = view.clue?.value ?? view.board?.values[0] ?? 100;
  return (
    <div className="flex flex-col gap-2">
      <div className="flex items-center justify-between">
        <h3 className="font-semibold">Scores</h3>
        <span className="text-xs text-white/50">tap ● to give control</span>
      </div>
      {!list.length && <div className="text-sm text-white/50">{view.settings.mode === "team" ? "Create teams in Players." : "No players yet."}</div>}
      {list.map((c) => {
        const score = view.scores[c.id] ?? 0;
        const control = view.controlId === c.id;
        return (
          <div key={c.id} className={`rounded-xl border p-2 ${control ? "border-gold" : "border-line"} bg-panel-2`}>
            <div className="flex items-center gap-2">
              <button
                className={`h-6 w-6 shrink-0 rounded-full border-2 ${control ? "border-gold bg-gold" : "border-white/30"}`}
                title="Give control of the board"
                onClick={() => act({ type: "control/set", contestantId: control ? null : c.id })}
              />
              <div className="min-w-0 flex-1">
                <div className="flex items-center gap-1.5 truncate font-semibold" style={{ color: c.color }}>
                  {c.players.length === 1 && view.settings.mode !== "team" && <StatusDot status={presence?.players[c.id] ?? "offline"} />}
                  {c.name}
                </div>
                {view.settings.mode === "team" && <div className="truncate text-xs text-white/50">{c.players.map((p) => p.name).join(", ") || "no players"}</div>}
              </div>
              <button className={`money text-xl ${score < 0 ? "!text-red-400" : ""}`} onClick={() => { setEditing(editing === c.id ? null : c.id); setAmount(String(score)); }}>
                {formatScore(score)}
              </button>
            </div>
            <div className="mt-2 grid grid-cols-4 gap-1">
              <button className="btn-bad !px-1 !py-1.5 text-sm" onClick={() => act({ type: "score/adjust", contestantId: c.id, delta: -step })}>−{step}</button>
              <button className="btn-ghost !px-1 !py-1.5 text-sm" onClick={() => act({ type: "score/adjust", contestantId: c.id, delta: -100 })}>−100</button>
              <button className="btn-ghost !px-1 !py-1.5 text-sm" onClick={() => act({ type: "score/adjust", contestantId: c.id, delta: 100 })}>+100</button>
              <button className="btn-ok !px-1 !py-1.5 text-sm" onClick={() => act({ type: "score/adjust", contestantId: c.id, delta: step })}>+{step}</button>
            </div>
            {editing === c.id && (
              <form
                className="mt-2 flex gap-1"
                onSubmit={async (e) => {
                  e.preventDefault();
                  const n = parseInt(amount, 10);
                  if (!Number.isNaN(n) && (await act({ type: "score/set", contestantId: c.id, score: n }))) setEditing(null);
                }}
              >
                <input className="input !py-1.5" inputMode="numeric" value={amount} onChange={(e) => setAmount(e.target.value.replace(/[^0-9-]/g, ""))} autoFocus />
                <button className="btn-primary !py-1.5">Set</button>
              </form>
            )}
          </div>
        );
      })}
    </div>
  );
}
