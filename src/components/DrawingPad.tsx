"use client";

import { useCallback, useEffect, useRef, useState } from "react";
import { BRUSH_SIZES, LIMITS, PALETTE, type Drawing, type Stroke } from "@/shared/strokes";
import { Ink } from "./Ink";

type Tool = "pen" | "eraser";
type Brush = "solid" | "rainbow" | "glow";

interface Props {
  width: number;
  height: number;
  initial?: Drawing | null;
  multiColor: boolean;
  onChange?: (d: Drawing) => void;
  className?: string;
  placeholder?: string;
  disabled?: boolean;
}

/**
 * Finger/stylus handwriting pad. Strokes are recorded as vector points with
 * pressure, each stroke keeps its own colour and size, and the eraser removes
 * whole strokes so the result stays clean stroke data.
 */
export function DrawingPad({ width, height, initial, multiColor, onChange, className, placeholder, disabled }: Props) {
  const [strokes, setStrokes] = useState<Stroke[]>(initial?.strokes ?? []);
  const [undoStack, setUndoStack] = useState<Stroke[][]>([]);
  const [redoStack, setRedoStack] = useState<Stroke[][]>([]);
  const [live, setLive] = useState<Stroke | null>(null);
  const [color, setColor] = useState(PALETTE[0]);
  const [size, setSize] = useState<number>(BRUSH_SIZES.medium);
  const [tool, setTool] = useState<Tool>("pen");
  const [brush, setBrush] = useState<Brush>("solid");
  const svgRef = useRef<HTMLDivElement>(null);
  const drawing = useRef<{ id: number; stroke: Stroke; erasedAny: boolean; before: Stroke[] } | null>(null);
  const strokesRef = useRef(strokes);
  strokesRef.current = strokes;

  const effectiveColor = multiColor ? color : PALETTE[0];
  const effectiveBrush: Brush = multiColor ? brush : "solid";

  const emit = useCallback(
    (next: Stroke[]) => onChange?.({ v: 1, w: width, h: height, strokes: next }),
    [onChange, width, height],
  );

  const commit = useCallback(
    (next: Stroke[], before: Stroke[]) => {
      setUndoStack((u) => [...u.slice(-50), before]);
      setRedoStack([]);
      setStrokes(next);
      emit(next);
    },
    [emit],
  );

  const toLocal = (e: React.PointerEvent): [number, number, number] => {
    const rect = svgRef.current!.getBoundingClientRect();
    // the svg uses "meet" scaling: compute the letterboxed drawing area
    const scale = Math.min(rect.width / width, rect.height / height);
    const ox = (rect.width - width * scale) / 2;
    const oy = (rect.height - height * scale) / 2;
    // A captured pointer keeps reporting after it leaves the pad; keep the point on the canvas
    // (the server rejects coordinates far outside it).
    const onPad = (v: number, max: number) => (Number.isFinite(v) ? Math.max(0, Math.min(max, v)) : 0);
    const x = onPad((e.clientX - rect.left - ox) / scale, width);
    const y = onPad((e.clientY - rect.top - oy) / scale, height);
    const pressure = e.pointerType === "pen" ? Math.max(0.05, Math.min(1, e.pressure || 0.5)) : 0.5;
    return [Math.round(x * 10) / 10, Math.round(y * 10) / 10, pressure];
  };

  const eraseAt = (x: number, y: number, current: Stroke[]): Stroke[] => {
    const r2 = (size * 1.5) ** 2;
    return current.filter((s) => !s.p.some(([px, py]) => (px - x) ** 2 + (py - y) ** 2 < r2 + (s.s / 2) ** 2));
  };

  const totalPoints = (list: Stroke[]) => list.reduce((n, s) => n + s.p.length, 0);

  function onPointerDown(e: React.PointerEvent) {
    if (disabled) return;
    if (drawing.current) return; // ignore extra fingers
    e.preventDefault();
    (e.target as Element).setPointerCapture?.(e.pointerId);
    const pt = toLocal(e);
    if (tool === "eraser") {
      const before = strokesRef.current;
      const next = eraseAt(pt[0], pt[1], before);
      drawing.current = { id: e.pointerId, stroke: { c: "#000000", s: size, p: [pt] }, erasedAny: next.length !== before.length, before };
      if (next.length !== before.length) setStrokes(next);
      return;
    }
    if (strokesRef.current.length >= LIMITS.maxStrokes || totalPoints(strokesRef.current) >= LIMITS.maxTotalPoints) return;
    const stroke: Stroke = {
      c: effectiveBrush === "rainbow" ? "rainbow" : effectiveColor,
      s: size,
      ...(effectiveBrush === "glow" ? { fx: "glow" as const } : {}),
      p: [pt],
    };
    drawing.current = { id: e.pointerId, stroke, erasedAny: false, before: strokesRef.current };
    setLive(stroke);
  }

  function onPointerMove(e: React.PointerEvent) {
    const d = drawing.current;
    if (!d || d.id !== e.pointerId) return;
    e.preventDefault();
    const events = typeof e.nativeEvent.getCoalescedEvents === "function" ? e.nativeEvent.getCoalescedEvents() : [];
    const pts = (events.length ? events.map((ev) => toLocal(ev as unknown as React.PointerEvent)) : [toLocal(e)]);
    if (tool === "eraser") {
      let cur = strokesRef.current;
      for (const p of pts) cur = eraseAt(p[0], p[1], cur);
      if (cur.length !== strokesRef.current.length) {
        d.erasedAny = true;
        setStrokes(cur);
      }
      return;
    }
    if (d.stroke.p.length + pts.length > LIMITS.maxPointsPerStroke) return;
    d.stroke = { ...d.stroke, p: [...d.stroke.p, ...pts] };
    setLive(d.stroke);
  }

  function onPointerUp(e: React.PointerEvent) {
    const d = drawing.current;
    if (!d || d.id !== e.pointerId) return;
    drawing.current = null;
    if (tool === "eraser") {
      if (d.erasedAny) commit(strokesRef.current, d.before);
      return;
    }
    setLive(null);
    commit([...strokesRef.current, d.stroke], d.before);
  }

  function undo() {
    if (!undoStack.length) return;
    const prev = undoStack[undoStack.length - 1];
    setUndoStack(undoStack.slice(0, -1));
    setRedoStack((r) => [...r, strokes]);
    setStrokes(prev);
    emit(prev);
  }
  function redo() {
    if (!redoStack.length) return;
    const next = redoStack[redoStack.length - 1];
    setRedoStack(redoStack.slice(0, -1));
    setUndoStack((u) => [...u, strokes]);
    setStrokes(next);
    emit(next);
  }
  function clear() {
    if (!strokes.length) return;
    commit([], strokes);
  }

  // keyboard undo/redo for stylus + keyboard users
  useEffect(() => {
    const onKey = (e: KeyboardEvent) => {
      if (!(e.metaKey || e.ctrlKey) || e.key.toLowerCase() !== "z") return;
      e.preventDefault();
      if (e.shiftKey) redo();
      else undo();
    };
    window.addEventListener("keydown", onKey);
    return () => window.removeEventListener("keydown", onKey);
  });

  const drawingObj: Drawing = { v: 1, w: width, h: height, strokes };

  return (
    <div className={`flex flex-col gap-2 ${className ?? ""}`}>
      <div
        ref={svgRef}
        className="relative w-full overflow-hidden rounded-xl border-2 border-white/25 bg-[var(--board-deep)] shadow-inner"
        style={{ aspectRatio: `${width} / ${height}`, touchAction: "none" }}
        onPointerDown={onPointerDown}
        onPointerMove={onPointerMove}
        onPointerUp={onPointerUp}
        onPointerCancel={onPointerUp}
      >
        <Ink drawing={drawingObj} live={live} className="pointer-events-none absolute inset-0 h-full w-full" />
        {!strokes.length && !live && placeholder && (
          <div className="pointer-events-none absolute inset-0 grid place-items-center text-lg text-white/40">{placeholder}</div>
        )}
        <div className="pointer-events-none absolute inset-x-6 bottom-[22%] border-b border-dashed border-white/15" />
      </div>

      {multiColor && (
        <div className="flex items-center gap-1 overflow-x-auto p-1" role="radiogroup" aria-label="Colour">
          {PALETTE.map((c) => (
            <button
              key={c}
              type="button"
              aria-label={`Colour ${c}`}
              aria-checked={tool === "pen" && brush !== "rainbow" && color === c}
              role="radio"
              onClick={() => {
                setColor(c);
                setTool("pen");
                if (brush === "rainbow") setBrush("solid");
              }}
              className={`h-7 w-7 shrink-0 rounded-full border-2 transition ${tool === "pen" && brush !== "rainbow" && color === c ? "scale-110 border-white ring-2 ring-white/50" : "border-white/20"}`}
              style={{ background: c }}
            />
          ))}
          <label className="relative h-7 w-7 shrink-0 cursor-pointer overflow-hidden rounded-full border-2 border-white/20" title="Custom colour" style={{ background: "conic-gradient(red, yellow, lime, cyan, blue, magenta, red)" }}>
            <input
              type="color"
              value={color}
              onChange={(e) => {
                setColor(e.target.value);
                setTool("pen");
                if (brush === "rainbow") setBrush("solid");
              }}
              className="absolute inset-0 h-full w-full cursor-pointer opacity-0"
              aria-label="Custom colour"
            />
          </label>
        </div>
      )}
      {/* One row of tools, so the pad and what comes after it fit on a phone screen. */}
      <div className="flex overflow-hidden rounded-lg border border-white/20 bg-white/5 text-sm">
        <SegBtn
          onClick={() => {
            const sizes = Object.values(BRUSH_SIZES) as number[];
            setSize(sizes[(sizes.indexOf(size) + 1) % sizes.length]);
          }}
          label={`Brush size: ${(Object.entries(BRUSH_SIZES) as [string, number][]).find(([, px]) => px === size)?.[0] ?? "medium"} (tap to change)`}
        >
          <span className="inline-block rounded-full bg-white" style={{ width: size / 1.5 + 2, height: size / 1.5 + 2 }} />
        </SegBtn>
        <SegBtn active={tool === "eraser"} onClick={() => setTool(tool === "eraser" ? "pen" : "eraser")} label="Eraser">🧽</SegBtn>
        {multiColor && (
          <>
            <SegBtn active={tool === "pen" && brush === "rainbow"} onClick={() => { setBrush(brush === "rainbow" ? "solid" : "rainbow"); setTool("pen"); }} label="Rainbow brush">🌈</SegBtn>
            <SegBtn active={tool === "pen" && brush === "glow"} onClick={() => { setBrush(brush === "glow" ? "solid" : "glow"); setTool("pen"); }} label="Neon glow">✨</SegBtn>
          </>
        )}
        <SegBtn onClick={undo} disabled={!undoStack.length} label="Undo">↶</SegBtn>
        <SegBtn onClick={clear} disabled={!strokes.length} label="Clear">🗑</SegBtn>
      </div>
    </div>
  );
}

function SegBtn({ children, active, onClick, disabled, label }: { children: React.ReactNode; active?: boolean; onClick: () => void; disabled?: boolean; label: string }) {
  return (
    <button
      type="button"
      title={label}
      aria-label={label}
      aria-pressed={active}
      disabled={disabled}
      onClick={onClick}
      className={`grid h-10 min-w-10 flex-1 place-items-center px-2 transition disabled:opacity-30 ${active ? "bg-white/25" : "hover:bg-white/10"}`}
    >
      {children}
    </button>
  );
}
