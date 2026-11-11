/**
 * Stylized, CSS/SVG-only picture of the three synced screens (TV lobby, host controller, phone
 * buzzer) for the public homepage. Purely decorative: the text alternative is the sr-only line.
 */

function Scribble({ d, color, className }: { d: string; color: string; className?: string }) {
  return (
    <svg viewBox="0 0 100 40" className={className} fill="none" stroke={color} strokeWidth={5} strokeLinecap="round" strokeLinejoin="round">
      <path d={d} />
    </svg>
  );
}

const NAMES = [
  { d: "M8 30 C10 8 20 6 22 28 C24 10 34 8 36 28 M46 28 C40 14 58 12 54 28 C52 34 46 32 46 28 M66 10 L66 30 M78 12 C70 20 70 24 80 30 M90 14 L92 30", color: "#f472b6" },
  { d: "M10 12 C8 34 28 34 26 12 M38 30 L38 14 C48 10 52 20 40 22 M62 14 C52 12 52 22 60 22 C68 24 66 32 56 30 M76 10 L76 30 M72 18 L84 18", color: "#34d399" },
  { d: "M10 30 L18 10 L26 30 M13 22 L23 22 M36 12 L36 30 C46 32 50 24 38 22 M60 14 C52 12 50 30 60 30 C66 30 68 24 62 22 M78 10 C74 20 80 24 78 32 M88 12 L88 30", color: "#60a5fa" },
];

export function ScreensMock({ joinHost, className = "" }: { joinHost: string; className?: string }) {
  return (
    <div className={className}>
      <p className="sr-only">
        Illustration: a TV showing a room code and hand-drawn name cards, a tablet with the host&apos;s controls, and a phone showing a large buzzer button.
      </p>
      <div aria-hidden="true" className="flex flex-col items-center gap-4 lg:flex-row lg:items-end lg:justify-center lg:gap-6">
        {/* TV */}
        <div className="w-full max-w-xl lg:flex-1">
          <div className="lobby-bg flex aspect-video flex-col items-center justify-center gap-2 overflow-hidden rounded-xl border-4 border-black p-3 shadow-2xl shadow-black/60 sm:gap-3">
            <div className="text-[10px] font-semibold tracking-wide text-white/80 uppercase sm:text-xs">Join at {joinHost}</div>
            <div className="money text-4xl tracking-[0.25em] sm:text-6xl">PIGS</div>
            <div className="flex gap-2 sm:gap-3">
              {NAMES.map((n) => (
                <div key={n.color} className="flex h-9 w-16 items-center justify-center rounded-md border border-white/20 bg-black/40 px-1 sm:h-12 sm:w-24">
                  <Scribble d={n.d} color={n.color} className="h-full w-full" />
                </div>
              ))}
            </div>
          </div>
          <div className="mx-auto h-2 w-1/4 bg-black" />
          <div className="mx-auto h-1.5 w-2/5 rounded-full bg-black" />
          <div className="mt-2 text-center text-xs font-semibold tracking-wide text-white/60 uppercase">TV display</div>
        </div>

        <div className="flex w-full max-w-xl items-end justify-center gap-4 lg:w-auto lg:gap-6">
          {/* Host tablet */}
          <div className="min-w-0 flex-1 lg:w-64 lg:flex-none">
            <div className="flex aspect-[4/3] flex-col gap-2 rounded-xl border-4 border-black bg-panel p-2.5 shadow-2xl shadow-black/60">
              <div className="flex items-center gap-1.5">
                <span className="h-2 w-2 rounded-full bg-green-500" />
                <span className="h-1.5 w-12 rounded-full bg-white/30" />
                <span className="ml-auto rounded bg-panel-2 px-1.5 py-0.5 text-[9px] font-semibold text-white/80">Undo</span>
              </div>
              <div className="flex flex-1 flex-col justify-center gap-1.5 rounded-md bg-board px-2">
                <span className="h-1.5 w-11/12 rounded-full bg-white/70" />
                <span className="h-1.5 w-3/4 rounded-full bg-white/70" />
                <span className="h-1.5 w-1/2 rounded-full bg-gold/80" />
              </div>
              <div className="grid grid-cols-2 gap-1.5 text-center text-[10px] font-bold">
                <span className="rounded-md bg-green-600 py-1.5 text-white">Correct</span>
                <span className="rounded-md bg-red-600 py-1.5 text-white">Wrong</span>
              </div>
            </div>
            <div className="mt-2 text-center text-xs font-semibold tracking-wide text-white/60 uppercase">Host controls</div>
          </div>

          {/* Player phone */}
          <div className="w-24 flex-none sm:w-28">
            <div className="flex aspect-[9/17] flex-col items-center gap-2 rounded-2xl border-4 border-black bg-ui-bg p-2 shadow-2xl shadow-black/60">
              <span className="h-1 w-8 rounded-full bg-white/20" />
              <Scribble d={NAMES[0].d} color={NAMES[0].color} className="h-6 w-full" />
              <div className="flex flex-1 items-center justify-center">
                <span className="relative flex h-16 w-16 items-center justify-center sm:h-20 sm:w-20">
                  <span className="absolute inset-0 rounded-full bg-gold/40 motion-safe:animate-ping motion-safe:[animation-duration:2.4s]" />
                  <span className="relative flex h-full w-full items-center justify-center rounded-full bg-gold font-[family-name:var(--font-display)] text-sm font-bold text-black shadow-lg sm:text-base">
                    BUZZ
                  </span>
                </span>
              </div>
            </div>
            <div className="mt-2 text-center text-xs font-semibold tracking-wide text-white/60 uppercase">Phone buzzer</div>
          </div>
        </div>
      </div>
    </div>
  );
}
