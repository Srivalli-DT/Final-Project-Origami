import { memo, useCallback, useEffect, useMemo, useRef, useState } from "react";
import type { Fold, Guide, Narration } from "../types";
import CPView from "./CPView";
import DifficultyBadge from "./DifficultyBadge";
import FoldScene from "./FoldScene";
import {
  STEP_DURATION,
  USE_LERP,
  piecesForStep,
  prepareCollapse,
  type Piece,
} from "../fold/animate";
import { narrate } from "../api";
import { canExportVideo, downloadBlob, recordGuide } from "../fold/export";
import { useToasts } from "../store";

const HOLD_SECONDS = 0.7;

const KIND_LABEL: Record<string, string> = {
  reference: "Reference",
  precrease: "Precrease",
  collapse: "Collapse",
  assembly: "Assembly",
};

interface Props {
  title: string;
  /** Used for download filenames. */
  slug: string;
  description?: string;
  fold: Fold;
  guide: Guide;
  actions?: React.ReactNode;
}

const MemoCP = memo(CPView);

export default function Player({ title, slug, description, fold, guide, actions }: Props) {
  const steps = guide.steps;
  const [idx, setIdx] = useState(0);
  const [t, setT] = useState(0);
  const [playing, setPlaying] = useState(false);
  const [done, setDone] = useState<Set<number>>(new Set());
  const [stuck, setStuck] = useState<Narration | null>(null);
  const [stuckLoading, setStuckLoading] = useState(false);
  const [narration, setNarration] = useState<Narration | null>(null);
  const [readAloud, setReadAloud] = useState(false);
  const canvasRef = useRef<HTMLCanvasElement>(null);
  const [exporting, setExporting] = useState<number | null>(null);
  const toast = useToasts((s) => s.push);

  const step = steps[idx];
  const collapse = useMemo(() => prepareCollapse(fold, guide), [fold, guide]);

  // ---- pieces, cached per (step, t) because every mesh asks each frame
  const tRef = useRef(t);
  tRef.current = t;
  const cache = useRef<{ key: string; pieces: Piece[] }>({ key: "", pieces: [] });
  const getPieces = useCallback(() => {
    const key = `${idx}:${tRef.current}`;
    if (cache.current.key !== key && step) {
      cache.current = { key, pieces: piecesForStep(fold, guide, collapse, step, tRef.current) };
    }
    return cache.current.pieces;
  }, [idx, fold, guide, collapse, step]);

  // ---- playback
  useEffect(() => {
    if (!playing) return;
    let raf = 0;
    let last = performance.now();
    let hold = 0;
    const tick = (now: number) => {
      const dt = (now - last) / 1000;
      last = now;
      let next = tRef.current + dt / STEP_DURATION;
      if (next >= 1) {
        next = 1;
        hold += dt;
        if (hold >= HOLD_SECONDS) {
          hold = 0;
          if (idx < steps.length - 1) {
            setIdx((i) => i + 1);
            setT(0);
            return; // effect restarts for the new step
          }
          setPlaying(false);
        }
      }
      setT(next);
      raf = requestAnimationFrame(tick);
    };
    raf = requestAnimationFrame(tick);
    return () => cancelAnimationFrame(raf);
  }, [playing, idx, steps.length]);

  // ---- narration for the current step
  useEffect(() => {
    setStuck(null);
    setNarration(null);
    if (!step) return;
    let alive = true;
    narrate(step, "normal").then((n) => alive && setNarration(n));
    return () => {
      alive = false;
    };
  }, [step]);

  const spokenText = stuck?.text ?? narration?.text ?? step?.text ?? "";
  useEffect(() => {
    if (!readAloud || !("speechSynthesis" in window) || !spokenText) return;
    window.speechSynthesis.cancel();
    window.speechSynthesis.speak(new SpeechSynthesisUtterance(spokenText));
    return () => window.speechSynthesis.cancel();
  }, [readAloud, spokenText]);

  const go = (i: number) => {
    setIdx(Math.max(0, Math.min(steps.length - 1, i)));
    setT(0);
  };

  const onStuck = async () => {
    setStuckLoading(true);
    try {
      setStuck(await narrate(step, "simpler"));
    } finally {
      setStuckLoading(false);
    }
  };

  const exportVideo = async () => {
    if (!canvasRef.current) return;
    setPlaying(false);
    setExporting(0);
    try {
      const texts = await Promise.all(steps.map((s) => narrate(s, "normal").then((n) => n.text)));
      const blob = await recordGuide({
        canvas: canvasRef.current,
        title,
        steps,
        texts,
        drive: (i, tt) => {
          setIdx(i);
          setT(tt);
        },
        onProgress: setExporting,
      });
      downloadBlob(blob, `${slug}-guide.webm`);
    } catch (e) {
      toast(`Video export failed: ${(e as Error).message}`);
    } finally {
      setExporting(null);
    }
  };

  const markDone = () => {
    setDone((d) => new Set(d).add(idx));
    if (idx < steps.length - 1) go(idx + 1);
  };

  if (!step) {
    return <p className="p-8">This crease pattern has no steps.</p>;
  }

  const prevCumulative = idx > 0 ? steps[idx - 1].cumulative_edges : [];
  const progress = ((idx + (step.kind === "collapse" ? t : 1)) / steps.length) * 100;
  const showSimplified = step.kind === "collapse" || step.kind === "assembly";

  return (
    <div className="mx-auto max-w-6xl px-4 py-6">
      {/* top */}
      <div className="flex flex-wrap items-center gap-3">
        <h1 className="font-serif text-2xl sm:text-3xl">{title}</h1>
        <DifficultyBadge d={guide.difficulty} />
        {!guide.validation.ok && (
          <span className="rounded-full bg-rose-100 px-2.5 py-0.5 text-xs text-rose-800">
            Validation failed — the guide may be wrong
          </span>
        )}
        <div className="ml-auto flex gap-2">{actions}</div>
      </div>
      {description && <p className="mt-1 max-w-3xl text-sm text-stone-600">{description}</p>}
      <div className="mt-3 h-2 w-full overflow-hidden rounded-full bg-stone-200" aria-label="progress">
        <div className="h-full bg-accent transition-[width]" style={{ width: `${progress}%` }} />
      </div>

      {/* views */}
      <div className="mt-4 grid gap-4 md:grid-cols-2">
        <div className="rounded-xl border border-stone-200 bg-white p-3 shadow-sm">
          <div className="mb-1 text-xs uppercase tracking-wide text-stone-500">Sequenced crease pattern</div>
          <MemoCP fold={fold} doneEdges={prevCumulative} currentEdges={step.edges} />
          <div className="mt-2 flex flex-wrap gap-3 text-xs text-stone-500">
            <span><span className="font-bold text-[#e53935]">—</span> mountain</span>
            <span><span className="font-bold text-[#1e88e5]">- -</span> valley</span>
            <span><span className="text-stone-400">—</span> already creased</span>
            <span><span className="text-stone-300">···</span> not yet</span>
          </div>
        </div>
        <div className="relative overflow-hidden rounded-xl border border-stone-200 shadow-sm">
          <div className="aspect-square w-full">
            <FoldScene ref={canvasRef} getPieces={getPieces} stepKey={`${idx}`} />
          </div>
          {showSimplified && (
            <span className="absolute left-2 top-2 rounded bg-white/80 px-2 py-0.5 text-xs text-stone-600">
              simplified preview{USE_LERP ? " (interpolated)" : ""} — layers may pass through each other
            </span>
          )}
        </div>
      </div>

      {/* step text + controls */}
      <div className="mt-4 rounded-xl border border-stone-200 bg-white p-4 shadow-sm">
        <div className="flex flex-wrap items-baseline gap-2">
          <span className="text-sm text-stone-500">
            Step {idx + 1} / {steps.length} · {KIND_LABEL[step.kind]}
          </span>
          <h2 className="font-serif text-xl">{step.title}</h2>
        </div>
        <p className="mt-2 text-stone-800">{narration?.text ?? step.text}</p>
        {exporting !== null && (
          <p className="mt-2 text-xs text-stone-500">
            Recording in real time — keep this tab visible until the download starts.
          </p>
        )}
        {narration?.source === "gemini" && (
          <p className="mt-1 text-xs text-stone-400">Narration rewritten by Gemini</p>
        )}
        {stuck && (
          <div className="mt-3 rounded-lg border-l-4 border-amber-400 bg-amber-50 p-3 text-sm">
            <div className="font-medium text-amber-900">Try it this way</div>
            <p className="mt-1 text-amber-900">{stuck.text}</p>
          </div>
        )}

        <div className="mt-4 flex flex-wrap items-center gap-2">
          <button className="btn" onClick={() => go(idx - 1)} disabled={idx === 0}>
            ← Prev
          </button>
          <button
            className="btn btn-primary w-28"
            onClick={() => {
              if (!playing && t >= 1 && idx === steps.length - 1) setT(0);
              setPlaying((p) => !p);
            }}
          >
            {playing ? "❚❚ Pause" : "▶ Play"}
          </button>
          <button className="btn" onClick={() => go(idx + 1)} disabled={idx === steps.length - 1}>
            Next →
          </button>
          <input
            type="range"
            min={0}
            max={1}
            step={0.001}
            value={t}
            onChange={(e) => {
              setPlaying(false);
              setT(parseFloat(e.target.value));
            }}
            className="mx-2 min-w-[120px] flex-1 accent-[#c0392b]"
            aria-label="scrub"
          />
          <button className="btn" onClick={markDone}>
            Done ✓
          </button>
          <button className="btn" onClick={onStuck} disabled={stuckLoading}>
            {stuckLoading ? "Thinking…" : "I'm stuck"}
          </button>
          {canExportVideo() && (
            <button className="btn" onClick={exportVideo} disabled={exporting !== null}>
              {exporting !== null ? `Recording… ${Math.round(exporting * 100)}%` : "Export video"}
            </button>
          )}
          <label className="flex items-center gap-1 text-sm text-stone-600">
            <input type="checkbox" checked={readAloud} onChange={(e) => setReadAloud(e.target.checked)} />
            Read aloud
          </label>
        </div>
      </div>

      {/* step list */}
      <ol className="mt-4 grid gap-2 sm:grid-cols-2 lg:grid-cols-3">
        {steps.map((s, i) => (
          <li key={i}>
            <button
              onClick={() => go(i)}
              className={`w-full rounded-lg border px-3 py-2 text-left text-sm transition ${
                i === idx
                  ? "border-accent bg-rose-50"
                  : "border-stone-200 bg-white hover:border-stone-400"
              }`}
            >
              <span className="mr-2 text-stone-400">{i + 1}.</span>
              {s.title}
              {done.has(i) && <span className="ml-1 text-emerald-600">✓</span>}
            </button>
          </li>
        ))}
      </ol>
    </div>
  );
}
