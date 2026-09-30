import { forwardRef, useMemo, useRef } from "react";
import { Canvas, useFrame } from "@react-three/fiber";
import { OrbitControls } from "@react-three/drei";
import * as THREE from "three";
import type { Piece } from "../fold/animate";

const FRONT = "#f5e6c8";
const BACK = "#c0392b";

interface Props {
  /** Called every frame; returns the paper pieces to draw. */
  getPieces: () => Piece[];
}

function triangulate(n: number): number[] {
  const idx: number[] = [];
  for (let i = 1; i < n - 1; i++) idx.push(0, i, i + 1);
  return idx;
}

function PaperPiece({ index, getPieces }: { index: number; getPieces: () => Piece[] }) {
  const geom = useMemo(() => new THREE.BufferGeometry(), []);
  const outline = useMemo(() => new THREE.BufferGeometry(), []);
  const count = useRef(-1);
  useFrame(() => {
    const piece = getPieces()[index];
    if (!piece) return;
    const n = piece.pts.length;
    if (n !== count.current) {
      const attr = new THREE.BufferAttribute(new Float32Array(n * 3), 3);
      geom.setAttribute("position", attr);
      geom.setIndex(triangulate(n));
      outline.setAttribute("position", attr);
      count.current = n;
    }
    const pos = geom.getAttribute("position") as THREE.BufferAttribute;
    piece.pts.forEach((p, i) => pos.setXYZ(i, p[0], p[1], p[2]));
    pos.needsUpdate = true;
    geom.computeVertexNormals();
    geom.computeBoundingSphere();
    outline.computeBoundingSphere();
  });
  return (
    <group>
      <mesh geometry={geom}>
        <meshStandardMaterial color={FRONT} side={THREE.FrontSide} roughness={0.9} />
      </mesh>
      <mesh geometry={geom}>
        <meshStandardMaterial color={BACK} side={THREE.BackSide} roughness={0.9} />
      </mesh>
      <lineLoop geometry={outline}>
        <lineBasicMaterial color="#8a7f6e" transparent opacity={0.45} />
      </lineLoop>
    </group>
  );
}

function Pieces({ getPieces }: Props) {
  // The number of pieces only changes between steps; the parent re-keys on step change.
  const n = getPieces().length;
  return (
    <group position={[-1, -1, 0]} scale={2}>
      {Array.from({ length: n }, (_, i) => (
        <PaperPiece key={i} index={i} getPieces={getPieces} />
      ))}
    </group>
  );
}

const FoldScene = forwardRef<HTMLCanvasElement, Props & { stepKey: string }>(function FoldScene(
  { getPieces, stepKey },
  ref,
) {
  return (
    <Canvas
      ref={ref}
      camera={{ position: [0, -2.2, 3.2], fov: 45 }}
      gl={{ preserveDrawingBuffer: true, antialias: true }}
      dpr={[1, 1.5]}
    >
      <color attach="background" args={["#efe9dd"]} />
      <ambientLight intensity={0.7} />
      <directionalLight position={[2, -3, 5]} intensity={1.1} />
      <directionalLight position={[-2, 3, -4]} intensity={0.5} />
      <Pieces key={stepKey} getPieces={getPieces} />
      <OrbitControls enablePan={false} minDistance={1.5} maxDistance={8} />
    </Canvas>
  );
});

export default FoldScene;
