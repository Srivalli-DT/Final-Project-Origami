import { useCallback, useEffect, useMemo, useRef, useState } from "react";
import {
  Check,
  Download,
  Eraser,
  FileDown,
  FolderOpen,
  Info,
  FileUp,
  Grid3x3,
  Minus,
  MousePointer2,
  Redo2,
  Save,
  Sparkles,
  Undo2,
  Wand2,
  X,
} from "lucide-react";
import { api, usingMocks } from "../api";
import SimView, { type SimMode } from "../components/SimView";
import { IconButton } from "../components/Tip";
import { useKeys } from "../hooks/useKeys";
import { useReducedMotion } from "../hooks/useReducedMotion";
import type { Ramp } from "../sim/solver";
import { rampColor } from "../sim/solver";
import { Link } from "react-router-dom";
import { ensureUser, useStudioInbox, useToasts, useUser } from "../store";
import {
  dist,
  foldToSegs,
  lineToLine,
  nearest,
  pointSegDist,
  pointToPoint,
  segsToFold,
  snapEnd,
  snapPoints,
  type Kind,
  type Seg,
} from "../studio/geometry";
import { exportFold, exportSvg, readFoldFile } from "../studio/io";
import { TEMPLATES } from "../studio/templates";
import type { CheckResult, Exceptions, FaceTree, P2, PatternSummary } from "../types";

type Tool = "select" | "V" | "M" | "F" | "eraser" | "axiom";
type Axiom = "p2p" | "l2l";

const TOOLS: { id: Tool; key: string; label: string }[] = [
  { id: "select", key: "1", label: "Select" },
  { id: "V", key: "2", label: "Valley line" },
  { id: "M", key: "3", label: "Mountain line" },
  { id: "F", key: "4", label: "Reference line" },
  { id: "eraser", key: "5", label: "Eraser" },
  { id: "axiom", key: "6", label: "Axiom fold" },
];
const GRIDS = [4, 8, 16, 32];
const COLORS: Record<Kind, string> = { M: "#ff5d5d", V: "#4da3ff", F: "#6b7280" };
const DASHES: Record<Kind, string | undefined> = { V: "0.025 0.016", M: "0.03 0.012 0.006 0.012", F: undefined };
const RULE_TITLES: Record<string, string> = {
  maekawa: "Maekawa",
  kawasaki: "Kawasaki",
  "even-degree": "Even degree",
  "big-little-big": "Big-little-big",
  "two-colourable": "Two-colourable",
};

function ToolIcon({ tool }: { tool: Tool }) {
  const cls = "h-4 w-4";
  if (tool === "select") return <MousePointer2 className={cls} aria-hidden />;
  if (tool === "eraser") return <Eraser className={cls} aria-hidden />;
  if (tool === "axiom") return <Wand2 className={cls} aria-hidden />;
  return (
    <svg viewBox="0 0 16 16" className={cls} aria-hidden>
      <line x1="2" y1="14" x2="14" y2="2" stroke={COLORS[tool as Kind]} strokeWidth="2" strokeDasharray={tool === "V" ? "3 2" : tool === "M" ? "4 1.5 1 1.5" : undefined} />
    </svg>
  );
}

export default function Studio() {
  const toast = useToasts((s) => s.push);
  const userId = useUser((s) => s.userId);
  const [patterns, setPatterns] = useState<PatternSummary[] | null>(null);
  const take = useStudioInbox((s) => s.take);
  const reduced = useReducedMotion();

  // a pattern handed over from a tutorial, rule demo or saved pattern (read without clearing:
  // StrictMode runs initialisers twice), otherwise the square base template
  const [title, setTitle] = useState(() => useStudioInbox.getState().title || "Square base");
  const [segs, setSegs] = useState<Seg[]>(() => {
    const inbox = useStudioInbox.getState().fold;
    return inbox ? foldToSegs(inbox) : TEMPLATES.find((t) => t.id === "square-base")!.segs();
  });
  const [past, setPast] = useState<Seg[][]>([]);
  const [future, setFuture] = useState<Seg[][]>([]);
  const [tool, setTool] = useState<Tool>("V");
  const [axiom, setAxiom] = useState<Axiom>("p2p");
  const [axiomKind, setAxiomKind] = useState<Kind>("V");
  const [grid, setGrid] = useState(8);
  const [start, setStart] = useState<P2 | null>(null);
  const [cursor, setCursor] = useState<P2 | null>(null);
  const [picks, setPicks] = useState<(P2 | [P2, P2])[]>([]);
  const [selected, setSelected] = useState<number | null>(null);
  const [exceptions, setExceptions] = useState<Exceptions>({ allow_cuts: false, non_flat: false, curved: false });
  const [check, setCheck] = useState<CheckResult | null>(null);
  const [tree, setTree] = useState<FaceTree | null>(null);
  const [checking, setChecking] = useState(false);
  const [focusRule, setFocusRule] = useState<string | null>(null);
  const [foldPct, setFoldPct] = useState(reduced ? 0 : 0.35);
  const [mode, setMode] = useState<SimMode>("physics");
  const [strain, setStrain] = useState(false);
  const [ramp, setRamp] = useState<Ramp>("viridis");
  const [maxStrain, setMaxStrain] = useState(0);
  const svgRef = useRef<SVGSVGElement>(null);
  const fileRef = useRef<HTMLInputElement>(null);

  useEffect(() => {
    take(); // the inbox was read by the state initialisers; clear it
  }, [take]);

  const commit = useCallback(
    (next: Seg[]) => {
      setPast((p) => [...p.slice(-80), segs]);
      setFuture([]);
      setSegs(next);
      setSelected(null);
    },
    [segs],
  );
  const undo = () => {
    if (!past.length) return;
    setFuture((f) => [segs, ...f]);
    setSegs(past[past.length - 1]);
    setPast(past.slice(0, -1));
  };
  const redo = () => {
    if (!future.length) return;
    setPast((p) => [...p, segs]);
    setSegs(future[0]);
    setFuture(future.slice(1));
  };

  // ---- rule checks (debounced 300ms) + hinge preview tree
  const fold = useMemo(() => segsToFold(segs), [segs]);
  useEffect(() => {
    if (usingMocks) return;
    setChecking(true);
    let alive = true;
    const h = setTimeout(async () => {
      try {
        const res = await api.check(fold, exceptions);
        if (!alive) return;
        setCheck(res);
        const prev = await api.preview(fold);
        if (alive) setTree(prev.face_tree);
      } catch {
        if (alive) setCheck(null);
      } finally {
        if (alive) setChecking(false);
      }
    }, 300);
    return () => {
      alive = false;
      clearTimeout(h);
    };
  }, [fold, exceptions]);

  const snaps = useMemo(() => snapPoints(segs, grid), [segs, grid]);

  // ---- pointer → paper coordinates (y up)
  const toPaper = (e: React.PointerEvent | React.MouseEvent): P2 => {
    const svg = svgRef.current!;
    const pt = svg.createSVGPoint();
    pt.x = e.clientX;
    pt.y = e.clientY;
    const p = pt.matrixTransform(svg.getScreenCTM()!.inverse());
    return [p.x, 1 - p.y];
  };
  const hitSeg = (p: P2): number | null => {
    let best: number | null = null;
    let bd = 0.02;
    segs.forEach((s, i) => {
      const d = pointSegDist(p, s.a, s.b);
      if (d < bd) {
        bd = d;
        best = i;
      }
    });
    return best;
  };
  const BORDER: [P2, P2][] = [
    [[0, 0], [1, 0]],
    [[1, 0], [1, 1]],
    [[1, 1], [0, 1]],
    [[0, 1], [0, 0]],
  ];
  const hitLine = (p: P2): [P2, P2] | null => {
    const i = hitSeg(p);
    if (i !== null) return [segs[i].a, segs[i].b];
    for (const l of BORDER) if (pointSegDist(p, l[0], l[1]) < 0.02) return l;
    return null;
  };

  const onClick = (e: React.MouseEvent) => {
    const raw = toPaper(e);
    if (tool === "select") {
      setSelected(hitSeg(raw));
      return;
    }
    if (tool === "eraser") {
      const i = hitSeg(raw);
      if (i !== null) commit(segs.filter((_, j) => j !== i));
      return;
    }
    if (tool === "axiom") {
      if (axiom === "p2p") {
        const p = nearest(raw, snaps) ?? raw;
        const next = [...picks, p];
        if (next.length === 2) {
          const line = pointToPoint(next[0] as P2, next[1] as P2);
          if (line) commit([...segs, { a: line[0], b: line[1], asg: axiomKind }]);
          setPicks([]);
        } else setPicks(next);
      } else {
        const l = hitLine(raw);
        if (!l) return;
        const next = [...picks, l];
        if (next.length === 2) {
          const line = lineToLine(next[0] as [P2, P2], next[1] as [P2, P2]);
          if (line) commit([...segs, { a: line[0], b: line[1], asg: axiomKind }]);
          setPicks([]);
        } else setPicks(next);
      }
      return;
    }
    // drawing tools
    if (!start) {
      setStart(nearest(raw, snaps) ?? raw);
      return;
    }
    const end = snapEnd(start, raw, snaps);
    if (dist(start, end) > 1e-3) commit([...segs, { a: start, b: end, asg: tool as Kind }]);
    setStart(null);
  };

  const onMove = (e: React.PointerEvent) => {
    const raw = toPaper(e);
    setCursor(start ? snapEnd(start, raw, snaps) : nearest(raw, snaps) ?? raw);
  };

  const pickTool = (t: Tool) => {
    setTool(t);
    setStart(null);
    setPicks([]);
  };

  useKeys({
    "1": () => pickTool("select"),
    "2": () => pickTool("V"),
    "3": () => pickTool("M"),
    "4": () => pickTool("F"),
    "5": () => pickTool("eraser"),
    "6": () => pickTool("axiom"),
    Escape: () => {
      setStart(null);
      setPicks([]);
      setSelected(null);
    },
    Delete: () => selected !== null && commit(segs.filter((_, j) => j !== selected)),
    Backspace: () => selected !== null && commit(segs.filter((_, j) => j !== selected)),
    "[": () => setFoldPct((v) => Math.max(0, v - 0.05)),
    "]": () => setFoldPct((v) => Math.min(1, v + 0.05)),
  });
  useEffect(() => {
    const on = (e: KeyboardEvent) => {
      if (!(e.ctrlKey || e.metaKey)) return;
      const k = e.key.toLowerCase();
      if (k === "z" && !e.shiftKey) {
        e.preventDefault();
        undo();
      } else if (k === "y" || (k === "z" && e.shiftKey)) {
        e.preventDefault();
        redo();
      }
    };
    window.addEventListener("keydown", on);
    return () => window.removeEventListener("keydown", on);
  });

  const save = async () => {
    if (usingMocks) return toast("Saving needs the server.");
    const uid = await ensureUser();
    try {
      await api.savePattern(title.trim() || "Untitled", check?.fold ?? fold, uid);
      toast("Saved to My patterns", "info");
      setPatterns(null);
    } catch {
      toast("Could not save.");
    }
  };

  const togglePatterns = async () => {
    if (patterns) return setPatterns(null);
    if (usingMocks || !userId) return setPatterns([]);
    try {
      setPatterns(await api.patterns(userId));
    } catch {
      toast("Could not load your patterns.");
    }
  };

  const openPattern = async (id: number) => {
    try {
      const p = await api.pattern(id);
      commit(foldToSegs(p.fold));
      setTitle(p.title);
      setPatterns(null);
    } catch {
      toast("Could not open that pattern.");
    }
  };

  const importFile = async (f?: File) => {
    if (!f) return;
    try {
      const fd = await readFoldFile(f);
      commit(foldToSegs(fd));
      setTitle(f.name.replace(/\.fold$/i, ""));
    } catch (e) {
      toast(`Could not read that file: ${(e as Error).message}`);
    }
  };

  const failing = (check?.checks ?? []).filter((c) => !c.ok);
  const highlight: P2[] = focusRule
    ? (check?.checks.find((c) => c.rule_id === focusRule)?.points ?? [])
    : failing.flatMap((c) => c.points);
  const simFold = check?.fold ?? null;

  return (
    <div className="flex h-full flex-col">
      <h1 className="sr-only">Studio</h1>
      {/* toolbar */}
      <div className="flex flex-wrap items-center gap-1.5 border-b border-line px-3 py-2">
        <input
          value={title}
          onChange={(e) => setTitle(e.target.value)}
          aria-label="Pattern title"
          className="h-9 w-40 rounded-lg border border-line bg-panel2 px-2 text-sm focus:border-accent"
        />
        <div className="flex gap-1" role="toolbar" aria-label="Tools">
          {TOOLS.map((t) => (
            <IconButton key={t.id} label={t.label} shortcut={t.key} pressed={tool === t.id} onClick={() => pickTool(t.id)}>
              <ToolIcon tool={t.id} />
            </IconButton>
          ))}
        </div>
        {tool === "axiom" && (
          <div className="flex gap-1" role="group" aria-label="Axiom">
            <button type="button" className="chip h-9 px-2 text-xs" aria-pressed={axiom === "p2p"} onClick={() => { setAxiom("p2p"); setPicks([]); }}>
              point→point
            </button>
            <button type="button" className="chip h-9 px-2 text-xs" aria-pressed={axiom === "l2l"} onClick={() => { setAxiom("l2l"); setPicks([]); }}>
              line→line
            </button>
            <select
              value={axiomKind}
              onChange={(e) => setAxiomKind(e.target.value as Kind)}
              aria-label="Axiom fold type"
              className="h-9 rounded-lg border border-line bg-panel2 px-1 text-xs"
            >
              <option value="V">Valley</option>
              <option value="M">Mountain</option>
              <option value="F">Reference</option>
            </select>
          </div>
        )}
        {tool === "select" && selected !== null && (
          <div className="flex gap-1" role="group" aria-label="Selected crease">
            {(["V", "M", "F"] as Kind[]).map((k) => (
              <button
                key={k}
                type="button"
                className="chip mono h-9 w-9 justify-center px-0"
                aria-pressed={segs[selected]?.asg === k}
                aria-label={k === "V" ? "Make valley" : k === "M" ? "Make mountain" : "Make reference"}
                onClick={() => commit(segs.map((s, i) => (i === selected ? { ...s, asg: k } : s)))}
              >
                {k}
              </button>
            ))}
            <IconButton label="Delete crease" onClick={() => commit(segs.filter((_, j) => j !== selected))}>
              <X className="h-4 w-4" aria-hidden />
            </IconButton>
          </div>
        )}
        <span className="mx-1 h-6 w-px bg-line" aria-hidden />
        <IconButton label="Undo" shortcut="Ctrl+Z" onClick={undo} disabled={!past.length}>
          <Undo2 className="h-4 w-4" aria-hidden />
        </IconButton>
        <IconButton label="Redo" shortcut="Ctrl+Y" onClick={redo} disabled={!future.length}>
          <Redo2 className="h-4 w-4" aria-hidden />
        </IconButton>
        <label className="flex items-center gap-1 text-sm">
          <Grid3x3 className="h-4 w-4 text-muted" aria-hidden />
          <span className="sr-only">Grid</span>
          <select value={grid} onChange={(e) => setGrid(Number(e.target.value))} aria-label="Grid" className="mono h-9 rounded-lg border border-line bg-panel2 px-1">
            {GRIDS.map((g) => (
              <option key={g} value={g}>
                {g}
              </option>
            ))}
          </select>
        </label>
        <select
          aria-label="Template"
          value=""
          onChange={(e) => {
            const t = TEMPLATES.find((x) => x.id === e.target.value);
            if (t) {
              commit(t.segs());
              setTitle(t.title);
            }
          }}
          className="h-9 rounded-lg border border-line bg-panel2 px-1 text-sm"
        >
          <option value="">Template…</option>
          {TEMPLATES.map((t) => (
            <option key={t.id} value={t.id}>
              {t.title}
            </option>
          ))}
        </select>
        <div className="ml-auto flex gap-1">
          <IconButton label="Import .fold" onClick={() => fileRef.current?.click()}>
            <FileUp className="h-4 w-4" aria-hidden />
          </IconButton>
          <input ref={fileRef} type="file" accept=".fold,application/json" className="hidden" onChange={(e) => { importFile(e.target.files?.[0]); e.target.value = ""; }} />
          <IconButton label="Export .fold" onClick={() => exportFold(title, segs, check?.fold)}>
            <FileDown className="h-4 w-4" aria-hidden />
          </IconButton>
          <IconButton label="Export .svg" onClick={() => exportSvg(title, segs)}>
            <Download className="h-4 w-4" aria-hidden />
          </IconButton>
          <IconButton label="Save to My patterns" onClick={save}>
            <Save className="h-4 w-4" aria-hidden />
          </IconButton>
          <div className="relative">
            <IconButton label="My patterns" pressed={!!patterns} onClick={togglePatterns}>
              <FolderOpen className="h-4 w-4" aria-hidden />
            </IconButton>
            {patterns && (
              <div role="dialog" aria-label="My patterns" className="panel absolute right-0 top-full z-50 mt-1 w-64 p-2 shadow-lg">
                {patterns.length === 0 ? (
                  <p className="p-2 text-sm text-muted">Nothing saved yet.</p>
                ) : (
                  <ul className="max-h-72 overflow-y-auto">
                    {patterns.map((p) => (
                      <li key={p.id}>
                        <button type="button" onClick={() => openPattern(p.id)} className="flex w-full items-center gap-2 rounded-md px-2 py-2 text-left text-sm hover:bg-panel2">
                          <span className="min-w-0 flex-1 truncate">{p.title}</span>
                          <span className="mono text-xs text-muted">{new Date(p.created_at).toLocaleDateString()}</span>
                        </button>
                      </li>
                    ))}
                  </ul>
                )}
              </div>
            )}
          </div>
        </div>
      </div>

      <div className="grid min-h-0 flex-1 grid-cols-1 lg:grid-cols-[1fr_1fr_17rem]">
        {/* editor */}
        <section aria-label="Crease pattern editor" className="min-h-[300px] border-b border-line bg-panel p-3 lg:border-b-0 lg:border-r">
          <svg
            ref={svgRef}
            viewBox="-0.04 -0.04 1.08 1.08"
            className={`h-full w-full ${tool === "select" || tool === "eraser" ? "cursor-pointer" : "cursor-crosshair"}`}
            onClick={onClick}
            onPointerMove={onMove}
            onPointerLeave={() => setCursor(null)}
            role="img"
            aria-label={`Crease pattern with ${segs.length} creases`}
          >
            <rect width={1} height={1} fill="#f3e6cc" stroke="#2a2f3a" strokeWidth={0.006} />
            {Array.from({ length: grid - 1 }, (_, i) => (i + 1) / grid).map((g) => (
              <g key={g} stroke="#d9cdb4" strokeWidth={0.0025}>
                <line x1={g} y1={0} x2={g} y2={1} />
                <line x1={0} y1={g} x2={1} y2={g} />
              </g>
            ))}
            {segs.map((s, i) => (
              <line
                key={i}
                x1={s.a[0]}
                y1={1 - s.a[1]}
                x2={s.b[0]}
                y2={1 - s.b[1]}
                stroke={i === selected ? "#f5b14c" : COLORS[s.asg]}
                strokeWidth={i === selected ? 0.012 : 0.007}
                strokeDasharray={DASHES[s.asg]}
                strokeLinecap="round"
              >
                <title>{s.asg === "V" ? "Valley (V)" : s.asg === "M" ? "Mountain (M)" : "Reference (F)"}</title>
              </line>
            ))}
            {start && cursor && (
              <line x1={start[0]} y1={1 - start[1]} x2={cursor[0]} y2={1 - cursor[1]} stroke={COLORS[(tool as Kind) ?? "V"] ?? "#f5b14c"} strokeWidth={0.006} opacity={0.6} strokeDasharray="0.01 0.01" />
            )}
            {picks.map((p, i) =>
              Array.isArray(p[0]) ? (
                <line key={i} x1={(p as [P2, P2])[0][0]} y1={1 - (p as [P2, P2])[0][1]} x2={(p as [P2, P2])[1][0]} y2={1 - (p as [P2, P2])[1][1]} stroke="#f5b14c" strokeWidth={0.012} />
              ) : (
                <circle key={i} cx={(p as P2)[0]} cy={1 - (p as P2)[1]} r={0.014} fill="#f5b14c" />
              ),
            )}
            {cursor && tool !== "select" && tool !== "eraser" && <circle cx={cursor[0]} cy={1 - cursor[1]} r={0.008} fill="#0e1014" />}
            {highlight.map(([x, y], i) => (
              <circle key={i} cx={x} cy={1 - y} r={0.018} fill="none" stroke="#ff5d5d" strokeWidth={0.008}>
                <title>Rule broken here</title>
              </circle>
            ))}
          </svg>
        </section>

        {/* simulator */}
        <section aria-label="3D fold simulator" className="flex min-h-[320px] flex-col border-b border-line lg:border-b-0 lg:border-r">
          <div className="relative min-h-0 flex-1">
            {usingMocks || !simFold ? (
              <p className="p-4 text-sm text-muted">{usingMocks ? "3D preview needs the server." : checking ? "Loading…" : "Draw some creases."}</p>
            ) : (
              <SimView
                fold={simFold}
                tree={tree}
                foldPct={foldPct}
                mode={mode}
                strain={strain}
                ramp={ramp}
                highlight={highlight}
                onUnstable={() => {
                  setMode("hinge");
                  toast("Solver unstable; switched to hinge preview.", "info");
                }}
                onMaxStrain={setMaxStrain}
                label={`Folded ${Math.round(foldPct * 100)} percent, ${mode === "physics" ? "physics" : "hinge"} preview`}
              />
            )}
            {strain && mode === "physics" && (
              <div className="pointer-events-none absolute bottom-2 left-2 rounded-md border border-line bg-panel/90 p-2 text-xs">
                <div className="mb-1 text-muted">Strain</div>
                <div className="h-2 w-32 rounded" style={{ background: `linear-gradient(to right, ${[0, 0.25, 0.5, 0.75, 1].map((t) => `rgb(${rampColor(t, ramp).map((c) => Math.round(c * 255)).join(",")})`).join(",")})` }} />
                <div className="mono mt-0.5 flex justify-between text-muted">
                  <span>0%</span>
                  <span>≥5%</span>
                </div>
                <div className="mono mt-0.5 text-text">max {(maxStrain * 100).toFixed(1)}%</div>
              </div>
            )}
          </div>
          <div className="flex flex-wrap items-center gap-2 border-t border-line bg-panel px-3 py-2">
            <label htmlFor="foldpct" className="text-sm text-muted">
              Fold
            </label>
            <input
              id="foldpct"
              type="range"
              min={0}
              max={100}
              value={Math.round(foldPct * 100)}
              onChange={(e) => setFoldPct(Number(e.target.value) / 100)}
              aria-valuetext={`${Math.round(foldPct * 100)}%`}
              className="min-w-[90px] flex-1 accent-[#f5b14c]"
            />
            <span className="mono w-10 text-right text-xs">{Math.round(foldPct * 100)}%</span>
            <button type="button" className="chip h-9 px-2 text-xs" aria-pressed={mode === "physics"} onClick={() => setMode(mode === "physics" ? "hinge" : "physics")}>
              {mode === "physics" ? "Physics" : "Hinge"}
            </button>
            <button type="button" className="chip h-9 px-2 text-xs" aria-pressed={strain} onClick={() => setStrain(!strain)} disabled={mode !== "physics"}>
              Strain
            </button>
            {strain && (
              <select value={ramp} onChange={(e) => setRamp(e.target.value as Ramp)} aria-label="Strain colours" className="h-9 rounded-lg border border-line bg-panel2 px-1 text-xs">
                <option value="viridis">Viridis</option>
                <option value="greenred">Green→red</option>
              </select>
            )}
          </div>
        </section>

        {/* rules panel */}
        <aside aria-label="Rule checks" className="overflow-y-auto bg-panel p-3">
          <div className="flex items-center gap-2">
            <h2 className="font-medium">Rules</h2>
            {checking && <span className="text-xs text-muted">checking…</span>}
            {check && !checking && (check.ok ? <Check className="h-4 w-4 text-success" aria-label="all pass" /> : <X className="h-4 w-4 text-error" aria-label="some fail" />)}
          </div>
          {usingMocks && <p className="mt-2 text-sm text-muted">Checks need the server.</p>}
          <ul className="mt-2 space-y-1">
            {check?.checks.map((c) => (
              <li key={c.rule_id} className="relative">
                <button
                  type="button"
                  aria-pressed={focusRule === c.rule_id}
                  onClick={() => setFocusRule(focusRule === c.rule_id ? null : c.rule_id)}
                  className={`flex w-full items-center gap-2 rounded-lg border py-1.5 pl-2 pr-9 text-left text-sm ${focusRule === c.rule_id ? "border-accent" : "border-line"} bg-panel2`}
                  title={c.message}
                >
                  {c.skipped ? (
                    <Minus className="h-4 w-4 text-muted" aria-label="skipped" />
                  ) : c.ok ? (
                    <Check className="h-4 w-4 text-success" aria-label="passes" />
                  ) : (
                    <X className="h-4 w-4 text-error" aria-label="fails" />
                  )}
                  <span className="flex-1">{RULE_TITLES[c.rule_id] ?? c.rule_id}</span>
                  {!c.ok && <span className="mono text-xs text-error">{c.vertices.length}</span>}
                </button>
                <Link
                  to={`/rules/${c.rule_id}`}
                  className="icon-btn absolute right-1 top-1/2 h-7 min-w-7 -translate-y-1/2 border-0 bg-transparent"
                  aria-label={`About ${RULE_TITLES[c.rule_id] ?? c.rule_id}`}
                >
                  <Info className="h-3.5 w-3.5 text-muted" aria-hidden />
                </Link>
              </li>
            ))}
          </ul>
          <fieldset className="mt-4">
            <legend className="text-sm font-medium">Exceptions</legend>
            {(
              [
                ["allow_cuts", "Cuts"],
                ["non_flat", "Non-flat"],
                ["curved", "Curved"],
              ] as const
            ).map(([k, label]) => (
              <label key={k} className="mt-1.5 flex items-center gap-2 text-sm">
                <input type="checkbox" checked={exceptions[k]} onChange={(e) => setExceptions({ ...exceptions, [k]: e.target.checked })} className="h-4 w-4 accent-[#f5b14c]" />
                {label}
              </label>
            ))}
          </fieldset>
          {check && (
            <p className="mono mt-4 text-xs text-muted">
              <Sparkles className="mr-1 inline h-3 w-3" aria-hidden />
              {check.fold.edges_vertices.length} edges · {check.interior_vertices} vertices
            </p>
          )}
        </aside>
      </div>
    </div>
  );
}
