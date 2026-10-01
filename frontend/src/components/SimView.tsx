import { useEffect, useMemo, useRef, useState } from "react";
import { Canvas, useFrame, useThree, type ThreeEvent } from "@react-three/fiber";
import { OrbitControls } from "@react-three/drei";
import * as THREE from "three";
import { buildModel, rampColor, reset, step, vertexStrain, type Ramp, type SimModel } from "../sim/solver";
import { collapseMatrices, prepareCollapse } from "../fold/animate";
import type { FaceTree, Fold, P2 } from "../types";
import { PAPER_BACK, PAPER_FRONT } from "./PaperScene";

export type SimMode = "physics" | "hinge";

interface Props {
  fold: Fold | null;
  tree: FaceTree | null;
  foldPct: number;
  mode: SimMode;
  strain: boolean;
  ramp: Ramp;
  highlight: P2[];
  onUnstable: () => void;
  onMaxStrain?: (v: number) => void;
  label: string;
}

const STRAIN_SCALE = 0.05; // 5% strain = top of the colour ramp

function PhysicsMesh({ fold, foldPct, strain, ramp, highlight, onUnstable, onMaxStrain, grab }: Omit<Props, "tree" | "mode" | "label"> & {
  fold: Fold;
  grab: React.MutableRefObject<{ vertex: number | null; nudge: [number, number, number] | null }>;
}) {
  const model = useMemo<SimModel>(() => buildModel(fold), [fold]);
  const geom = useMemo(() => {
    const g = new THREE.BufferGeometry();
    g.setAttribute("position", new THREE.BufferAttribute(new Float32Array(model.n * 3), 3));
    g.setAttribute("color", new THREE.BufferAttribute(new Float32Array(model.n * 3), 3));
    g.setIndex(model.tris.flat());
    return g;
  }, [model]);
  const creaseGeom = useMemo(() => {
    const idx: number[] = [];
    fold.edges_vertices.forEach(([a, b], i) => {
      if (fold.edges_assignment[i] !== "F") idx.push(a, b);
    });
    const g = new THREE.BufferGeometry();
    g.setAttribute("position", geom.getAttribute("position"));
    g.setIndex(idx);
    return g;
  }, [fold, geom]);
  const dragPlane = useRef(new THREE.Plane());
  const { camera, controls } = useThree() as unknown as { camera: THREE.Camera; controls: { enabled: boolean } | null };
  const reported = useRef(0);

  useEffect(() => () => geom.dispose(), [geom]);
  useEffect(() => {
    reset(model);
  }, [model]);

  useFrame(() => {
    const g = grab.current;
    if (g.vertex !== null && g.nudge) {
      const i = g.vertex;
      const cur = model.pinned.get(i) ?? [model.pos[i * 3], model.pos[i * 3 + 1], model.pos[i * 3 + 2]];
      model.pinned.set(i, [cur[0] + g.nudge[0], cur[1] + g.nudge[1], cur[2] + g.nudge[2]]);
      g.nudge = null;
    }
    if (!document.hidden && !step(model, foldPct, 30)) {
      onUnstable();
      return;
    }
    const pos = geom.getAttribute("position") as THREE.BufferAttribute;
    for (let i = 0; i < model.n * 3; i++) pos.array[i] = model.pos[i];
    pos.needsUpdate = true;
    const col = geom.getAttribute("color") as THREE.BufferAttribute;
    if (strain) {
      const s = vertexStrain(model);
      let mx = 0;
      for (let i = 0; i < model.n; i++) {
        mx = Math.max(mx, s[i]);
        const [r, gg, b] = rampColor(s[i] / STRAIN_SCALE, ramp);
        col.setXYZ(i, r, gg, b);
      }
      col.needsUpdate = true;
      const now = performance.now();
      if (onMaxStrain && now - reported.current > 400) {
        reported.current = now;
        onMaxStrain(mx);
      }
    }
    geom.computeVertexNormals();
    geom.computeBoundingSphere();
  });

  const nearestVertex = (p: THREE.Vector3) => {
    let best = 0;
    let bd = Infinity;
    for (let i = 0; i < model.n; i++) {
      const d = Math.hypot(model.pos[i * 3] - p.x, model.pos[i * 3 + 1] - p.y, model.pos[i * 3 + 2] - p.z);
      if (d < bd) {
        bd = d;
        best = i;
      }
    }
    return best;
  };

  const onDown = (e: ThreeEvent<PointerEvent>) => {
    e.stopPropagation();
    const local = e.object.worldToLocal(e.point.clone());
    const v = nearestVertex(local);
    if (model.fixed.has(v)) return;
    grab.current.vertex = v;
    const n = new THREE.Vector3();
    camera.getWorldDirection(n);
    dragPlane.current.setFromNormalAndCoplanarPoint(n, e.point);
    (e.target as Element | null)?.setPointerCapture?.(e.pointerId);
    if (controls) controls.enabled = false;
  };
  const onMove = (e: ThreeEvent<PointerEvent>) => {
    const v = grab.current.vertex;
    if (v === null || grab.current.nudge !== null) return;
    if (!(e.buttons & 1)) return;
    const hit = new THREE.Vector3();
    if (e.ray.intersectPlane(dragPlane.current, hit)) {
      const local = e.object.worldToLocal(hit);
      model.pinned.set(v, [local.x, local.y, local.z]);
    }
  };
  const onUp = () => {
    if (grab.current.vertex !== null) model.pinned.delete(grab.current.vertex);
    grab.current.vertex = null;
    if (controls) controls.enabled = true;
  };

  const sel = grab.current.vertex;
  return (
    <group onPointerDown={onDown} onPointerMove={onMove} onPointerUp={onUp} onPointerLeave={onUp}>
      {/* separate meshes (not one material with toggled props): the shader must recompile for vertex colours */}
      {strain ? (
        <mesh key="strain" geometry={geom}>
          <meshStandardMaterial vertexColors side={THREE.DoubleSide} roughness={0.8} />
        </mesh>
      ) : (
        <mesh key="paper" geometry={geom}>
          <meshStandardMaterial color={PAPER_FRONT} side={THREE.FrontSide} roughness={0.85} />
        </mesh>
      )}
      {!strain && (
        <mesh geometry={geom}>
          <meshStandardMaterial color={PAPER_BACK} side={THREE.BackSide} roughness={0.85} />
        </mesh>
      )}
      <lineSegments geometry={creaseGeom}>
        <lineBasicMaterial color="#0e1014" transparent opacity={0.5} />
      </lineSegments>
      {highlight.map(([x, y], i) => {
        const v = model.rest.findIndex((_, k) => k % 3 === 0 && Math.abs(model.rest[k] - x) < 1e-6 && Math.abs(model.rest[k + 1] - y) < 1e-6);
        const j = v >= 0 ? v / 3 : -1;
        if (j < 0) return null;
        return (
          <mesh key={i} position={[model.pos[j * 3], model.pos[j * 3 + 1], model.pos[j * 3 + 2]]}>
            <sphereGeometry args={[0.025, 12, 12]} />
            <meshBasicMaterial color="#ff5d5d" />
          </mesh>
        );
      })}
      {sel !== null && (
        <mesh position={[model.pos[sel * 3], model.pos[sel * 3 + 1], model.pos[sel * 3 + 2]]}>
          <sphereGeometry args={[0.022, 12, 12]} />
          <meshBasicMaterial color="#f5b14c" />
        </mesh>
      )}
    </group>
  );
}

function HingeMesh({ fold, tree, foldPct }: { fold: Fold; tree: FaceTree; foldPct: number }) {
  const c = useMemo(() => prepareCollapse(fold, tree), [fold, tree]);
  const mats = collapseMatrices(c, foldPct);
  return (
    <>
      {c.order.map((f) => {
        const poly = c.polys.get(f) ?? [];
        return <HingeFace key={f} poly={poly} matrix={mats.get(f)!} />;
      })}
    </>
  );
}

function HingeFace({ poly, matrix }: { poly: P2[]; matrix: THREE.Matrix4 }) {
  const geom = useMemo(() => new THREE.ShapeGeometry(new THREE.Shape(poly.map(([x, y]) => new THREE.Vector2(x, y)))), [poly]);
  return (
    <group matrixAutoUpdate={false} matrix={matrix}>
      <mesh geometry={geom}>
        <meshStandardMaterial color={PAPER_FRONT} side={THREE.FrontSide} />
      </mesh>
      <mesh geometry={geom}>
        <meshStandardMaterial color={PAPER_BACK} side={THREE.BackSide} />
      </mesh>
    </group>
  );
}

/** 3D simulator for the Studio. */
export default function SimView(props: Props) {
  const { fold, tree, foldPct, mode, label } = props;
  const grab = useRef<{ vertex: number | null; nudge: [number, number, number] | null }>({ vertex: null, nudge: null });
  const [kbVertex, setKbVertex] = useState<number | null>(null);
  const [kbActive, setKbActive] = useState(false);
  const n = fold?.vertices_coords.length ?? 0;

  // keyboard grab: Enter starts, Tab cycles vertices, arrows/PageUp/PageDown nudge, Escape releases
  const onKey = (e: React.KeyboardEvent) => {
    if (mode !== "physics" || !n) return;
    const NUDGE = 0.03;
    if (!kbActive) {
      if (e.key === "Enter") {
        e.preventDefault();
        setKbActive(true);
        setKbVertex(0);
        grab.current.vertex = 0;
      }
      return;
    }
    const nudge = (d: [number, number, number]) => {
      e.preventDefault();
      grab.current.nudge = d;
    };
    if (e.key === "Tab") {
      e.preventDefault();
      const next = ((kbVertex ?? 0) + (e.shiftKey ? n - 1 : 1)) % n;
      setKbVertex(next);
      grab.current.vertex = next;
    } else if (e.key === "ArrowLeft") nudge([-NUDGE, 0, 0]);
    else if (e.key === "ArrowRight") nudge([NUDGE, 0, 0]);
    else if (e.key === "ArrowUp") nudge([0, NUDGE, 0]);
    else if (e.key === "ArrowDown") nudge([0, -NUDGE, 0]);
    else if (e.key === "PageUp") nudge([0, 0, NUDGE]);
    else if (e.key === "PageDown") nudge([0, 0, -NUDGE]);
    else if (e.key === "Escape") {
      e.preventDefault();
      setKbActive(false);
      setKbVertex(null);
      grab.current.vertex = null;
    }
  };

  return (
    <div
      className="relative h-full w-full focus:outline-none"
      tabIndex={0}
      role="application"
      aria-label={`${label}. Press Enter to grab a vertex with the keyboard; Tab cycles vertices, arrows move, Escape releases.`}
      onKeyDown={onKey}
    >
      <Canvas camera={{ position: [0.5, -1.2, 2.2], fov: 45 }} dpr={[1, 1.75]} gl={{ antialias: true }} aria-hidden>
        <color attach="background" args={["#161920"]} />
        <ambientLight intensity={0.8} />
        <directionalLight position={[2, -2, 5]} intensity={1.1} />
        <directionalLight position={[-3, 2, -4]} intensity={0.45} />
        <gridHelper args={[6, 24, "#2a2f3a", "#1d212b"]} rotation={[Math.PI / 2, 0, 0]} position={[0.5, 0.5, -0.4]} />
        {fold && fold.faces_vertices.length > 0 && mode === "physics" && <PhysicsMesh {...props} fold={fold} grab={grab} />}
        {fold && tree && mode === "hinge" && <HingeMesh fold={fold} tree={tree} foldPct={foldPct} />}
        <OrbitControls makeDefault target={[0.5, 0.5, 0]} enablePan={false} minDistance={1} maxDistance={6} />
      </Canvas>
      {kbActive && (
        <span className="mono absolute left-2 top-2 rounded-md border border-accent bg-panel/90 px-2 py-0.5 text-xs text-accent">
          vertex {kbVertex}
        </span>
      )}
    </div>
  );
}
