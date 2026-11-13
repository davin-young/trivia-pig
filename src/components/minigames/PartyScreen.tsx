"use client";

import { useTick } from "@/client/useGame";
import { Ink } from "@/components/Ink";
import { useCountdown } from "@/components/game";
import type { GameView } from "@/engine/views";
import { DOODLE_CANVAS, PATTERN_COLORS, type MiniRound, type MiniX } from "@/shared/minigames";
import { TEAM_COLORS } from "@/shared/protocol";
import { MazeView } from "./MazeView";
import { litColor } from "./PartyPad";
import { Pig, vmin } from "./Pig";

interface ScreenProps {
  view: GameView;
  round: MiniRound;
  x: MiniX;
  done: boolean;
  now: () => number;
}

function usePlayers(view: GameView) {
  const player = (id: string | null | undefined) => view.players.find((p) => p.id === id);
  return {
    name: (id: string | null | undefined) => player(id)?.name ?? "Someone",
    color: (id: string | null | undefined) => TEAM_COLORS[(player(id)?.index ?? 0) % TEAM_COLORS.length],
    /** Join order, so everyone keeps their place on screen for the whole round. */
    inOrder: (ids: string[]) => [...new Set(ids)].sort((a, b) => (player(a)?.index ?? 0) - (player(b)?.index ?? 0)),
  };
}

function Secs({ endsAt, now }: { endsAt?: number; now: () => number }) {
  const left = useCountdown(endsAt ?? null, now);
  if (left === null) return null;
  return <span className="money tabular-nums text-gold">{Math.max(0, Math.ceil(left / 1000))}</span>;
}

const pigSize = (n: number) => (n <= 5 ? 11 : n <= 8 ? 9.5 : n <= 12 ? 8 : 6.5);
const ARENA = { w: 92, h: 50 };

/** Where each pig stands around the pen (centre points, in vmin). */
function ringSpots(n: number, size: number): { x: number; y: number }[] {
  if (n === 1) return [{ x: ARENA.w / 2, y: ARENA.h / 2 - size * 0.2 }];
  const rx = ARENA.w / 2 - size * 0.95;
  const ry = ARENA.h / 2 - size * 0.95;
  return Array.from({ length: n }, (_, i) => {
    const a = -Math.PI / 2 + (i * 2 * Math.PI) / n;
    return { x: ARENA.w / 2 + rx * Math.cos(a), y: ARENA.h / 2 - size * 0.15 + ry * Math.sin(a) };
  });
}

function Arena({ children, mud }: { children: React.ReactNode; mud?: boolean }) {
  return (
    <div className="relative mx-auto" style={{ width: vmin(ARENA.w), height: vmin(ARENA.h) }}>
      <div
        className="absolute left-1/2 top-1/2 -translate-x-1/2 -translate-y-1/2 rounded-[50%]"
        style={{
          width: vmin(ARENA.w * 0.5),
          height: vmin(ARENA.h * 0.42),
          background: mud ? "radial-gradient(ellipse at 45% 40%, #7a4f26, #4a2f14 70%, transparent 72%)" : "radial-gradient(ellipse at 50% 45%, rgba(255,255,255,0.10), rgba(255,255,255,0.03) 70%, transparent 72%)",
        }}
        aria-hidden
      />
      {children}
    </div>
  );
}

/** A row of everyone in the round: pigs hop and get a tick once they have answered. */
function PigRow({ view, ids, ready, gone }: { view: GameView; ids: string[]; ready?: string[]; gone?: string[] }) {
  const { inOrder } = usePlayers(view);
  const all = inOrder([...ids, ...(gone ?? [])]);
  const size = all.length <= 6 ? 9 : all.length <= 10 ? 7.5 : all.length <= 16 ? 6 : 5;
  return (
    <div className="flex flex-wrap items-start justify-center gap-x-[3vmin] gap-y-[1.6vmin] pt-[1.6vmin]">
      {all.map((id, i) => {
        const out = gone?.includes(id);
        const isReady = ready?.includes(id);
        return <Pig key={id} view={view} id={id} size={size} delay={(i % 5) * 0.18} mood={out ? "out" : isReady ? "hop" : "bob"} badge={out ? "💫" : ready ? (isReady ? "✅" : "💭") : undefined} />;
      })}
    </div>
  );
}

function Potato({ view, x, done }: ScreenProps) {
  const { inOrder, name } = usePlayers(view);
  const alive = x.alive ?? [];
  const gone = x.gone ?? [];
  const ids = inOrder([...alive, ...gone]);
  const size = pigSize(ids.length);
  const spots = ringSpots(ids.length, size);
  const at = (id: string | null | undefined) => (id ? spots[ids.indexOf(id)] : undefined);
  const holderAt = at(x.holder);
  const lastOut = gone[gone.length - 1];
  return (
    <Arena>
      <div className="absolute inset-0 grid place-items-center text-center">
        <div>
          {x.holder ? (
            <>
              <div className="cat-text text-[4.4vmin] text-gold">{name(x.holder)} has it!</div>
              <div className="text-[2.2vmin] text-white/70">Pass it on before it pops</div>
            </>
          ) : (
            <div className="text-[7vmin]">{done && alive.length === 1 ? "🎉" : "💥"}</div>
          )}
        </div>
      </div>
      {ids.map((id, i) => {
        const s = spots[i];
        const out = gone.includes(id);
        return (
          <div key={id} className="absolute" style={{ left: vmin(s.x - size / 2), top: vmin(s.y - size / 2) }}>
            <Pig view={view} id={id} size={size} delay={(i % 5) * 0.2} mood={out ? "out" : id === x.holder ? "panic" : "bob"} badge={out ? "💫" : done && alive.length === 1 ? "👑" : undefined}>
              {out && <span className="absolute inset-0 rounded-full bg-black/55" aria-hidden />}
              {id === lastOut && (
                <span key={gone.length} className="boom absolute inset-0 grid place-items-center" style={{ fontSize: vmin(size * 0.9) }} aria-hidden>
                  💥
                </span>
              )}
            </Pig>
          </div>
        );
      })}
      {holderAt && (
        <div
          className="pointer-events-none absolute leading-none"
          style={{ left: vmin(holderAt.x - size * 0.1), top: vmin(holderAt.y - size * 0.95), fontSize: vmin(size * 0.62), transition: "left 280ms cubic-bezier(0.3, 1.3, 0.5, 1), top 280ms cubic-bezier(0.3, 1.3, 0.5, 1)" }}
          aria-hidden
        >
          <span className="bomb inline-block">💣</span>
        </div>
      )}
    </Arena>
  );
}

function Mud({ view, x, done, now }: ScreenProps) {
  const { inOrder } = usePlayers(view);
  const alive = x.alive ?? [];
  const gone = x.gone ?? [];
  const ids = inOrder([...alive, ...gone]);
  const size = pigSize(ids.length);
  const spots = ringSpots(ids.length, size);
  const at = (id: string | null | undefined) => (id ? spots[ids.indexOf(id)] : undefined);
  const reveal = x.stage === "reveal";
  const acts = reveal ? (x.acts ?? []) : [];
  const actOf = (id: string) => acts.find((a) => a.id === id);
  const splatted = acts.filter((a) => a.hit).map((a) => a.id);
  const ready = x.ready ?? [];
  const throws = acts.filter((a) => a.act === "throw" && at(a.id) && at(a.target));
  const ball = 3.2;
  return (
    <Arena mud>
      <div className="absolute inset-0 grid place-items-center text-center">
        {reveal ? (
          <div key={`r${x.turn}`} className="late-pop cat-text text-[6vmin]" style={{ color: splatted.length ? "#ffb26b" : "#ffffff" }}>
            {splatted.length ? "SPLAT!" : throws.length ? "Missed! 💨" : "All quiet… 🐽"}
          </div>
        ) : (
          <div>
            <div className="text-[2vmin] uppercase tracking-widest text-white/70">Turn {x.turn}</div>
            <div className="text-[7vmin] leading-none">
              <Secs endsAt={x.endsAt} now={now} />
            </div>
            <div className="text-[2.2vmin] text-white/80">Throw, duck or scoop!</div>
          </div>
        )}
      </div>
      {ids.map((id, i) => {
        const s = spots[i];
        const out = gone.includes(id);
        const fresh = splatted.includes(id);
        const a = actOf(id);
        const mood = out && !fresh ? "out" : a?.act === "duck" ? "duck" : reveal ? undefined : ready.includes(id) ? "hop" : "bob";
        const badge = out && !fresh ? "💫" : fresh ? "😵" : reveal ? (a?.act === "duck" ? "🙈" : a?.act === "reload" ? "🪣" : undefined) : done && alive.length === 1 ? "👑" : ready.includes(id) ? "✅" : "💭";
        return (
          <div key={id} className="absolute" style={{ left: vmin(s.x - size / 2), top: vmin(s.y - size / 2) }}>
            <Pig view={view} id={id} size={size} delay={(i % 5) * 0.2} mood={mood} badge={badge}>
              {out && <span key={fresh ? `f${x.turn}` : "old"} className={`mud-cover absolute inset-0 ${fresh ? "late-pop" : ""}`} aria-hidden />}
            </Pig>
            {!out && (
              <div className="mt-[0.3vmin] flex h-[1.6vmin] justify-center gap-[0.4vmin]" aria-label={`${x.mud?.[id] ?? 0} mud`}>
                {Array.from({ length: x.mud?.[id] ?? 0 }, (_, k) => (
                  <span key={k} className="h-[1.6vmin] w-[1.6vmin] rounded-full" style={{ background: "radial-gradient(circle at 35% 30%, #a8743d, #5b3a1a 75%)" }} />
                ))}
              </div>
            )}
          </div>
        );
      })}
      {throws.map((a, i) => {
        const from = at(a.id)!;
        const to = at(a.target)!;
        return (
          <div
            key={`${x.turn}-${a.id}`}
            className="mud-ball pointer-events-none absolute"
            style={{ left: vmin(from.x - ball / 2), top: vmin(from.y - ball / 2), width: vmin(ball), height: vmin(ball), animationDelay: `${Math.min(0.3, i * 0.08)}s`, ["--dx" as string]: vmin(to.x - from.x), ["--dy" as string]: vmin(to.y - from.y) }}
            aria-hidden
          />
        );
      })}
    </Arena>
  );
}

function Sumo({ view, x }: ScreenProps) {
  const ring = 54;
  const span = 2.5; // the ring is drawn in a square from -1.25 to 1.25
  const pig = (0.22 / span) * ring;
  return (
    <div className="relative mx-auto" style={{ width: vmin(ring), height: vmin(ring) }} role="img" aria-label="Sumo ring">
      <div className="absolute rounded-full border-[0.5vmin] border-dashed border-[#f2e9dc]/70" style={{ inset: `${((span - 2) / 2 / span) * 100}%`, background: "radial-gradient(circle, #d9b77e 0%, #b98f55 70%, #9c7440 100%)", opacity: 0.55 }} />
      <div className="absolute left-1/2 top-1/2 h-[20%] w-[20%] -translate-x-1/2 -translate-y-1/2 rounded-full border-[0.2vmin] border-white/40" />
      {(x.pigs ?? []).map((p) => (
        <div
          key={p.id}
          className="absolute"
          style={{ left: `calc(${((p.x + span / 2) / span) * 100}% - ${vmin(pig / 2)})`, top: `calc(${((p.y + span / 2) / span) * 100}% - ${vmin(pig / 2)})`, transition: "left 90ms linear, top 90ms linear, opacity 300ms", opacity: p.out ? 0.35 : 1 }}
        >
          <Pig view={view} id={p.id} size={pig} mood={p.out ? "out" : undefined} badge={p.out ? "💫" : undefined} />
        </div>
      ))}
    </div>
  );
}

function Canvas({ x }: { x: MiniX }) {
  return (
    <div className="h-[48vmin] shrink-0 overflow-hidden rounded-[1.6vmin] border-[0.3vmin] border-white/25 bg-[var(--board-deep)]" style={{ aspectRatio: `${DOODLE_CANVAS.w} / ${DOODLE_CANVAS.h}` }}>
      <Ink drawing={x.ink ?? { v: 1, ...DOODLE_CANVAS, strokes: [] }} className="h-full w-full" title="The drawing" />
    </div>
  );
}

/** The artist, as a pig holding a pencil. */
function Artist({ view, id, children }: { view: GameView; id: string | null | undefined; children: React.ReactNode }) {
  return (
    <div className="flex items-center gap-[2vmin]">
      {id && <Pig view={view} id={id} size={8} mood="bob" badge="✏️" />}
      <div className="min-w-0 flex-1">{children}</div>
    </div>
  );
}

function Doodle({ view, x, done, now }: ScreenProps) {
  const { name, color } = usePlayers(view);
  return (
    <div className="flex items-start justify-center gap-[3vmin]">
      <Canvas x={x} />
      <div className="min-w-0 flex-1 text-[2.4vmin]">
        <Artist view={view} id={x.drawer}>
          <div className="font-bold">is drawing…</div>
          {done ? (
            <div className="cat-text anim-pop text-[5vmin] text-gold">{x.word}</div>
          ) : (
            <div className="text-white/70">
              {x.letters} letters · <Secs endsAt={x.endsAt} now={now} />
            </div>
          )}
        </Artist>
        <ul className="mt-[1.6vmin] flex flex-col gap-[0.5vmin] text-[2.2vmin] text-white/85">
          {(x.guesses ?? []).map((g, i) => (
            <li key={`${g.by}${i}${g.text}`} className="anim-pop w-fit max-w-full truncate rounded-[1.4vmin] rounded-bl-none bg-white/10 px-[1.4vmin] py-[0.4vmin]">
              <b style={{ color: color(g.by) }}>{name(g.by)}:</b> {g.text} ✗
            </li>
          ))}
        </ul>
      </div>
    </div>
  );
}

/** The answers everyone wrote: plain while voting, with names and votes at the end. */
function Options({ view, x, done }: { view: GameView; x: MiniX; done: boolean }) {
  const options = [...(x.options ?? [])];
  if (done) options.sort((a, b) => (b.votes ?? 0) - (a.votes ?? 0));
  return (
    <ul className="flex min-w-0 flex-1 flex-col gap-[0.7vmin]">
      {options.map((o, i) => {
        const best = done && i === 0 && (o.votes ?? 0) > (options[1]?.votes ?? 0);
        return (
          <li key={i} className={`anim-pop flex items-center gap-[1.5vmin] rounded-[1.2vmin] bg-black/30 px-[2vmin] py-[1.1vmin] text-[3.2vmin] ${best ? "ring-[0.3vmin] ring-gold" : ""}`} style={{ animationDelay: `${i * 0.08}s` }}>
            <span className="min-w-0 flex-1">{o.text}</span>
            {done && (
              <>
                {o.by && <Pig view={view} id={o.by} size={4.6} badge={best ? "👑" : undefined} />}
                <span className="money shrink-0">{o.votes ?? 0}</span>
              </>
            )}
          </li>
        );
      })}
    </ul>
  );
}

function WriteVote({ view, x, done, now }: ScreenProps) {
  const writing = x.stage === "write" && !done;
  return (
    <div className="flex flex-col gap-[1.2vmin]">
      <div className="cat-text text-center text-[5vmin]">{x.prompt}</div>
      {!writing && <Options view={view} x={x} done={done} />}
      {!done && (
        <>
          <div className="text-center text-[2.6vmin] text-white/80">
            {writing ? "✍️ Type your answer on your phone" : "🗳️ Vote for the best one on your phone"} · <Secs endsAt={x.endsAt} now={now} />
          </div>
          <PigRow view={view} ids={x.alive ?? []} ready={x.ready ?? []} />
        </>
      )}
    </div>
  );
}

function Chain(props: ScreenProps) {
  const { view, x, done, now } = props;
  return (
    <div className="flex items-start justify-center gap-[3vmin]">
      <Canvas x={x} />
      <div className="min-w-0 flex-1 text-[2.4vmin]">
        {x.stage === "draw" ? (
          <Artist view={view} id={x.drawer}>
            <div className="font-bold">is adding to the drawing</div>
            <div className="text-white/70">
              Turn {x.turn} of {x.wrote} · <Secs endsAt={x.endsAt} now={now} />
            </div>
          </Artist>
        ) : x.stage === "write" && !done ? (
          <>
            <div>
              ✍️ Give it a title on your phone! <Secs endsAt={x.endsAt} now={now} />
            </div>
            <PigRow view={view} ids={x.alive ?? []} ready={x.ready ?? []} />
          </>
        ) : (
          <>
            <Options view={view} x={x} done={done} />
            {!done && (
              <>
                <div className="mt-[1vmin] text-[2.2vmin] text-white/70">
                  🗳️ Vote for the best title · <Secs endsAt={x.endsAt} now={now} />
                </div>
                <PigRow view={view} ids={x.alive ?? []} ready={x.ready ?? []} />
              </>
            )}
          </>
        )}
      </div>
    </div>
  );
}

function Likely({ view, x, done, now }: ScreenProps) {
  const { color } = usePlayers(view);
  const tally = (x.tally ?? []).filter((t) => t.votes > 0);
  const most = Math.max(1, ...tally.map((t) => t.votes));
  return (
    <div className="flex flex-col gap-[1.2vmin]">
      <div className="cat-text text-center text-[5vmin]">{x.prompt}…</div>
      {done ? (
        <div className="flex items-end justify-center gap-[3vmin] pt-[2vmin]">
          {tally.map((t, i) => (
            <div key={t.id} className="flex flex-col items-center gap-[0.6vmin]">
              <span className="money anim-pop text-[3vmin]" style={{ animationDelay: `${0.3 + i * 0.1}s` }}>
                {t.votes}
              </span>
              <Pig view={view} id={t.id} size={t.votes === most ? 12 : 8} mood={t.votes === most ? "hop" : undefined} badge={t.votes === most ? "👑" : undefined} />
              <span className="w-full rounded-t-[1vmin]" style={{ height: vmin((t.votes / most) * 10), background: color(t.id), opacity: 0.8 }} />
            </div>
          ))}
        </div>
      ) : (
        <>
          <div className="text-center text-[2.6vmin] text-white/80">
            👉 Vote for a player on your phone · <Secs endsAt={x.endsAt} now={now} />
          </div>
          <PigRow view={view} ids={x.alive ?? []} ready={x.ready ?? []} />
        </>
      )}
    </div>
  );
}

function Guess({ view, x, done, now }: ScreenProps) {
  return (
    <div className="flex flex-col gap-[1.2vmin]">
      <div className="cat-text text-center text-[5vmin]">
        {x.prompt} {x.unit && <span className="text-[2.4vmin] text-white/60">(in {x.unit})</span>}
      </div>
      {done ? (
        <div className="flex items-center justify-center gap-[5vmin]">
          <div className="text-center">
            <div className="text-[2vmin] text-white/60">The answer</div>
            <div className="money anim-pop text-[9vmin]">{x.answer}</div>
          </div>
          <div className="flex items-end gap-[2.4vmin]">
            {(x.values ?? []).slice(0, 6).map((v, i) => (
              <div key={v.id} className="anim-pop flex flex-col items-center gap-[0.5vmin]" style={{ animationDelay: `${0.2 + i * 0.12}s` }}>
                <Pig view={view} id={v.id} size={i === 0 ? 11 : 7} mood={i === 0 ? "hop" : undefined} badge={i === 0 ? "🏆" : undefined} />
                <span className="money tabular-nums text-[2.6vmin]">{v.value}</span>
              </div>
            ))}
          </div>
        </div>
      ) : (
        <>
          <div className="text-center text-[2.6vmin] text-white/80">
            🔢 Type a number on your phone · <Secs endsAt={x.endsAt} now={now} />
          </div>
          <PigRow view={view} ids={x.alive ?? []} ready={x.ready ?? []} />
        </>
      )}
    </div>
  );
}

function Split({ view, x, done, now }: ScreenProps) {
  const { inOrder } = usePlayers(view);
  const [a, b] = x.counts ?? [0, 0];
  const total = Math.max(1, a + b);
  const sides = x.sideNames ?? ["A", "B"];
  const picked = (side: 0 | 1) => inOrder(Object.keys(x.picks ?? {}).filter((id) => x.picks?.[id] === side));
  return (
    <div className="flex flex-col gap-[1.2vmin]">
      <div className="cat-text text-center text-[5vmin]">{x.prompt}</div>
      <div className="flex h-[14vmin] overflow-hidden rounded-[2vmin] text-[4.6vmin] font-black text-black">
        <div className="grid place-items-center bg-[#ff7ad9] transition-[width] duration-700" style={{ width: done ? `${Math.max(12, (a / total) * 100)}%` : "50%" }}>
          {sides[0]} {done && a}
        </div>
        <div className="grid flex-1 place-items-center bg-[#7bdff2]">
          {sides[1]} {done && b}
        </div>
      </div>
      {done ? (
        <div className="grid grid-cols-2 gap-[2vmin] pt-[1vmin]">
          {([0, 1] as const).map((side) => (
            <div key={side} className="flex flex-wrap justify-center gap-[2vmin]">
              {picked(side).map((id, i) => (
                <div key={id} className="anim-pop" style={{ animationDelay: `${i * 0.08}s` }}>
                  <Pig view={view} id={id} size={7} mood={(side === 0 ? a > b : b > a) ? "hop" : undefined} />
                </div>
              ))}
            </div>
          ))}
        </div>
      ) : (
        <>
          <div className="text-center text-[2.4vmin] text-white/80">
            Pick the side you think MOST people will pick · <Secs endsAt={x.endsAt} now={now} />
          </div>
          <PigRow view={view} ids={x.alive ?? []} ready={x.ready ?? []} />
        </>
      )}
    </div>
  );
}

function Pattern({ view, x, now }: ScreenProps) {
  useTick(60, x.stage === "show");
  const lit = litColor(x, now());
  return (
    <div className="flex flex-col gap-[1vmin]">
      <div className="flex items-center justify-center gap-[4vmin]">
        <div className="grid grid-cols-4 gap-[1.2vmin]">
          {PATTERN_COLORS.map((c, i) => (
            <div key={c} className="h-[16vmin] w-[16vmin] rounded-[2.4vmin] transition-[opacity,transform,box-shadow] duration-75" style={{ background: c, opacity: lit === i ? 1 : 0.2, transform: lit === i ? "scale(1.08)" : undefined, boxShadow: lit === i ? `0 0 4vmin ${c}` : undefined }} />
          ))}
        </div>
        <div className="min-w-0 text-[2.6vmin]">
          <div className="font-bold">{x.stage === "show" ? `👀 Watch: ${x.seq?.length} colours` : "👆 Now repeat it on your phone!"}</div>
          {x.stage === "input" && (
            <div className="text-white/70">
              <Secs endsAt={x.endsAt} now={now} /> s left
            </div>
          )}
        </div>
      </div>
      <PigRow view={view} ids={x.alive ?? []} gone={x.gone} />
    </div>
  );
}

function Maze({ view, x }: ScreenProps) {
  return <MazeView x={x} view={view} className="mx-auto h-[56vmin]" />;
}

const SCREENS: Partial<Record<MiniRound["kind"], (p: ScreenProps) => React.ReactNode>> = {
  potato: Potato,
  mud: Mud,
  sumo: Sumo,
  doodle: Doodle,
  chain: Chain,
  caption: WriteVote,
  likely: Likely,
  guess: Guess,
  split: Split,
  pattern: Pattern,
  maze: Maze,
};

/** The big-screen side of the bigger lobby games. */
export function PartyScreen({ view, round, now }: { view: GameView; round: MiniRound; now: () => number }) {
  const Screen = SCREENS[round.kind];
  if (!Screen) return null;
  if (!round.x) return <div className="cat-text anim-bob grid h-[14vmin] place-items-center text-[5vmin] text-white/70">🐷 Get ready…</div>;
  return <Screen view={view} round={round} x={round.x} done={round.phase === "done"} now={now} />;
}
