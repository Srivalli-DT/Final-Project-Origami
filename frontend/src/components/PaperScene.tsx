import { forwardRef, useMemo } from "react";
import { Canvas } from "@react-three/fiber";
import { OrbitControls } from "@react-three/drei";
import * as THREE from "three";
import type { DrawPiece } from "../fold/animate";
import type { P2 } from "../types";

export const PAPER_FRONT = "#e2553f";
export const PAPER_BACK = "#f3e6cc";

function PieceMesh({ piece }: { piece: DrawPiece }) {
  const geom = useMemo(() => {
    const shape = new THREE.Shape(piece.poly.map(([x, y]) => new THREE.Vector2(x, y)));
    return new THREE.ShapeGeometry(shape);
  }, [piece.poly]);
  const edges = useMemo(() => {
    const g = new THREE.BufferGeometry().setFromPoints(piece.poly.map(([x, y]) => new THREE.Vector3(x, y, 0)));
    return g;
  }, [piece.poly]);
  // ShapeGeometry always faces +z; the coloured side faces +z when the piece is face up
  const front = piece.faceUp ? PAPER_FRONT : PAPER_BACK;
  const back = piece.faceUp ? PAPER_BACK : PAPER_FRONT;
  return (
    <group matrixAutoUpdate={false} matrix={piece.matrix}>
      <mesh geometry={geom}>
        <meshStandardMaterial color={front} side={THREE.FrontSide} roughness={0.85} polygonOffset polygonOffsetFactor={1} />
      </mesh>
      <mesh geometry={geom}>
        <meshStandardMaterial color={back} side={THREE.BackSide} roughness={0.85} polygonOffset polygonOffsetFactor={1} />
      </mesh>
      <lineLoop geometry={edges}>
        <lineBasicMaterial color="#0e1014" transparent opacity={0.55} />
      </lineLoop>
    </group>
  );
}

function AxisLine({ axis, active }: { axis: { p: P2; d: P2 }; active: boolean }) {
  const geom = useMemo(() => {
    const [px, py] = axis.p;
    const [dx, dy] = axis.d;
    const L = 3;
    return new THREE.BufferGeometry().setFromPoints([
      new THREE.Vector3(px - dx * L, py - dy * L, 0.02),
      new THREE.Vector3(px + dx * L, py + dy * L, 0.02),
    ]);
  }, [axis]);
  return (
    <lineSegments geometry={geom}>
      <lineBasicMaterial color={active ? "#f5b14c" : "#8a92a6"} transparent opacity={active ? 1 : 0.35} />
    </lineSegments>
  );
}

interface Props {
  pieces: DrawPiece[];
  bounds: [number, number, number, number];
  axis?: { p: P2; d: P2 } | null;
  axisActive?: boolean;
  onAxisHover?: (on: boolean) => void;
  tilt?: boolean;
  label: string;
}

/** 3D view of the paper: grid floor, soft key light, orbit controls. */
const PaperScene = forwardRef<HTMLCanvasElement, Props>(function PaperScene(
  { pieces, bounds, axis, axisActive = false, onAxisHover, tilt = false, label },
  ref,
) {
  const [x0, y0, x1, y1] = bounds;
  const cx = (x0 + x1) / 2;
  const cy = (y0 + y1) / 2;
  const span = Math.max(x1 - x0, y1 - y0, 0.3);
  const scale = 2 / span;
  return (
    <div role="img" aria-label={label} className="h-full w-full">
      <Canvas
        ref={ref}
        camera={{ position: [0, -1.6, 3.4], fov: 42 }}
        gl={{ antialias: true, preserveDrawingBuffer: true }}
        dpr={[1, 1.75]}
        aria-hidden
      >
        <color attach="background" args={["#161920"]} />
        <ambientLight intensity={0.85} />
        <directionalLight position={[2, -2, 5]} intensity={1.15} />
        <directionalLight position={[-3, 2, -4]} intensity={0.45} />
        <gridHelper args={[8, 32, "#2a2f3a", "#1d212b"]} rotation={[Math.PI / 2, 0, 0]} position={[0, 0, -0.35]} />
        <group rotation={tilt ? [-0.55, 0.35, 0] : [0, 0, 0]}>
          <group scale={scale} position={[-cx * scale, -cy * scale, 0]}>
            {pieces.map((p) => (
              <PieceMesh key={p.key} piece={p} />
            ))}
            {axis && (
              <group onPointerOver={() => onAxisHover?.(true)} onPointerOut={() => onAxisHover?.(false)}>
                <AxisLine axis={axis} active={axisActive} />
              </group>
            )}
          </group>
        </group>
        <OrbitControls enablePan={false} minDistance={1.8} maxDistance={9} />
      </Canvas>
    </div>
  );
});

export default PaperScene;
