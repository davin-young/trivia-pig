"use client";

import { useEffect, useRef, useState } from "react";
import { useTick } from "@/client/useGame";
import { DrawingPad } from "@/components/DrawingPad";
import { Ink } from "@/components/Ink";
import { useCountdown } from "@/components/game";
import type { GameView } from "@/engine/views";
import { DOODLE_CANVAS, PATTERN_COLORS, type MiniRound, type MiniX, type TapInput } from "@/shared/minigames";
import { compactDrawing } from "@/shared/strokes";
import { MazeView } from "./MazeView";
import { Pig } from "./Pig";

export interface PadProps {
  view: GameView;
  round: MiniRound;
  x: MiniX;
  myId: string;
  send: (payload: TapInput) => Promise<void>;
  now: () => number;
}

const big = "w-full select-none rounded-2xl py-5 text-2xl font-black transition-transform active:scale-95 disabled:opacity-40";
const choice = "w-full rounded-xl border border-line bg-white/5 px-3 py-3 text-left text-base font-semibold active:scale-[0.98] disabled:opacity-40";
const picked = "!border-gold !bg-gold/20";

function useNames(view: GameView) {
  return (id: string | null | undefined) => view.players.find((p) => p.id === id)?.name ?? "Someone";
}

/** How long is left in the step the round is on. */
function Clock({ endsAt, now }: { endsAt?: number; now: () => number }) {
  const left = useCountdown(endsAt ?? null, now);
  if (left === null) return null;
  const secs = Math.max(0, Math.ceil(left / 1000));
  return (
    <span className={`inline-flex items-center gap-1 rounded-full bg-black/40 px-2.5 py-0.5 text-sm ${secs <= 3 ? "text-red-300" : "text-white/70"}`} aria-label={`${secs} seconds left`}>
      ⏳ <b className="money text-base tabular-nums">{secs}</b>
    </span>
  );
}
function TimeLeft(props: { endsAt?: number; now: () => number }) {
  return (
    <div className="mt-2 flex justify-center">
      <Clock {...props} />
    </div>
  );
}

/** Nothing to press right now: say what happened, big and friendly. */
function Status({ emoji, title, sub }: { emoji: string; title: string; sub?: string }) {
  return (
    <div className="py-4">
      <div className="anim-pop text-6xl">{emoji}</div>
      <div className="mt-1 text-xl font-black">{title}</div>
      {sub && <div className="text-sm text-white/60">{sub}</div>}
    </div>
  );
}

/** Players to tap, as pigs with their drawn faces. `quick` acts on touch-down (for games where speed matters). */
function PigGrid({ view, ids, chosen, disabled, quick, onPick }: { view: GameView; ids: string[]; chosen?: string | null; disabled?: boolean; quick?: boolean; onPick: (id: string) => void }) {
  const name = useNames(view);
  const cols = ids.length <= 3 ? Math.max(1, ids.length) : ids.length <= 6 ? 3 : 4;
  return (
    <div className="grid gap-2" style={{ gridTemplateColumns: `repeat(${cols}, minmax(0, 1fr))` }}>
      {ids.map((id) => (
        <button
          key={id}
          type="button"
          disabled={disabled}
          aria-label={name(id)}
          aria-pressed={chosen === id}
          className={`flex justify-center overflow-hidden rounded-2xl border-2 px-1 pb-2 pt-3 transition active:scale-95 disabled:opacity-40 ${chosen === id ? "border-gold bg-gold/20" : "border-transparent bg-white/5"}`}
          style={{ touchAction: "manipulation" }}
          onPointerDown={quick ? () => onPick(id) : undefined}
          onClick={quick ? undefined : () => onPick(id)}
        >
          <Pig view={view} id={id} size={cols === 4 ? 46 : 56} unit="px" badge={chosen === id ? "✅" : undefined} />
        </button>
      ))}
    </div>
  );
}

function Potato({ view, x, myId, send }: PadProps) {
  const name = useNames(view);
  if (x.gone?.includes(myId)) return <Status emoji="💥" title="It popped on you!" sub="You're out. Watch the big screen." />;
  if (x.holder !== myId) {
    return (
      <div className="py-3">
        <div className="flex justify-center">{x.holder && <Pig view={view} id={x.holder} size={96} unit="px" mood="panic" badge="💣" label={false} />}</div>
        <div className="mt-3 text-lg font-bold">{name(x.holder)} has the mud bomb…</div>
        <div className="text-sm text-white/60">Get ready to pass it on!</div>
      </div>
    );
  }
  return (
    <>
      <div className="anim-pop mb-2 rounded-2xl bg-red-600 py-2 text-xl font-black">💣 YOU HAVE IT! Tap a pig</div>
      <PigGrid view={view} ids={(x.alive ?? []).filter((p) => p !== myId)} quick onPick={(p) => void send({ target: p })} />
    </>
  );
}

const action = "flex flex-col items-center gap-0.5 rounded-2xl py-3 text-lg font-black text-black transition active:scale-95 disabled:opacity-40";

function Mud({ view, x, myId, send, now }: PadProps) {
  const name = useNames(view);
  if (x.gone?.includes(myId)) return <Status emoji="🫠" title="Splat! You're out" sub="Watch the big screen." />;
  const mud = x.mud?.[myId] ?? 0;
  if (x.stage === "reveal") {
    const mine = x.acts?.find((a) => a.id === myId);
    if (mine?.act === "duck") return <Status emoji="🙈" title="You ducked" sub="Watch the big screen…" />;
    if (mine?.act === "throw") return <Status emoji="🟤" title={`You threw at ${name(mine.target)}`} sub="Watch the big screen…" />;
    return <Status emoji="🪣" title="You scooped some mud" sub="Watch the big screen…" />;
  }
  const blob = "inline-block h-4 w-4 rounded-full";
  return (
    <>
      <div className="mb-2 flex items-center justify-between gap-2 text-sm">
        <span className="font-semibold text-white/80">Turn {x.turn}</span>
        <span className="flex items-center gap-1 text-white/70" aria-label={`You have ${mud} mud`}>
          Your mud:
          {mud ? Array.from({ length: mud }, (_, i) => <span key={i} className={blob} style={{ background: "radial-gradient(circle at 35% 30%, #a8743d, #5b3a1a 75%)" }} />) : " none"}
        </span>
        <Clock endsAt={x.endsAt} now={now} />
      </div>
      <div className="mb-1 text-left text-xs uppercase tracking-wide text-white/50">{mud < 1 ? "No mud to throw: scoop some first" : "Throw at"}</div>
      <PigGrid view={view} ids={(x.alive ?? []).filter((p) => p !== myId)} disabled={mud < 1} chosen={x.mine?.act === "throw" ? x.mine.target : null} onPick={(p) => void send({ act: "throw", target: p })} />
      <div className="mt-2 grid grid-cols-2 gap-2">
        <button type="button" disabled={!x.mine?.canDuck} className={`${action} bg-[#7bdff2] ${x.mine?.act === "duck" ? "ring-4 ring-white" : ""}`} onClick={() => void send({ act: "duck" })}>
          <span className="text-3xl leading-none">🙈</span>
          Duck
        </button>
        <button type="button" className={`${action} bg-[#c79a5b] ${x.mine?.act === "reload" ? "ring-4 ring-white" : ""}`} onClick={() => void send({ act: "reload" })}>
          <span className="text-3xl leading-none">🪣</span>
          Scoop mud
        </button>
      </div>
      <div className="mt-2 text-xs text-white/50">{!x.mine?.canDuck ? "No ducking twice in a row." : x.mine?.act ? "Locked in. Tap something else to change it." : "Pick one before the time runs out."}</div>
    </>
  );
}

/** A thumb pad: drag from the middle to steer. */
function Sumo({ x, myId, send }: PadProps) {
  const pad = useRef<HTMLDivElement>(null);
  const want = useRef({ x: 0, y: 0 });
  const sent = useRef({ x: 0, y: 0 });
  const [knob, setKnob] = useState({ x: 0, y: 0 });
  const out = x.pigs?.find((p) => p.id === myId)?.out;
  useEffect(() => {
    const t = setInterval(() => {
      const w = want.current;
      if (w.x === sent.current.x && w.y === sent.current.y) return;
      sent.current = { ...w };
      void send({ x: w.x, y: w.y });
    }, 100);
    return () => clearInterval(t);
  }, [send]);
  if (out) return <Status emoji="💫" title="You're out of the ring!" sub="Watch the big screen." />;
  const steer = (e: React.PointerEvent) => {
    const r = pad.current!.getBoundingClientRect();
    let dx = (e.clientX - (r.left + r.width / 2)) / (r.width / 2);
    let dy = (e.clientY - (r.top + r.height / 2)) / (r.height / 2);
    const len = Math.hypot(dx, dy);
    if (len > 1) {
      dx /= len;
      dy /= len;
    }
    want.current = { x: Math.round(dx * 100) / 100, y: Math.round(dy * 100) / 100 };
    setKnob(want.current);
  };
  const stop = () => {
    want.current = { x: 0, y: 0 };
    setKnob(want.current);
  };
  return (
    <>
      <div
        ref={pad}
        className="relative mx-auto aspect-square w-56 max-w-full rounded-full border-2 border-white/25 bg-black/30"
        style={{ touchAction: "none" }}
        role="application"
        aria-label="Steering pad: drag to steer your pig"
        onPointerDown={(e) => {
          e.currentTarget.setPointerCapture(e.pointerId);
          steer(e);
        }}
        onPointerMove={(e) => e.buttons > 0 && steer(e)}
        onPointerUp={stop}
        onPointerCancel={stop}
      >
        <div className="absolute left-1/2 top-1/2 grid h-16 w-16 place-items-center rounded-full bg-gold text-3xl" style={{ transform: `translate(calc(-50% + ${knob.x * 80}px), calc(-50% + ${knob.y * 80}px))` }}>
          🐖
        </div>
      </div>
      <div className="mt-2 text-xs text-white/50">Drag to steer. Watch the big screen.</div>
    </>
  );
}

/** A box to type something short and send it. */
function TextBox({ placeholder, button, max, onSend, keep }: { placeholder: string; button: string; max: number; onSend: (text: string) => void; keep?: boolean }) {
  const [text, setText] = useState("");
  return (
    <form
      className="flex gap-2"
      onSubmit={(e) => {
        e.preventDefault();
        if (!text.trim()) return;
        onSend(text);
        if (!keep) setText("");
      }}
    >
      <input className="input min-w-0 flex-1" value={text} maxLength={max} placeholder={placeholder} aria-label={placeholder} autoComplete="off" onChange={(e) => setText(e.target.value)} />
      <button type="submit" className="btn-primary shrink-0">
        {button}
      </button>
    </form>
  );
}

function Doodle({ view, x, myId, send, now }: PadProps) {
  const name = useNames(view);
  if (x.drawer === myId) {
    return (
      <>
        <div className="mb-2 text-sm text-white/70">
          Draw this (no letters!): <span className="text-xl font-black text-gold">{x.word}</span>
        </div>
        <DrawingPad width={DOODLE_CANVAS.w} height={DOODLE_CANVAS.h} multiColor placeholder="Draw here" onChange={(d) => void send({ ink: compactDrawing(d) })} />
        <TimeLeft endsAt={x.endsAt} now={now} />
      </>
    );
  }
  return (
    <>
      <div className="mb-2 text-sm text-white/70">
        {name(x.drawer)} is drawing a word with {x.letters} letters. What is it?
      </div>
      <div className="mb-2 overflow-hidden rounded-xl border border-white/20 bg-[var(--board-deep)]" style={{ aspectRatio: `${DOODLE_CANVAS.w} / ${DOODLE_CANVAS.h}` }}>
        <Ink drawing={x.ink ?? { v: 1, ...DOODLE_CANVAS, strokes: [] }} className="h-full w-full" title="The drawing so far" />
      </div>
      <TextBox placeholder="Your guess" button="Guess" max={30} onSend={(text) => void send({ text })} />
      <TimeLeft endsAt={x.endsAt} now={now} />
    </>
  );
}

/** Shared by Caption vote and the second half of Doodle chain. */
function WriteVotePad({ x, send, now }: PadProps) {
  if (x.stage === "write") {
    return (
      <>
        <div className="mb-2 text-base font-semibold">{x.prompt}</div>
        <TextBox placeholder="Your answer" button={x.mine?.wrote ? "Change" : "Send"} max={60} keep onSend={(text) => void send({ text })} />
        <div className="mt-2 text-xs text-white/50">{x.mine?.wrote ? "Sent! You can change it until time runs out." : "Nobody sees who wrote what until the end."}</div>
        <TimeLeft endsAt={x.endsAt} now={now} />
      </>
    );
  }
  return (
    <>
      <div className="mb-2 text-sm text-white/70">{x.prompt}: vote for your favourite</div>
      <div className="flex flex-col gap-2">
        {(x.options ?? []).map((o, i) => (
          <button key={i} type="button" disabled={i === x.mine?.own} className={choice} onClick={() => void send({ pick: i })}>
            {o.text} {i === x.mine?.own && <span className="text-xs font-normal text-white/50">(yours)</span>}
          </button>
        ))}
      </div>
      <div className="mt-2 text-xs text-white/50">{x.mine?.voted ? "Vote counted. Tap another to change it." : "Tap one to vote."}</div>
      <TimeLeft endsAt={x.endsAt} now={now} />
    </>
  );
}

function Chain(props: PadProps) {
  const { view, x, myId, send, now } = props;
  const name = useNames(view);
  if (x.stage !== "draw") return <WriteVotePad {...props} />;
  if (x.drawer === myId) {
    return (
      <>
        <div className="mb-2 text-base font-black text-gold">Your turn! Add something to the drawing.</div>
        {/* A fresh pad each turn, starting from what is already there. */}
        <DrawingPad key={x.turn} width={DOODLE_CANVAS.w} height={DOODLE_CANVAS.h} multiColor initial={x.ink} onChange={(d) => void send({ ink: compactDrawing(d) })} />
        <TimeLeft endsAt={x.endsAt} now={now} />
      </>
    );
  }
  return (
    <>
      <div className="mb-2 text-sm text-white/70">
        {name(x.drawer)} is adding to the drawing (turn {x.turn} of {x.wrote}). You name it at the end.
      </div>
      <div className="overflow-hidden rounded-xl border border-white/20 bg-[var(--board-deep)]" style={{ aspectRatio: `${DOODLE_CANVAS.w} / ${DOODLE_CANVAS.h}` }}>
        <Ink drawing={x.ink ?? { v: 1, ...DOODLE_CANVAS, strokes: [] }} className="h-full w-full" title="The drawing so far" />
      </div>
    </>
  );
}

function Likely({ view, x, send, now }: PadProps) {
  return (
    <>
      <div className="mb-2 text-base font-semibold">{x.prompt}…</div>
      <PigGrid view={view} ids={x.alive ?? []} chosen={x.mine?.target} onPick={(p) => void send({ target: p })} />
      <div className="mt-2 text-xs text-white/50">{x.mine?.target ? "Vote counted. Tap another pig to change it." : "Tap a pig to vote."}</div>
      <TimeLeft endsAt={x.endsAt} now={now} />
    </>
  );
}

function Guess({ x, send, now }: PadProps) {
  const [text, setText] = useState("");
  if (x.mine?.value !== undefined) {
    return (
      <div className="py-3">
        <div className="text-sm text-white/70">You guessed</div>
        <div className="money text-5xl">{x.mine.value}</div>
        <div className="text-xs text-white/50">Waiting for the others…</div>
      </div>
    );
  }
  const n = Number(text);
  const ok = text.trim() !== "" && Number.isInteger(n) && n >= 0 && n <= 10_000_000;
  return (
    <>
      <div className="mb-2 text-base font-semibold">
        {x.prompt} {x.unit && <span className="font-normal text-white/60">(in {x.unit})</span>}
      </div>
      <form
        className="flex gap-2"
        onSubmit={(e) => {
          e.preventDefault();
          if (ok) void send({ pick: n });
        }}
      >
        <input className="input min-w-0 flex-1 text-center text-2xl" inputMode="numeric" pattern="[0-9]*" value={text} placeholder="A whole number" aria-label="Your guess" onChange={(e) => setText(e.target.value.replace(/[^0-9]/g, "").slice(0, 8))} />
        <button type="submit" className="btn-primary shrink-0" disabled={!ok}>
          Lock in
        </button>
      </form>
      <div className="mt-2 text-xs text-white/50">One guess. Closest wins.</div>
      <TimeLeft endsAt={x.endsAt} now={now} />
    </>
  );
}

function Split({ x, send, now }: PadProps) {
  const mine = x.mine?.side;
  return (
    <>
      <div className="mb-1 text-base font-semibold">{x.prompt}</div>
      <div className="mb-2 text-xs text-white/60">Pick what you think MOST of the room will pick.</div>
      <div className="grid grid-cols-2 gap-2">
        {(x.sideNames ?? ["A", "B"]).map((label, i) => (
          <button key={i} type="button" disabled={mine !== undefined} className={`${big} !text-xl ${i === 0 ? "bg-[#ff7ad9]" : "bg-[#7bdff2]"} text-black ${mine === i ? "ring-4 ring-white" : ""}`} onClick={() => void send({ pick: i })}>
            {label}
          </button>
        ))}
      </div>
      <TimeLeft endsAt={x.endsAt} now={now} />
    </>
  );
}

/** Which colour of the pattern is lit right now (-1 for none). */
export function litColor(x: MiniX, now: number): number {
  if (x.stage !== "show" || !x.seq || x.shownAt === undefined) return -1;
  const t = now - x.shownAt - 500;
  const i = Math.floor(t / 650);
  return t >= 0 && i < x.seq.length && t - i * 650 < 450 ? x.seq[i] : -1;
}

function Pattern({ x, myId, send, now }: PadProps) {
  useTick(60, x.stage === "show");
  const [flash, setFlash] = useState(-1);
  if (x.gone?.includes(myId)) return <Status emoji="🙃" title="Wrong colour. You're out!" sub="Watch the big screen." />;
  const lit = x.stage === "show" ? litColor(x, now()) : flash;
  const len = x.seq?.length ?? 0;
  return (
    <>
      <div className="mb-2 text-sm text-white/70">
        {x.stage === "show" ? `Watch: ${len} colours…` : x.mine?.finished ? "Got it! Waiting for the others…" : `Your turn: ${x.mine?.at ?? 0} of ${len}`}
      </div>
      <div className="grid grid-cols-2 gap-2">
        {PATTERN_COLORS.map((c, i) => (
          <button
            key={c}
            type="button"
            aria-label={`Colour ${i + 1}`}
            disabled={x.stage !== "input" || x.mine?.finished}
            className="aspect-[3/2] rounded-2xl transition-[opacity,transform] duration-75 active:scale-95 disabled:cursor-default"
            style={{ background: c, opacity: lit === i ? 1 : x.stage === "input" && !x.mine?.finished ? 0.7 : 0.25, touchAction: "manipulation" }}
            onPointerDown={() => {
              if (x.stage !== "input" || x.mine?.finished) return;
              setFlash(i);
              setTimeout(() => setFlash(-1), 150);
              void send({ pick: i });
            }}
          />
        ))}
      </div>
      {x.stage === "input" && <TimeLeft endsAt={x.endsAt} now={now} />}
    </>
  );
}

const ARROWS = ["▲", "▶", "▼", "◀"];
function Maze({ view, x, myId, send }: PadProps) {
  const held = useRef<number | null>(null);
  const tilt = useRef<number | null>(null);
  const [tilting, setTilting] = useState(false);
  const [tiltError, setTiltError] = useState<string | null>(null);
  useEffect(() => {
    const t = setInterval(() => {
      const dir = held.current ?? tilt.current;
      if (dir !== null) void send({ dir });
    }, 130);
    return () => clearInterval(t);
  }, [send]);
  useEffect(() => {
    if (!tilting) return;
    let base: { b: number; g: number } | null = null;
    const on = (e: DeviceOrientationEvent) => {
      if (e.beta === null || e.gamma === null) return;
      base ??= { b: e.beta, g: e.gamma }; // however the phone is held when tilt is switched on counts as level
      const dx = e.gamma - base.g;
      const dy = e.beta - base.b;
      tilt.current = Math.max(Math.abs(dx), Math.abs(dy)) < 12 ? null : Math.abs(dx) > Math.abs(dy) ? (dx > 0 ? 1 : 3) : dy > 0 ? 2 : 0;
    };
    window.addEventListener("deviceorientation", on);
    return () => {
      window.removeEventListener("deviceorientation", on);
      tilt.current = null;
    };
  }, [tilting]);
  const startTilt = async () => {
    if (tilting) return setTilting(false);
    try {
      // iPhones ask before a page may read the motion sensors.
      const ask = (DeviceOrientationEvent as unknown as { requestPermission?: () => Promise<string> }).requestPermission;
      if (typeof ask === "function" && (await ask()) !== "granted") return setTiltError("Tilt was not allowed. Use the arrows.");
      setTiltError(null);
      setTilting(true);
    } catch {
      setTiltError("Tilt is not available on this device. Use the arrows.");
    }
  };
  const key = (dir: number) => (
    <button
      type="button"
      aria-label={["Up", "Right", "Down", "Left"][dir]}
      className="grid h-14 w-14 place-items-center rounded-xl bg-gold text-2xl font-black text-black active:scale-95"
      style={{ touchAction: "none" }}
      onPointerDown={() => {
        held.current = dir;
        void send({ dir });
      }}
      onPointerUp={() => (held.current = null)}
      onPointerLeave={() => (held.current = null)}
      onPointerCancel={() => (held.current = null)}
    >
      {ARROWS[dir]}
    </button>
  );
  return (
    <>
      <MazeView x={x} view={view} me={myId} className="mb-2 w-full" />
      <div className="mx-auto grid w-fit grid-cols-3 gap-1">
        <span />
        {key(0)}
        <span />
        {key(3)}
        {key(2)}
        {key(1)}
      </div>
      <button type="button" className="btn-ghost mt-2 w-full !py-2 text-sm" onClick={() => void startTilt()}>
        {tilting ? "📱 Tilt is on (tap to turn off)" : "📱 Steer by tilting instead"}
      </button>
      {tiltError && <div className="mt-1 text-xs text-red-300">{tiltError}</div>}
    </>
  );
}

const PADS: Partial<Record<MiniRound["kind"], (p: PadProps) => React.ReactNode>> = {
  potato: Potato,
  mud: Mud,
  sumo: Sumo,
  doodle: Doodle,
  chain: Chain,
  caption: WriteVotePad,
  likely: Likely,
  guess: Guess,
  split: Split,
  pattern: Pattern,
  maze: Maze,
};

/** The phone side of the bigger lobby games, while a round is running. */
export function PartyPad(props: PadProps) {
  const Pad = PADS[props.round.kind];
  return Pad ? <Pad {...props} /> : null;
}
