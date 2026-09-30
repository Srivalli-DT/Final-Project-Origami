import { useCallback, useEffect, useRef, useState } from "react";
import { useNavigate } from "react-router-dom";
import { detect, makeGuide, usingMocks } from "../api";
import CPView from "../components/CPView";
import { useToasts, useUpload } from "../store";
import type { Assignment, DetectResult, Fold, Guide } from "../types";

const SAMPLES = [
  { file: "waterbomb.png", label: "Waterbomb base" },
  { file: "square-twist.png", label: "Square twist (noisy)" },
  { file: "preliminary-error.png", label: "Preliminary base with an error" },
];

const CYCLE: Record<string, Assignment | null> = { M: "V", V: "F", F: null };

type P = [number, number];

function snapPoint(p: P, grid: number, fold: Fold): P {
  // prefer existing vertices, then grid points
  let best: P | null = null;
  let bestD = 0.025;
  for (const v of fold.vertices_coords) {
    const d = Math.hypot(v[0] - p[0], v[1] - p[1]);
    if (d < bestD) {
      bestD = d;
      best = [v[0], v[1]];
    }
  }
  if (best) return best;
  const n = grid || 8;
  const s = (x: number) => Math.min(1, Math.max(0, Math.round(x * n) / n));
  return [s(p[0]), s(p[1])];
}

export default function Upload() {
  const navigate = useNavigate();
  const setUpload = useUpload((s) => s.setGuide);
  const toast = useToasts((s) => s.push);
  const [busy, setBusy] = useState<string | null>(null);
  const [result, setResult] = useState<DetectResult | null>(null);
  const [fold, setFold] = useState<Fold | null>(null);
  const [guide, setGuide] = useState<(Guide & { fold?: Fold }) | null>(null);
  const [validating, setValidating] = useState(false);
  const [mode, setMode] = useState<"edit" | "add">("edit");
  const [addAsg, setAddAsg] = useState<"M" | "V">("V");
  const [pending, setPending] = useState<P | null>(null);
  const [selected, setSelected] = useState<number | null>(null);
  const [title, setTitle] = useState("My crease pattern");
  const [dragOver, setDragOver] = useState(false);
  const editSeq = useRef(0);
  const reasonRefs = useRef<Map<number, HTMLLIElement>>(new Map());
  const fileInput = useRef<HTMLInputElement>(null);

  // ---- live validation through /api/guide (debounced)
  const revalidate = useCallback(
    (f: Fold) => {
      const seq = ++editSeq.current;
      setValidating(true);
      const timer = setTimeout(async () => {
        try {
          const g = await makeGuide(f);
          if (seq !== editSeq.current) return; // a newer edit is on its way
          setGuide(g);
          if (g.fold) setFold(g.fold);
        } catch (e) {
          toast(`Validation failed: ${(e as Error).message}`);
        } finally {
          if (seq === editSeq.current) setValidating(false);
        }
      }, 350);
      return () => clearTimeout(timer);
    },
    [toast],
  );

  const edit = (f: Fold) => {
    setFold(f);
    setSelected(null);
    revalidate(f);
  };

  // ---- inputs
  const runDetect = async (original: Blob) => {
    if (original.size > 15 * 1024 * 1024) {
      toast("That image is too large (over 15MB).");
      return;
    }
    setBusy("Detecting creases…");
    const blob = await shrinkImage(original);
    if (blob.size > 4 * 1024 * 1024) {
      setBusy(null);
      toast("That image is still over 4MB after resizing; try a smaller screenshot.");
      return;
    }
    setResult(null);
    setGuide(null);
    setFold(null);
    try {
      const r = await detect(blob);
      setResult(r);
      edit(r.fold);
    } catch (e) {
      toast(`Detection failed: ${(e as Error).message}`);
    } finally {
      setBusy(null);
    }
  };

  const loadFoldFile = async (file: File) => {
    try {
      const j = JSON.parse(await file.text());
      if (!Array.isArray(j.vertices_coords) || !Array.isArray(j.edges_vertices)) throw new Error("not a FOLD file");
      const f: Fold = {
        vertices_coords: j.vertices_coords.map((p: number[]) => [p[0], p[1]]),
        edges_vertices: j.edges_vertices,
        edges_assignment: j.edges_assignment ?? j.edges_vertices.map(() => "F"),
        faces_vertices: j.faces_vertices ?? [],
      };
      setResult(null);
      if (file.name) setTitle(file.name.replace(/\.fold$/i, ""));
      edit(normaliseToUnit(f));
    } catch (e) {
      toast(`Could not read that .fold file: ${(e as Error).message}`);
    }
  };

  const onFile = (file: File | undefined) => {
    if (!file) return;
    if (file.name.toLowerCase().endsWith(".fold") || file.type === "application/json") loadFoldFile(file);
    else runDetect(file);
  };

  const trySample = async (file: string) => {
    const r = await fetch(`/samples/${file}`);
    runDetect(await r.blob());
  };

  // ---- editing
  const onEdgeClick = (i: number) => {
    if (!fold || mode !== "edit") return;
    const next = CYCLE[fold.edges_assignment[i]];
    if (next === undefined) return;
    if (next === null) {
      edit({
        ...fold,
        edges_vertices: fold.edges_vertices.filter((_, j) => j !== i),
        edges_assignment: fold.edges_assignment.filter((_, j) => j !== i),
      });
    } else {
      edit({ ...fold, edges_assignment: fold.edges_assignment.map((a, j) => (j === i ? next : a)) });
    }
  };

  const onPaperClick = (x: number, y: number) => {
    if (!fold || mode !== "add") return;
    const p = snapPoint([x, y], result?.grid ?? 8, fold);
    if (!pending) {
      setPending(p);
      return;
    }
    if (Math.hypot(p[0] - pending[0], p[1] - pending[1]) < 1e-6) return;
    const n = fold.vertices_coords.length;
    edit({
      ...fold,
      vertices_coords: [...fold.vertices_coords, pending, p],
      edges_vertices: [...fold.edges_vertices, [n, n + 1]],
      edges_assignment: [...fold.edges_assignment, addAsg],
    });
    setPending(null);
  };

  useEffect(() => {
    if (selected !== null) reasonRefs.current.get(selected)?.scrollIntoView({ behavior: "smooth", block: "nearest" });
  }, [selected]);

  const generate = () => {
    if (!fold || !guide) return;
    setUpload(title.trim() || "My crease pattern", guide.fold ?? fold, guide);
    navigate("/guide");
  };

  const failing = guide?.validation.vertices.filter((v) => !v.ok) ?? [];

  return (
    <main className="mx-auto max-w-6xl px-4 py-8">
      <h1 className="font-serif text-3xl">Upload a crease pattern</h1>
      <p className="mt-1 max-w-3xl text-stone-600">
        Works best with clean digital crease patterns: mountains in red, valleys in blue (dashed is fine), the
        paper edge in black. You can also load a <code>.fold</code> file.
      </p>
      {usingMocks && (
        <p className="mt-3 rounded-lg bg-amber-50 p-3 text-sm text-amber-900">
          Upload needs the backend. Set <code>VITE_API_URL</code> to enable detection and validation.
        </p>
      )}

      {/* input */}
      <div
        onDragOver={(e) => {
          e.preventDefault();
          setDragOver(true);
        }}
        onDragLeave={() => setDragOver(false)}
        onDrop={(e) => {
          e.preventDefault();
          setDragOver(false);
          onFile(e.dataTransfer.files[0]);
        }}
        onClick={() => fileInput.current?.click()}
        className={`mt-5 flex cursor-pointer flex-col items-center justify-center rounded-xl border-2 border-dashed p-8 text-center transition ${
          dragOver ? "border-accent bg-rose-50" : "border-stone-300 bg-white hover:border-stone-500"
        }`}
      >
        <div className="text-lg font-medium">Drop a screenshot or .fold file here</div>
        <div className="text-sm text-stone-500">or click to choose (PNG / JPG; large images are resized first)</div>
        <input
          ref={fileInput}
          type="file"
          accept="image/*,.fold,application/json"
          className="hidden"
          onChange={(e) => {
            onFile(e.target.files?.[0]);
            e.target.value = "";
          }}
        />
      </div>
      <div className="mt-3 flex flex-wrap items-center gap-2 text-sm">
        <span className="text-stone-500">Try a sample:</span>
        {SAMPLES.map((s) => (
          <button key={s.file} className="btn" onClick={() => trySample(s.file)} disabled={!!busy || usingMocks}>
            <img src={`/samples/${s.file}`} alt="" className="h-6 w-6 rounded-sm border" />
            {s.label}
          </button>
        ))}
      </div>

      {busy && <p className="mt-6 animate-pulse text-stone-600">{busy}</p>}

      {/* review + edit */}
      {fold && (
        <section className="mt-6 grid gap-4 lg:grid-cols-2">
          {result && (
            <div className="card p-3">
              <div className="mb-1 flex items-center justify-between text-xs uppercase tracking-wide text-stone-500">
                <span>Detected lines</span>
                <span>
                  confidence {(result.confidence * 100).toFixed(0)}% · grid {result.grid ? `${result.grid}×${result.grid}` : "none"}
                </span>
              </div>
              <img
                src={`data:image/png;base64,${result.overlay_png_b64}`}
                alt="detected overlay"
                className="w-full rounded"
              />
            </div>
          )}
          <div className="card p-3">
            <div className="mb-2 flex flex-wrap items-center gap-2">
              <span className="text-xs uppercase tracking-wide text-stone-500">Editable crease pattern</span>
              <div className="ml-auto flex gap-1">
                <button
                  className={`btn ${mode === "edit" ? "btn-primary" : ""}`}
                  onClick={() => {
                    setMode("edit");
                    setPending(null);
                  }}
                >
                  Edit creases
                </button>
                <button className={`btn ${mode === "add" ? "btn-primary" : ""}`} onClick={() => setMode("add")}>
                  Add line
                </button>
                {mode === "add" && (
                  <select
                    className="rounded-lg border border-stone-300 px-2 text-sm"
                    value={addAsg}
                    onChange={(e) => setAddAsg(e.target.value as "M" | "V")}
                  >
                    <option value="V">Valley</option>
                    <option value="M">Mountain</option>
                  </select>
                )}
              </div>
            </div>
            <CPView
              fold={fold}
              sequenced={false}
              vertexChecks={guide?.validation.vertices}
              selectedVertex={selected}
              onEdgeClick={mode === "edit" ? onEdgeClick : undefined}
              onVertexClick={setSelected}
              onPaperClick={mode === "add" ? onPaperClick : undefined}
              className={`h-auto w-full ${mode === "add" ? "cursor-crosshair" : ""}`}
              extra={
                pending && <circle cx={pending[0]} cy={1 - pending[1]} r={0.015} fill="#c0392b" opacity={0.8} />
              }
            />
            <p className="mt-2 text-xs text-stone-500">
              {mode === "edit"
                ? "Click a crease to cycle mountain → valley → reference → delete. Click a dot to see its problem."
                : "Click two points to add a crease. Clicks snap to the detected grid and existing vertices."}
            </p>
          </div>

          <div className="card p-4 lg:col-span-2">
            <div className="flex flex-wrap items-center gap-3">
              {validating ? (
                <span className="text-stone-500">Checking…</span>
              ) : guide?.validation.ok ? (
                <span className="font-medium text-emerald-700">✓ Every vertex passes Maekawa and Kawasaki</span>
              ) : guide ? (
                <span className="font-medium text-rose-700">
                  {failing.length} {failing.length === 1 ? "vertex fails" : "vertices fail"} local flat-foldability
                </span>
              ) : null}
              <input
                value={title}
                onChange={(e) => setTitle(e.target.value)}
                className="ml-auto rounded-lg border border-stone-300 px-3 py-1.5 text-sm"
                aria-label="title"
              />
              <button className="btn btn-primary" onClick={generate} disabled={!guide || validating}>
                Generate guide →
              </button>
            </div>
            {guide && !guide.validation.ok && (
              <p className="mt-2 text-sm text-amber-800">
                You can still generate a guide, but it may be wrong until the red vertices are fixed.
              </p>
            )}
            {failing.length > 0 && (
              <ul className="mt-3 max-h-48 space-y-1 overflow-y-auto text-sm">
                {failing.map((v) => (
                  <li
                    key={v.vertex}
                    ref={(el) => {
                      if (el) reasonRefs.current.set(v.vertex, el);
                    }}
                    onClick={() => setSelected(v.vertex)}
                    className={`cursor-pointer rounded px-2 py-1 ${
                      selected === v.vertex ? "bg-rose-100" : "hover:bg-stone-100"
                    }`}
                  >
                    <span className="font-mono text-xs text-stone-500">
                      ({fold.vertices_coords[v.vertex]?.map((c) => c.toFixed(3)).join(", ")})
                    </span>{" "}
                    {v.reasons.join(" · ")}
                  </li>
                ))}
              </ul>
            )}
          </div>
        </section>
      )}
    </main>
  );
}

const MAX_SIDE = 1600;

/**
 * Downscale big images in the browser (detection works at 1200px anyway) so uploads
 * stay under the hosting request limit. Small images are sent unchanged.
 */
async function shrinkImage(blob: Blob): Promise<Blob> {
  let bmp: ImageBitmap;
  try {
    bmp = await createImageBitmap(blob);
  } catch {
    return blob; // let the server report the decode error
  }
  const scale = Math.min(1, MAX_SIDE / Math.max(bmp.width, bmp.height));
  if (scale === 1 && blob.size < 3 * 1024 * 1024) return blob;
  const canvas = document.createElement("canvas");
  canvas.width = Math.round(bmp.width * scale);
  canvas.height = Math.round(bmp.height * scale);
  canvas.getContext("2d")!.drawImage(bmp, 0, 0, canvas.width, canvas.height);
  const toBlob = (type: string, q?: number) =>
    new Promise<Blob>((res, rej) => canvas.toBlob((b) => (b ? res(b) : rej(new Error("encode failed"))), type, q));
  const png = await toBlob("image/png");
  return png.size < 3 * 1024 * 1024 ? png : toBlob("image/jpeg", 0.92);
}

/** Scale arbitrary FOLD coordinates into the unit square (y up). */
function normaliseToUnit(f: Fold): Fold {
  const xs = f.vertices_coords.map((p) => p[0]);
  const ys = f.vertices_coords.map((p) => p[1]);
  const minX = Math.min(...xs);
  const minY = Math.min(...ys);
  const span = Math.max(Math.max(...xs) - minX, Math.max(...ys) - minY) || 1;
  if (minX >= 0 && minY >= 0 && span <= 1 + 1e-9 && Math.max(...xs) <= 1 && Math.max(...ys) <= 1) return f;
  return {
    ...f,
    vertices_coords: f.vertices_coords.map(([x, y]) => [(x - minX) / span, (y - minY) / span]),
  };
}
