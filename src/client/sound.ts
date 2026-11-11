"use client";

/**
 * All game audio is synthesised live with the Web Audio API. Every sound and
 * the "think" music are original compositions, so there are no licensing
 * concerns and nothing to download. (Deliberately NOT the TV show's theme.)
 */

export interface SoundSettings {
  master: number;
  muted: boolean;
  music: boolean;
  sfx: boolean;
}

type Bus = "sfx" | "music";

class SoundEngine {
  ctx: AudioContext | null = null;
  private master!: GainNode;
  private buses!: Record<Bus, GainNode>;
  private musicNodes: AudioScheduledSourceNode[] = [];
  private musicStop: (() => void) | null = null;
  private noiseBuf: AudioBuffer | null = null;
  settings: SoundSettings = { master: 0.8, muted: false, music: true, sfx: true };

  get unlocked() {
    return this.ctx?.state === "running";
  }

  /** Must be called from a user gesture (browser autoplay rules). */
  async unlock(): Promise<boolean> {
    if (!this.ctx) {
      const Ctx = window.AudioContext ?? (window as unknown as { webkitAudioContext: typeof AudioContext }).webkitAudioContext;
      if (!Ctx) return false;
      this.ctx = new Ctx();
      this.master = this.ctx.createGain();
      const comp = this.ctx.createDynamicsCompressor();
      comp.threshold.value = -12;
      this.master.connect(comp).connect(this.ctx.destination);
      this.buses = { sfx: this.ctx.createGain(), music: this.ctx.createGain() };
      this.buses.sfx.connect(this.master);
      this.buses.music.connect(this.master);
      this.apply(this.settings);
    }
    if (this.ctx.state !== "running") await this.ctx.resume().catch(() => {});
    return this.ctx.state === "running";
  }

  apply(s: SoundSettings) {
    this.settings = s;
    if (!this.ctx) return;
    const t = this.ctx.currentTime;
    this.master.gain.setTargetAtTime(s.muted ? 0 : s.master, t, 0.03);
    this.buses.sfx.gain.setTargetAtTime(s.sfx ? 1 : 0, t, 0.03);
    this.buses.music.gain.setTargetAtTime(s.music ? 0.7 : 0, t, 0.03);
  }

  // ------------------------------------------------------------ primitives

  private tone(freq: number, start: number, dur: number, opts: { type?: OscillatorType; gain?: number; bus?: Bus; attack?: number; release?: number; glideTo?: number; detune?: number } = {}) {
    const ctx = this.ctx!;
    const osc = ctx.createOscillator();
    const g = ctx.createGain();
    osc.type = opts.type ?? "sine";
    osc.frequency.setValueAtTime(freq, start);
    if (opts.glideTo) osc.frequency.exponentialRampToValueAtTime(opts.glideTo, start + dur);
    if (opts.detune) osc.detune.value = opts.detune;
    const peak = opts.gain ?? 0.3;
    const a = opts.attack ?? 0.01;
    const r = opts.release ?? Math.min(0.3, dur * 0.6);
    g.gain.setValueAtTime(0.0001, start);
    g.gain.exponentialRampToValueAtTime(peak, start + a);
    g.gain.setValueAtTime(peak, start + Math.max(a, dur - r));
    g.gain.exponentialRampToValueAtTime(0.0001, start + dur);
    osc.connect(g).connect(this.buses[opts.bus ?? "sfx"]);
    osc.start(start);
    osc.stop(start + dur + 0.05);
    if (opts.bus === "music") this.musicNodes.push(osc);
    return osc;
  }

  private noise(start: number, dur: number, opts: { gain?: number; filter?: BiquadFilterType; freq?: number; q?: number; bus?: Bus; attack?: number; freqTo?: number } = {}) {
    const ctx = this.ctx!;
    if (!this.noiseBuf) {
      this.noiseBuf = ctx.createBuffer(1, ctx.sampleRate * 2, ctx.sampleRate);
      const data = this.noiseBuf.getChannelData(0);
      for (let i = 0; i < data.length; i++) data[i] = Math.random() * 2 - 1;
    }
    const src = ctx.createBufferSource();
    src.buffer = this.noiseBuf;
    src.loop = true;
    const f = ctx.createBiquadFilter();
    f.type = opts.filter ?? "bandpass";
    f.frequency.setValueAtTime(opts.freq ?? 1000, start);
    if (opts.freqTo) f.frequency.exponentialRampToValueAtTime(opts.freqTo, start + dur);
    f.Q.value = opts.q ?? 1;
    const g = ctx.createGain();
    const peak = opts.gain ?? 0.3;
    g.gain.setValueAtTime(0.0001, start);
    g.gain.exponentialRampToValueAtTime(peak, start + (opts.attack ?? 0.005));
    g.gain.exponentialRampToValueAtTime(0.0001, start + dur);
    src.connect(f).connect(g).connect(this.buses[opts.bus ?? "sfx"]);
    src.start(start, Math.random());
    src.stop(start + dur + 0.05);
    if (opts.bus === "music") this.musicNodes.push(src);
  }

  private chord(freqs: number[], start: number, dur: number, opts: Parameters<SoundEngine["tone"]>[3] = {}) {
    freqs.forEach((f) => this.tone(f, start, dur, { ...opts, gain: (opts.gain ?? 0.3) / Math.sqrt(freqs.length) }));
  }

  // ------------------------------------------------------------------ cues

  play(cue: string, arg?: number) {
    if (!this.ctx || this.ctx.state !== "running") return;
    const t = this.ctx.currentTime + 0.01;
    const n = (semi: number) => 440 * Math.pow(2, (semi - 9) / 12); // semitones from C4
    switch (cue) {
      case "boardFill":
        for (let i = 0; i < 14; i++) this.tone(n(12 + ((i * 7) % 24)), t + i * 0.045, 0.18, { type: "triangle", gain: 0.12 });
        break;
      case "clueOpen":
        this.noise(t, 0.35, { filter: "bandpass", freq: 400, freqTo: 3000, q: 2, gain: 0.12 });
        this.tone(n(7), t + 0.05, 0.25, { type: "triangle", gain: 0.15, glideTo: n(19) });
        break;
      case "dailyDouble":
        this.noise(t, 0.8, { filter: "bandpass", freq: 200, freqTo: 5000, q: 3, gain: 0.2 });
        [0, 4, 7, 12].forEach((s, i) => this.tone(n(s + 12), t + 0.25 + i * 0.09, 0.9 - i * 0.09, { type: "sawtooth", gain: 0.09 }));
        this.chord([n(12), n(16), n(19), n(24)], t + 0.7, 1.2, { type: "square", gain: 0.12, release: 0.8 });
        break;
      case "buzz": {
        const steps = [0, 3, 5, 7, 10, 12, 15, 17, 19, 22, 24, 27];
        const f = n(7 + steps[(arg ?? 0) % steps.length]);
        this.tone(f, t, 0.32, { type: "square", gain: 0.18 });
        this.tone(f * 1.5, t, 0.32, { type: "sine", gain: 0.1 });
        break;
      }
      case "correct":
        this.tone(n(19), t, 0.18, { type: "triangle", gain: 0.25 });
        this.tone(n(24), t + 0.12, 0.45, { type: "triangle", gain: 0.25 });
        this.tone(n(28), t + 0.12, 0.45, { type: "sine", gain: 0.12 });
        break;
      case "incorrect":
        this.tone(n(-5), t, 0.5, { type: "sawtooth", gain: 0.16, glideTo: n(-10) });
        this.tone(n(-4.5), t, 0.5, { type: "sawtooth", gain: 0.12, glideTo: n(-9.5) });
        break;
      case "timesUp":
        [0, 0.18, 0.36].forEach((d) => this.tone(n(12), t + d, 0.1, { type: "square", gain: 0.14 }));
        this.tone(n(0), t + 0.6, 0.8, { type: "square", gain: 0.16 });
        break;
      case "reveal":
        this.tone(n(24), t, 0.6, { type: "sine", gain: 0.12 });
        this.tone(n(31), t + 0.08, 0.6, { type: "sine", gain: 0.08 });
        break;
      case "roundTransition":
        [[0, 4, 7], [5, 9, 12], [7, 11, 14], [12, 16, 19]].forEach((c, i) =>
          this.chord(c.map((s) => n(s)), t + i * 0.28, i === 3 ? 1.0 : 0.3, { type: "sawtooth", gain: 0.14, release: 0.15 }),
        );
        break;
      case "finalStart":
        this.chord([n(-3), n(0), n(4)], t, 1.4, { type: "triangle", gain: 0.2, attack: 0.3, release: 0.6 });
        this.chord([n(2), n(5), n(9)], t + 1.2, 1.6, { type: "triangle", gain: 0.2, attack: 0.3, release: 0.8 });
        break;
      case "think":
        this.startThinkMusic();
        break;
      case "thinkStop":
        this.stopMusic();
        break;
      case "finalReveal":
        this.noise(t, 0.4, { filter: "highpass", freq: 3000, gain: 0.06 });
        this.tone(n(17), t, 0.5, { type: "triangle", gain: 0.15 });
        break;
      case "finalWager":
        for (let i = 0; i < 6; i++) this.tone(n(24 + i * 2), t + i * 0.05, 0.12, { type: "square", gain: 0.07 });
        this.tone(n(36), t + 0.32, 0.4, { type: "triangle", gain: 0.15 });
        break;
      case "join":
        this.tone(n(12 + ((arg ?? 0) % 5) * 2), t, 0.12, { type: "sine", gain: 0.2, glideTo: n(24) });
        this.tone(n(24), t + 0.08, 0.2, { type: "triangle", gain: 0.12 });
        break;
      case "gameOver":
      case "fanfare":
        this.fanfare(t);
        break;
      case "announce":
        this.tone(n(19), t, 0.25, { type: "sine", gain: 0.15 });
        this.tone(n(24), t + 0.15, 0.4, { type: "sine", gain: 0.15 });
        break;
      case "tick":
        this.noise(t, 0.03, { filter: "highpass", freq: 4000, gain: 0.12 });
        break;
      // ---------------- soundboard
      case "applause":
        for (let i = 0; i < 120; i++) this.noise(t + Math.random() * 3, 0.03 + Math.random() * 0.04, { filter: "bandpass", freq: 1500 + Math.random() * 2500, q: 1.5, gain: 0.05 + Math.random() * 0.08 });
        this.noise(t, 3.2, { filter: "bandpass", freq: 2000, q: 0.5, gain: 0.06, attack: 0.4 });
        break;
      case "boo":
        for (let v = 0; v < 5; v++) {
          const base = 110 + v * 18 + Math.random() * 10;
          this.tone(base, t + v * 0.05, 1.6, { type: "sawtooth", gain: 0.05, glideTo: base * 0.75, attack: 0.15, release: 0.5 });
        }
        this.noise(t, 1.6, { filter: "lowpass", freq: 500, gain: 0.08, attack: 0.15 });
        break;
      case "drumroll":
        for (let i = 0; i < 48; i++) this.noise(t + i * 0.045, 0.06, { filter: "bandpass", freq: 1800, q: 0.8, gain: 0.05 + (i / 48) * 0.12 });
        this.noise(t + 2.2, 1.5, { filter: "highpass", freq: 5000, gain: 0.25 });
        this.tone(60, t + 2.2, 0.4, { type: "sine", gain: 0.4, glideTo: 40 });
        break;
      case "timer":
        for (let i = 0; i < 5; i++) {
          this.noise(t + i, 0.03, { filter: "highpass", freq: 4000, gain: 0.15 });
          this.tone(i % 2 ? 1200 : 900, t + i, 0.05, { type: "square", gain: 0.06 });
        }
        this.play("timesUp");
        break;
      case "ding":
        this.tone(n(31), t, 1.4, { type: "sine", gain: 0.25, release: 1.2 });
        this.tone(n(31) * 2.76, t, 0.6, { type: "sine", gain: 0.05, release: 0.5 });
        break;
      case "buzzer":
        this.tone(n(-12), t, 0.9, { type: "square", gain: 0.18 });
        this.tone(n(-11), t, 0.9, { type: "sawtooth", gain: 0.12 });
        break;
      case "laugh":
        for (let i = 0; i < 6; i++) {
          const f = 280 - i * 12;
          this.tone(f, t + i * 0.16, 0.12, { type: "sawtooth", gain: 0.08, glideTo: f * 0.85 });
          this.noise(t + i * 0.16, 0.12, { filter: "bandpass", freq: 900, q: 3, gain: 0.05 });
        }
        break;
    }
  }

  private fanfare(t: number) {
    const n = (s: number) => 440 * Math.pow(2, (s - 9) / 12);
    // An original rising brass figure: G–C–E–G, then a held C major chord with a sparkle run.
    const notes: [number, number, number][] = [
      [7, 0, 0.16], [7, 0.18, 0.1], [12, 0.3, 0.16], [16, 0.48, 0.16], [19, 0.66, 0.5], [16, 1.18, 0.16], [19, 1.36, 0.9],
    ];
    for (const [s, d, len] of notes) {
      this.tone(n(s + 12), t + d, len, { type: "sawtooth", gain: 0.12 });
      this.tone(n(s), t + d, len, { type: "square", gain: 0.07 });
    }
    this.chord([n(12), n(16), n(19), n(24)], t + 2.2, 1.8, { type: "sawtooth", gain: 0.18, attack: 0.05, release: 1.2 });
    for (let i = 0; i < 10; i++) this.tone(n(24 + i * 2), t + 2.25 + i * 0.05, 0.25, { type: "triangle", gain: 0.06 });
    this.tone(n(-12), t + 2.2, 1.8, { type: "sine", gain: 0.25, release: 1.2 });
  }

  /**
   * ~30 s original "thinking" loop: a gentle pentatonic arpeggio over an
   * Am–F–C–G progression at 96 BPM with a ticking clock. Not based on any
   * existing theme.
   */
  startThinkMusic(seconds = 30) {
    if (!this.ctx) return;
    this.stopMusic();
    const ctx = this.ctx;
    const n = (s: number) => 440 * Math.pow(2, (s - 9) / 12);
    const t0 = ctx.currentTime + 0.05;
    const beat = 60 / 96;
    const bars = Math.ceil(seconds / (beat * 4));
    const prog = [
      { root: -3, tones: [-3, 0, 4, 9] }, // Am
      { root: -7, tones: [-7, -3, 0, 5] }, // F
      { root: 0, tones: [0, 4, 7, 12] }, // C
      { root: -5, tones: [-5, -1, 2, 7] }, // G
    ];
    const melody = [12, 16, 14, 9, 12, 7, 9, 4, 12, 14, 16, 19, 16, 14, 12, 7];
    for (let bar = 0; bar < bars; bar++) {
      const chord = prog[bar % 4];
      const bt = t0 + bar * beat * 4;
      // pad
      chord.tones.forEach((s) => this.tone(n(s), bt, beat * 4, { type: "triangle", gain: 0.035, bus: "music", attack: 0.2, release: 0.6 }));
      // bass
      this.tone(n(chord.root - 12), bt, beat * 1.8, { type: "sine", gain: 0.14, bus: "music" });
      this.tone(n(chord.root - 12), bt + beat * 2, beat * 1.8, { type: "sine", gain: 0.12, bus: "music" });
      // arpeggio (8ths)
      for (let i = 0; i < 8; i++) {
        const s = chord.tones[(i * 3) % 4] + 12;
        this.tone(n(s), bt + i * beat * 0.5, beat * 0.45, { type: "sine", gain: 0.05, bus: "music" });
      }
      // melody, 4 notes per bar, resting every 4th bar
      if (bar % 4 !== 3) {
        for (let i = 0; i < 4; i++) {
          const s = melody[(bar * 4 + i) % melody.length];
          this.tone(n(s + 12), bt + i * beat, beat * 0.9, { type: "square", gain: 0.035, bus: "music", attack: 0.02 });
        }
      }
      // clock tick each beat
      for (let i = 0; i < 4; i++) this.noise(bt + i * beat, 0.025, { filter: "highpass", freq: 5000, gain: 0.05, bus: "music" });
    }
    // closing "time" chime
    const end = t0 + seconds;
    this.tone(n(12), end, 1.2, { type: "triangle", gain: 0.15, bus: "music", release: 1 });
    this.tone(n(19), end, 1.2, { type: "triangle", gain: 0.1, bus: "music", release: 1 });
    const timer = setTimeout(() => (this.musicNodes = []), (seconds + 2) * 1000);
    this.musicStop = () => clearTimeout(timer);
  }

  stopMusic() {
    if (!this.ctx) return;
    const now = this.ctx.currentTime;
    for (const node of this.musicNodes) {
      try {
        node.stop(now + 0.05);
      } catch {}
    }
    this.musicNodes = [];
    this.musicStop?.();
    this.musicStop = null;
  }
}

let engine: SoundEngine | null = null;
export function sound(): SoundEngine {
  return (engine ??= new SoundEngine());
}
