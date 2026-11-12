"use client";

import { useTick } from "@/client/useGame";
import { Ink } from "@/components/Ink";
import { useCountdown } from "@/components/game";
import type { GameView } from "@/engine/views";
import { DOODLE_CANVAS, PATTERN_COLORS, type MiniRound, type MiniX } from "@/shared/minigames";
import { TEAM_COLORS } from "@/shared/protocol";
import { MazeView } from "./MazeView";
import { litColor } from "./PartyPad";

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
  };
}

function Secs({ endsAt, now }: { endsAt?: number; now: () => number }) {
  const left = useCountdown(endsAt ?? null, now);
  if (left === null) return null;
  return <span className="money tabular-nums text-gold">{Math.max(0, Math.ceil(left / 1000))}</span>;
}

/** A row of name chips: who is in, who is out, and one of them marked. */
function Chips({ view, ids, gone, mark, markWith, extra }: { view: GameView; ids: string[]; gone?: string[]; mark?: string | null; markWith?: string; extra?: (id: string) => React.ReactNode }) {
  const { name, color } = usePlayers(view);
  return (
    <div className="flex flex-wrap justify-center gap-[1.2vmin]">
      {[...ids, ...(gone ?? [])].map((id) => {
        const out = gone?.includes(id);
        return (
          <div
            key={id}
            className={`rounded-[1.4vmin] border-[0.4vmin] px-[2.6vmin] py-[1.4vmin] text-[3.6vmin] font-bold transition-all ${out ? "opacity-30 line-through" : ""} ${mark === id ? "anim-pop scale-110 bg-white/15" : "bg-black/30"}`}
            style={{ borderColor: color(id) }}
          >
            {mark === id && <span className="mr-[0.8vmin]">{markWith}</span>}
            {name(id)}
            {!out && extra?.(id)}
          </div>
        );
      })}
    </div>
  );
}

function Potato({ view, x }: ScreenProps) {
  return <Chips view={view} ids={x.alive ?? []} gone={x.gone} mark={x.holder} markWith="💣" />;
}

function Mud({ view, x, now }: ScreenProps) {
  const { name } = usePlayers(view);
  const alive = [...(x.alive ?? [])];
  return (
    <div className="flex flex-col gap-[1.4vmin]">
      <Chips view={view} ids={alive} gone={x.gone} extra={(id) => <span className="ml-[0.8vmin] text-[2vmin]">{"🟤".repeat(x.mud?.[id] ?? 0)}</span>} />
      {x.stage === "reveal" ? (
        <ul className="mx-auto flex flex-col gap-[0.4vmin] text-[2.4vmin]">
          {(x.acts ?? []).map((a) => (
            <li key={a.id}>
              <b>{name(a.id)}</b> {a.act === "throw" ? `threw mud at ${name(a.target)}` : a.act === "duck" ? "ducked" : "scooped mud"}
              {a.hit && <span className="ml-[1vmin] font-black text-red-300">SPLAT!</span>}
            </li>
          ))}
        </ul>
      ) : (
        <div className="text-center text-[2.4vmin] text-white/80">
          Turn {x.turn}: throw, duck or scoop. {x.chosen ?? 0} of {alive.length} have chosen · <Secs endsAt={x.endsAt} now={now} />
        </div>
      )}
    </div>
  );
}

function Sumo({ view, x }: ScreenProps) {
  const { name, color } = usePlayers(view);
  return (
    <svg viewBox="-1.25 -1.25 2.5 2.5" className="mx-auto h-[56vmin] w-[56vmin]" role="img" aria-label="Sumo ring">
      <circle r={1} fill="#c8a36b" opacity={0.35} stroke="#f2e9dc" strokeWidth={0.03} />
      <circle r={0.25} fill="none" stroke="#f2e9dc" strokeWidth={0.01} opacity={0.4} />
      {(x.pigs ?? []).map((p) => (
        <g key={p.id} style={{ transform: `translate(${p.x}px, ${p.y}px)`, transition: "transform 90ms linear", opacity: p.out ? 0.25 : 1 }}>
          <circle r={0.11} fill={color(p.id)} />
          <text fontSize={0.15} textAnchor="middle" dominantBaseline="central" aria-hidden>
            🐖
          </text>
          <text y={-0.16} fontSize={0.08} textAnchor="middle" fill="#ffffff" fontWeight={700}>
            {name(p.id)}
          </text>
        </g>
      ))}
    </svg>
  );
}

function Canvas({ x }: { x: MiniX }) {
  return (
    <div className="h-[48vmin] shrink-0 overflow-hidden rounded-[1.6vmin] border-[0.3vmin] border-white/25 bg-[var(--board-deep)]" style={{ aspectRatio: `${DOODLE_CANVAS.w} / ${DOODLE_CANVAS.h}` }}>
      <Ink drawing={x.ink ?? { v: 1, ...DOODLE_CANVAS, strokes: [] }} className="h-full w-full" title="The drawing" />
    </div>
  );
}

function Doodle({ view, x, done, now }: ScreenProps) {
  const { name, color } = usePlayers(view);
  return (
    <div className="flex items-start justify-center gap-[3vmin]">
      <Canvas x={x} />
      <div className="min-w-0 flex-1 text-[2.4vmin]">
        <div>
          <b style={{ color: color(x.drawer) }}>{name(x.drawer)}</b> is drawing
        </div>
        {done ? (
          <div className="cat-text mt-[1vmin] text-[5vmin] text-gold">{x.word}</div>
        ) : (
          <div className="text-white/70">
            {x.letters} letters · type your guess · <Secs endsAt={x.endsAt} now={now} />
          </div>
        )}
        <ul className="mt-[1.2vmin] flex flex-col gap-[0.3vmin] text-[2.2vmin] text-white/80">
          {(x.guesses ?? []).map((g, i) => (
            <li key={`${g.by}${i}${g.text}`} className="truncate">
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
  const { name, color } = usePlayers(view);
  const options = [...(x.options ?? [])];
  if (done) options.sort((a, b) => (b.votes ?? 0) - (a.votes ?? 0));
  return (
    <ul className="flex min-w-0 flex-1 flex-col gap-[0.7vmin]">
      {options.map((o, i) => (
        <li key={i} className={`flex items-baseline gap-[1.5vmin] rounded-[1.2vmin] bg-black/30 px-[2vmin] py-[1.1vmin] text-[3.2vmin] ${done && i === 0 && (o.votes ?? 0) > (options[1]?.votes ?? 0) ? "ring-[0.3vmin] ring-gold" : ""}`}>
          <span className="min-w-0 flex-1">{o.text}</span>
          {done && (
            <>
              <span className="shrink-0 text-[2vmin]" style={{ color: color(o.by) }}>
                {name(o.by)}
              </span>
              <span className="money shrink-0">{o.votes ?? 0}</span>
            </>
          )}
        </li>
      ))}
    </ul>
  );
}

function WriteVote({ view, round, x, done, now }: ScreenProps) {
  return (
    <div className="flex flex-col gap-[1.2vmin]">
      <div className="cat-text text-center text-[5vmin]">{x.prompt}</div>
      {x.stage === "write" && !done ? (
        <div className="text-center text-[3.2vmin] text-white/80">
          Type your answer on your phone. {x.wrote ?? 0} of {round.players} are in · <Secs endsAt={x.endsAt} now={now} />
        </div>
      ) : (
        <>
          <Options view={view} x={x} done={done} />
          {!done && (
            <div className="text-center text-[2.2vmin] text-white/70">
              Vote on your phone. {x.voted ?? 0} of {round.players} have voted · <Secs endsAt={x.endsAt} now={now} />
            </div>
          )}
        </>
      )}
    </div>
  );
}

function Chain(props: ScreenProps) {
  const { view, x, done, now, round } = props;
  const { name, color } = usePlayers(view);
  return (
    <div className="flex items-start justify-center gap-[3vmin]">
      <Canvas x={x} />
      <div className="min-w-0 flex-1 text-[2.4vmin]">
        {x.stage === "draw" ? (
          <>
            <div>
              <b style={{ color: color(x.drawer) }}>{name(x.drawer)}</b> is adding to the drawing
            </div>
            <div className="text-white/70">
              Turn {x.turn} of {x.wrote} · <Secs endsAt={x.endsAt} now={now} />
            </div>
          </>
        ) : x.stage === "write" && !done ? (
          <div>
            Give it a title on your phone! {x.wrote ?? 0} of {round.players} are in · <Secs endsAt={x.endsAt} now={now} />
          </div>
        ) : (
          <>
            <Options view={view} x={x} done={done} />
            {!done && (
              <div className="mt-[1vmin] text-[2.2vmin] text-white/70">
                Vote for the best title · <Secs endsAt={x.endsAt} now={now} />
              </div>
            )}
          </>
        )}
      </div>
    </div>
  );
}

function Likely({ view, round, x, done, now }: ScreenProps) {
  const { name, color } = usePlayers(view);
  const most = Math.max(1, ...(x.tally ?? []).map((t) => t.votes));
  return (
    <div className="flex flex-col gap-[1.2vmin]">
      <div className="cat-text text-center text-[5vmin]">{x.prompt}…</div>
      {done ? (
        <ul className="mx-auto flex w-[80%] flex-col gap-[0.6vmin]">
          {(x.tally ?? []).filter((t) => t.votes > 0).map((t) => (
            <li key={t.id} className="flex items-center gap-[1.5vmin] text-[2.4vmin]">
              <span className="w-[22vmin] shrink-0 truncate text-right font-bold">{name(t.id)}</span>
              <span className="h-[3vmin] rounded-r-full" style={{ width: `${(t.votes / most) * 60}%`, background: color(t.id), marginRight: "0.3vmin" }} />
              <span className="money">{t.votes}</span>
            </li>
          ))}
        </ul>
      ) : (
        <div className="text-center text-[3.2vmin] text-white/80">
          Vote for a player on your phone. {x.voted ?? 0} of {round.players} have voted · <Secs endsAt={x.endsAt} now={now} />
        </div>
      )}
    </div>
  );
}

function Guess({ view, round, x, done, now }: ScreenProps) {
  const { name, color } = usePlayers(view);
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
          <ol className="flex flex-col gap-[0.4vmin] text-[2.4vmin]">
            {(x.values ?? []).slice(0, 5).map((v, i) => (
              <li key={v.id} className="flex gap-[1.5vmin]">
                <span className="w-[3vmin]">{i === 0 ? "🏆" : i + 1}</span>
                <span className="w-[22vmin] truncate font-bold" style={{ color: color(v.id) }}>
                  {name(v.id)}
                </span>
                <span className="money tabular-nums">{v.value}</span>
              </li>
            ))}
          </ol>
        </div>
      ) : (
        <div className="text-center text-[3.2vmin] text-white/80">
          Type a number on your phone. {x.voted ?? 0} of {round.players} have guessed · <Secs endsAt={x.endsAt} now={now} />
        </div>
      )}
    </div>
  );
}

function Split({ round, x, done, now }: ScreenProps) {
  const [a, b] = x.counts ?? [0, 0];
  const total = Math.max(1, a + b);
  const sides = x.sideNames ?? ["A", "B"];
  return (
    <div className="flex flex-col gap-[1.2vmin]">
      <div className="cat-text text-center text-[5vmin]">{x.prompt}</div>
      <div className="flex h-[16vmin] overflow-hidden rounded-[2vmin] text-[4.6vmin] font-black text-black">
        <div className="grid place-items-center bg-[#ff7ad9] transition-[width] duration-700" style={{ width: done ? `${Math.max(12, (a / total) * 100)}%` : "50%" }}>
          {sides[0]} {done && a}
        </div>
        <div className="grid flex-1 place-items-center bg-[#7bdff2]">
          {sides[1]} {done && b}
        </div>
      </div>
      {!done && (
        <div className="text-center text-[2.4vmin] text-white/80">
          Pick the side you think MOST people will pick. {x.voted ?? 0} of {round.players} have picked · <Secs endsAt={x.endsAt} now={now} />
        </div>
      )}
    </div>
  );
}

function Pattern({ x, now }: ScreenProps) {
  useTick(60, x.stage === "show");
  const lit = litColor(x, now());
  return (
    <div className="flex items-center justify-center gap-[4vmin]">
      <div className="grid grid-cols-4 gap-[1.2vmin]">
        {PATTERN_COLORS.map((c, i) => (
          <div key={c} className="h-[20vmin] w-[20vmin] rounded-[2.4vmin] transition-[opacity,transform] duration-75" style={{ background: c, opacity: lit === i ? 1 : 0.2, transform: lit === i ? "scale(1.06)" : undefined }} />
        ))}
      </div>
      <div className="min-w-0 text-[2.6vmin]">
        <div className="font-bold">{x.stage === "show" ? `Watch: ${x.seq?.length} colours` : "Now repeat it on your phone!"}</div>
        {x.stage === "input" && (
          <div className="text-white/70">
            <Secs endsAt={x.endsAt} now={now} /> s left
          </div>
        )}
        <div className="mt-[1vmin] text-[2.2vmin] text-white/70">
          {x.alive?.length ?? 0} still in{(x.gone?.length ?? 0) > 0 && `, ${x.gone?.length} out`}
        </div>
      </div>
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
  if (!round.x) return <div className="cat-text grid h-[14vmin] place-items-center text-[5vmin] text-white/70">Get ready…</div>;
  return <Screen view={view} round={round} x={round.x} done={round.phase === "done"} now={now} />;
}
