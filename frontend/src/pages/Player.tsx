import { memo, useCallback, useEffect, useMemo, useRef, useState } from "react";
import { Link, useNavigate, useParams } from "react-router-dom";
import {
  ArrowDownToLine,
  ArrowUpFromLine,
  Check,
  ChevronLeft,
  ChevronRight,
  CircleHelp,
  Flower,
  FlipHorizontal2,
  Info,
  Lightbulb,
  Pause,
  PenTool,
  Play,
  Repeat,
  RotateCcw,
  RotateCw,
  Send,
  Shrink,
  Sparkles,
  TriangleAlert,
  Undo2,
  Wind,
  CornerDownLeft,
  ArrowDownCircle,
  type LucideIcon,
} from "lucide-react";
import { api, usingMocks } from "../api";
import CreaseSvg, { creaseKey } from "../components/CreaseSvg";
import PaperScene from "../components/PaperScene";
import { IconButton } from "../components/Tip";
import { FOLD_SECONDS, prepareCollapse, stepBounds, stepPieces } from "../fold/animate";
import { useKeys } from "../hooks/useKeys";
import { useReducedMotion } from "../hooks/useReducedMotion";
import { useStudioInbox, useToasts, useUser } from "../store";
import type { Answer, Crease, Fold, Tutorial } from "../types";

const SYMBOLS: Record<string, [LucideIcon, string]> = {
  valley: [ArrowDownToLine, "Valley fold"],
  mountain: [ArrowUpFromLine, "Mountain fold"],
  "fold-unfold": [Undo2, "Fold and unfold"],
  "turn-over": [FlipHorizontal2, "Turn over"],
  rotate: [RotateCw, "Rotate"],
  squash: [Shrink, "Squash"],
  reverse: [CornerDownLeft, "Reverse fold"],
  petal: [Flower, "Petal fold"],
  sink: [ArrowDownCircle, "Sink"],
  inflate: [Wind, "Shape / inflate"],
  repeat: [Repeat, "Repeat"],
};
const OP_WORDS: Record<string, string> = {
  fold: "fold",
  crease: "fold and unfold",
  turn_over: "turn over",
  rotate: "rotate",
  unfold: "unfold",
  collapse: "collapse",
  shape: "3D shaping",
};
const SPEEDS = [0.5, 1, 2];
const HOLD = 0.6;

const MemoCrease = memo(CreaseSvg);

/** Creases as a FOLD in the unit square (rectangles are scaled to fit). */
export function creasesToFold(creases: Crease[], w: number, h: number): Fold {
  const s = 1 / Math.max(w, h);
  const coords: [number, number][] = [];
  const edges: [number, number][] = [];
  const asg: Fold["edges_assignment"] = [];
  for (const c of creases) {
    coords.push([c.a[0] * s, c.a[1] * s], [c.b[0] * s, c.b[1] * s]);
    edges.push([coords.length - 2, coords.length - 1]);
    asg.push(c.assignment);
  }
  return { vertices_coords: coords, edges_vertices: edges, edges_assignment: asg, faces_vertices: [] };
}

export default function Player() {
  const { id = "" } = useParams();
  const navigate = useNavigate();
  const reduced = useReducedMotion();
  const toast = useToasts((s) => s.push);
  const { userId, setProgress, progress } = useUser();
  const sendToStudio = useStudioInbox((s) => s.send);
  const [tut, setTut] = useState<Tutorial | null>(null);
  const [error, setError] = useState<string | null>(null);
  const [idx, setIdx] = useState(0);
  const [t, setT] = useState(0);
  const [playing, setPlaying] = useState(false);
  const [animating, setAnimating] = useState(false);
  const [speed, setSpeed] = useState(1);
  const [info, setInfo] = useState(false);
  const [hoverSync, setHoverSync] = useState(false);
  const [question, setQuestion] = useState("");
  const [answer, setAnswer] = useState<Answer | null>(null);
  const [asking, setAsking] = useState(false);
  const tRef = useRef(0);
  tRef.current = t;

  useEffect(() => {
    setTut(null);
    setError(null);
    setIdx(0);
    setT(0);
    api
      .tutorial(id)
      .then(setTut)
      .catch((e) => setError(String(e.message ?? e)));
  }, [id]);

  const steps = tut?.steps ?? [];
  const step = steps[idx];
  const last = steps.length - 1;

  // resume where the user left off
  useEffect(() => {
    if (!tut || !progress) return;
    const item = progress.items.find((i) => i.tutorial_id === tut.id);
    if (item && !item.completed && item.step_index >= 0 && item.step_index < last) {
      setIdx(item.step_index + 1);
      setT(0);
    }
    // only when the tutorial first loads
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [tut]);

  const collapse = useMemo(
    () => (step?.collapse ? prepareCollapse(step.collapse.fold, step.collapse.face_tree) : null),
    [step],
  );
  const pieces = useMemo(() => (step ? stepPieces(step, t, collapse) : []), [step, t, collapse]);
  const bounds = useMemo(() => (step ? stepBounds(step) : ([0, 0, 1, 1] as [number, number, number, number])), [step]);

  const prevKeys = useMemo(
    () => new Set((idx > 0 ? steps[idx - 1].creases_so_far : []).map(creaseKey)),
    [steps, idx],
  );
  const currentKeys = useMemo(
    () => new Set((step?.creases_so_far ?? []).map(creaseKey).filter((k) => !prevKeys.has(k))),
    [step, prevKeys],
  );

  // ---- animation loop: animate t to 1; when playing, continue to the next step
  useEffect(() => {
    if (!animating || !step) return;
    if (reduced) {
      setT(1);
      setAnimating(false);
      return;
    }
    let raf = 0;
    let lastNow = performance.now();
    let hold = 0;
    const tick = (now: number) => {
      const dt = ((now - lastNow) / 1000) * speed;
      lastNow = now;
      let next = tRef.current + dt / FOLD_SECONDS;
      if (next >= 1) {
        next = 1;
        if (!playing) {
          setT(1);
          setAnimating(false);
          return;
        }
        hold += dt;
        if (hold >= HOLD) {
          if (idx < last) {
            setIdx(idx + 1);
            setT(0);
            return; // effect restarts on the new step
          }
          setPlaying(false);
          setAnimating(false);
        }
      }
      setT(next);
      raf = requestAnimationFrame(tick);
    };
    raf = requestAnimationFrame(tick);
    return () => cancelAnimationFrame(raf);
  }, [animating, playing, idx, last, speed, reduced, step]);

  const go = useCallback(
    (i: number, animate = true) => {
      const n = Math.max(0, Math.min(last, i));
      setIdx(n);
      setAnswer(null);
      setT(reduced || !animate ? 1 : 0);
      setAnimating(!reduced && animate);
    },
    [last, reduced],
  );

  const togglePlay = () => {
    if (playing) {
      setPlaying(false);
      setAnimating(false);
      return;
    }
    if (t >= 1 && idx === last) go(0, false);
    if (t >= 1 && idx < last) {
      setIdx(idx + 1);
      setT(0);
    }
    setPlaying(true);
    setAnimating(true);
  };

  const scrub = (v: number) => {
    setPlaying(false);
    setAnimating(false);
    setT(Math.max(0, Math.min(1, v)));
  };

  useKeys({
    ArrowLeft: () => go(idx - 1),
    ArrowRight: () => go(idx + 1),
    Space: () => (reduced ? go(idx + 1) : togglePlay()),
    "[": () => scrub(tRef.current - 0.05),
    "]": () => scrub(tRef.current + 0.05),
  });

  const markDone = async () => {
    if (!tut || !step) return;
    if (!userId || usingMocks) {
      toast("Add your name to save progress.", "info");
    } else {
      try {
        setProgress(await api.saveProgress(userId, tut.id, idx, idx === last));
      } catch {
        toast("Could not save progress.");
      }
    }
    if (idx < last) go(idx + 1);
    else toast(`${tut.title} complete!`, "info");
  };

  const ask = async (q?: string) => {
    if (!tut) return;
    setAsking(true);
    try {
      setAnswer(await api.ask(tut, idx, q));
    } finally {
      setAsking(false);
    }
  };

  const openInStudio = () => {
    if (!tut || !step) return;
    const final = steps[last].creases_so_far;
    sendToStudio(creasesToFold(final, tut.paper.width, tut.paper.height), tut.title);
    navigate("/studio");
  };

  if (error)
    return (
      <div className="p-6">
        <p className="text-error">Could not load this tutorial: {error}</p>
        <Link to="/library" className="chip mt-3">
          Library
        </Link>
      </div>
    );
  if (!tut || !step) return <p className="p-6 text-muted">Loading…</p>;

  const [SymIcon, symLabel] = SYMBOLS[step.symbol] ?? [Info, step.symbol];
  const sceneLabel = `Step ${idx + 1} of ${steps.length}: ${OP_WORDS[step.op]}${step.check ? `, ${step.check}` : ""}`;
  const done = new Set(progress?.completed ?? []);

  return (
    <div className="flex h-full flex-col">
      {/* header */}
      <div className="flex items-center gap-2 border-b border-line px-3 py-2">
        <Link to="/library" className="icon-btn" aria-label="Back to library">
          <ChevronLeft className="h-4 w-4" aria-hidden />
        </Link>
        <h1 className="truncate text-lg font-semibold">{tut.title}</h1>
        {done.has(tut.id) && <Check className="h-4 w-4 text-success" aria-label="completed" />}
        <span className="mono ml-auto text-sm text-muted">
          {idx + 1}/{steps.length}
        </span>
        <IconButton label="Open in Studio" onClick={openInStudio}>
          <PenTool className="h-4 w-4" aria-hidden />
        </IconButton>
      </div>

      {/* dual viewport */}
      <div className="relative grid min-h-0 flex-1 grid-cols-1 overflow-y-auto md:grid-cols-[2fr_3fr] md:overflow-visible">
        <section aria-label="Crease pattern" className="min-h-[220px] border-b border-line bg-panel p-3 md:border-b-0 md:border-r">
          <MemoCrease
            width={tut.paper.width}
            height={tut.paper.height}
            creases={step.creases_so_far}
            current={currentKeys}
            highlight={hoverSync}
            onHoverCurrent={setHoverSync}
            label={`Crease pattern after step ${idx + 1}: ${step.creases_so_far.length} creases`}
          />
        </section>
        <section aria-label="3D view" className="relative flex min-h-[280px] flex-col">
          <div className="relative h-[320px] md:h-auto md:flex-1">
          <PaperScene
            pieces={pieces}
            bounds={bounds}
            axis={step.op === "fold" || step.op === "crease" ? step.axis : null}
            axisActive={hoverSync}
            onAxisHover={setHoverSync}
            tilt={step.is_shaping}
            label={sceneLabel}
          />
          <div className="pointer-events-none absolute left-2 top-2 flex gap-1.5">
            {step.is_shaping && (
              <span className="rounded-md border border-accent/60 bg-panel/90 px-2 py-0.5 text-xs text-accent">3D shaping</span>
            )}
            {step.approx_layers && (
              <span className="rounded-md border border-line bg-panel/90 px-2 py-0.5 text-xs text-muted">approx. layers</span>
            )}
          </div>
          </div>

          {/* step card */}
          <aside
            aria-label="Step"
            className="panel m-2 bg-panel/95 p-3 backdrop-blur md:absolute md:bottom-2 md:right-2 md:m-0 md:w-[min(22rem,calc(100%-1rem))]"
          >
            <div className="flex items-start gap-2">
              <span className="mono flex h-7 min-w-7 items-center justify-center rounded-md bg-panel2 px-1.5 text-sm text-accent">
                {idx + 1}
              </span>
              <div className="min-w-0 flex-1">
                <h2 className="truncate font-medium">{step.title}</h2>
                <p className="text-sm text-text">{step.instruction}</p>
              </div>
              <span title={symLabel} aria-label={symLabel} role="img" className="text-muted">
                <SymIcon className="h-5 w-5" aria-hidden />
              </span>
            </div>
            {info && (
              <div className="mt-2 space-y-1 border-t border-line pt-2 text-sm">
                {step.tips.map((tip) => (
                  <p key={tip} className="flex gap-1.5">
                    <Lightbulb className="mt-0.5 h-4 w-4 shrink-0 text-accent" aria-label="Tip" />
                    {tip}
                  </p>
                ))}
                {step.mistakes.map((m) => (
                  <p key={m} className="flex gap-1.5">
                    <TriangleAlert className="mt-0.5 h-4 w-4 shrink-0 text-warning" aria-label="Common mistake" />
                    {m}
                  </p>
                ))}
                {step.note && <p className="text-muted">{step.note}</p>}
              </div>
            )}
            {answer && (
              <p className="mt-2 border-t border-line pt-2 text-sm">
                <Sparkles className="mr-1 inline h-3.5 w-3.5 text-accent" aria-label={answer.source === "gemini" ? "AI answer" : "Help"} />
                {answer.text}
              </p>
            )}
            <form
              className="mt-2 flex gap-1.5"
              onSubmit={(e) => {
                e.preventDefault();
                ask(question.trim() || undefined);
              }}
            >
              <input
                value={question}
                onChange={(e) => setQuestion(e.target.value)}
                placeholder="Ask about this step"
                aria-label="Ask about this step"
                maxLength={300}
                className="h-9 min-w-0 flex-1 rounded-lg border border-line bg-panel2 px-2 text-sm placeholder:text-muted focus:border-accent"
              />
              <IconButton label="Ask" onClick={() => ask(question.trim() || undefined)} disabled={asking}>
                <Send className="h-4 w-4" aria-hidden />
              </IconButton>
            </form>
            <div className="mt-2 flex gap-1.5">
              <IconButton label={info ? "Hide tips" : "Tips and mistakes"} pressed={info} onClick={() => setInfo(!info)}>
                <Info className="h-4 w-4" aria-hidden />
              </IconButton>
              <IconButton label="I'm stuck" onClick={() => ask()} disabled={asking}>
                <CircleHelp className="h-4 w-4" aria-hidden />
              </IconButton>
              <button type="button" className="btn-accent ml-auto" onClick={markDone}>
                <Check className="h-4 w-4" aria-hidden />
                Done
              </button>
            </div>
          </aside>
        </section>
      </div>

      {/* controls */}
      <div className="flex flex-wrap items-center gap-2 border-t border-line bg-panel px-3 py-2">
        <IconButton label="Previous step" shortcut="←" onClick={() => go(idx - 1)} disabled={idx === 0}>
          <ChevronLeft className="h-4 w-4" aria-hidden />
        </IconButton>
        <IconButton label={playing ? "Pause" : "Play"} shortcut="Space" onClick={togglePlay} disabled={reduced}>
          {playing ? <Pause className="h-4 w-4" aria-hidden /> : <Play className="h-4 w-4" aria-hidden />}
        </IconButton>
        <IconButton label="Next step" shortcut="→" onClick={() => go(idx + 1)} disabled={idx === last}>
          <ChevronRight className="h-4 w-4" aria-hidden />
        </IconButton>
        <IconButton label="Replay step" onClick={() => go(idx)}>
          <RotateCcw className="h-4 w-4" aria-hidden />
        </IconButton>
        <div className="flex max-w-[40%] flex-wrap items-center gap-1 overflow-hidden" role="group" aria-label="Steps">
          {steps.map((s, i) => (
            <button
              key={i}
              type="button"
              onClick={() => go(i, false)}
              aria-label={`Step ${i + 1}: ${s.title}`}
              aria-current={i === idx ? "step" : undefined}
              className={`h-2.5 w-2.5 rounded-full ${i === idx ? "bg-accent" : i < idx ? "bg-muted" : "bg-line"}`}
            />
          ))}
        </div>
        <input
          type="range"
          min={0}
          max={100}
          step={1}
          value={Math.round(t * 100)}
          onChange={(e) => scrub(Number(e.target.value) / 100)}
          aria-label="Fold progress"
          aria-valuetext={`${Math.round(t * 100)}%`}
          className="min-w-[100px] flex-1 accent-[#f5b14c]"
        />
        <span className="mono w-10 text-right text-xs text-muted">{Math.round(t * 100)}%</span>
        <div className="flex gap-1" role="group" aria-label="Speed">
          {SPEEDS.map((s) => (
            <button
              key={s}
              type="button"
              className="chip mono h-9 px-2"
              aria-pressed={speed === s}
              aria-label={`Speed ${s} times`}
              onClick={() => setSpeed(s)}
            >
              {s}×
            </button>
          ))}
        </div>
      </div>

      {/* screen reader announcement of the current instruction */}
      <p aria-live="polite" className="sr-only">
        Step {idx + 1} of {steps.length}. {step.instruction}
      </p>
    </div>
  );
}
