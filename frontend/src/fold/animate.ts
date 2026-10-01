import * as THREE from "three";
import type { CompiledStep, FaceTree, Fold, P2, PieceState } from "../types";

export const FOLD_SECONDS = 1.6;
const CREASE_MAX = Math.PI * 0.92;
const COLLAPSE_MAX = Math.PI * 0.98;
export const LAYER_Z = 0.003;

export type P3 = [number, number, number];

export const easeInOut = (t: number) => (t < 0.5 ? 2 * t * t : 1 - Math.pow(-2 * t + 2, 2) / 2);
const clamp01 = (t: number) => Math.min(1, Math.max(0, t));

const side = (p: P2, a: P2, b: P2) => (b[0] - a[0]) * (p[1] - a[1]) - (b[1] - a[1]) * (p[0] - a[0]);

export function centroid(poly: P2[]): P2 {
  const n = poly.length || 1;
  return [poly.reduce((s, p) => s + p[0], 0) / n, poly.reduce((s, p) => s + p[1], 0) / n];
}

/** Rotation about the line through a with direction d (z = 0 plane), right-hand rule. */
export function axisMatrix(a: P2, d: P2, angle: number): THREE.Matrix4 {
  const axis = new THREE.Vector3(d[0], d[1], 0).normalize();
  const m = new THREE.Matrix4().makeTranslation(a[0], a[1], 0);
  m.multiply(new THREE.Matrix4().makeRotationAxis(axis, angle));
  m.multiply(new THREE.Matrix4().makeTranslation(-a[0], -a[1], 0));
  return m;
}

export function hingeMatrix(a: P2, b: P2, angle: number): THREE.Matrix4 {
  return axisMatrix(a, [b[0] - a[0], b[1] - a[1]], angle);
}

// ------------------------------------------------------------------ collapse (hinge method)

export interface Collapse {
  order: number[];
  depth: Map<number, number>;
  parent: Map<number, number>;
  hinge: Map<number, [P2, P2, number]>; // axis a→b with the child on its left, sign (+1 valley)
  polys: Map<number, P2[]>;
}

export function prepareCollapse(fold: Fold, tree: FaceTree): Collapse {
  const coords = fold.vertices_coords;
  const polys = new Map<number, P2[]>();
  fold.faces_vertices.forEach((f, i) => polys.set(i, f.map((v) => coords[v])));
  const order: number[] = [];
  const depth = new Map<number, number>();
  const parent = new Map<number, number>();
  const hinge = new Map<number, [P2, P2, number]>();
  for (const node of tree.nodes) {
    order.push(node.face);
    parent.set(node.face, node.parent);
    depth.set(node.face, node.parent === -1 ? 0 : (depth.get(node.parent) ?? 0) + 1);
    if (node.parent !== -1 && node.hinge_edge >= 0) {
      const [u, v] = fold.edges_vertices[node.hinge_edge];
      let a = coords[u];
      let b = coords[v];
      if (side(centroid(polys.get(node.face) ?? []), a, b) < 0) [a, b] = [b, a];
      hinge.set(node.face, [a, b, node.sign]);
    }
  }
  return { order, depth, parent, hinge, polys };
}

/** Face transforms at fold amount t ∈ [0,1] (every crease folds simultaneously). */
export function collapseMatrices(c: Collapse, t: number): Map<number, THREE.Matrix4> {
  const mats = new Map<number, THREE.Matrix4>();
  for (const f of c.order) {
    const p = c.parent.get(f) ?? -1;
    const base = p === -1 ? new THREE.Matrix4() : (mats.get(p) ?? new THREE.Matrix4()).clone();
    const h = c.hinge.get(f);
    if (h && h[2] !== 0) base.multiply(hingeMatrix(h[0], h[1], h[2] * t * COLLAPSE_MAX));
    base.premultiply(new THREE.Matrix4().makeTranslation(0, 0, (c.depth.get(f) ?? 0) * LAYER_Z * t));
    mats.set(f, base);
  }
  return mats;
}

// ------------------------------------------------------------------ player steps

export interface DrawPiece {
  key: string;
  poly: P2[];
  faceUp: boolean;
  matrix: THREE.Matrix4;
}

function flat(p: PieceState, prefix: string): DrawPiece {
  return {
    key: `${prefix}${p.id}`,
    poly: p.poly,
    faceUp: p.face_up,
    matrix: new THREE.Matrix4().makeTranslation(0, 0, p.layer * LAYER_Z),
  };
}

/**
 * Pieces to draw for a compiled step at progress t ∈ [0,1].
 * At t = 1 every op shows its `state_after`.
 */
export function stepPieces(step: CompiledStep, t: number, collapse?: Collapse | null): DrawPiece[] {
  t = clamp01(t);
  const e = easeInOut(t);
  const after = () => step.state_after.map((p) => flat(p, "a"));
  switch (step.op) {
    case "fold": {
      if (t >= 1 || !step.axis) return after();
      const ang = step.direction * Math.PI * e;
      const top = Math.max(...step.pieces_before.map((p) => p.layer)) + 1;
      return step.pieces_before.map((p) => {
        const d = flat(p, "b");
        if (p.moving) {
          // lift moving pieces above the stack (valley) or below it (mountain) while they swing
          const z = step.direction > 0 ? top * LAYER_Z : -LAYER_Z;
          d.matrix = axisMatrix(step.axis!.p, step.axis!.d, ang).multiply(new THREE.Matrix4().makeTranslation(0, 0, z));
        }
        return d;
      });
    }
    case "crease": {
      if (t >= 1 || !step.axis) return after();
      const ang = step.direction * CREASE_MAX * Math.sin(Math.PI * t);
      return step.pieces_before.map((p) => {
        const d = flat(p, "b");
        if (p.moving) d.matrix = axisMatrix(step.axis!.p, step.axis!.d, ang).multiply(d.matrix);
        return d;
      });
    }
    case "turn_over": {
      if (t >= 1 || !step.axis) return after();
      const m = axisMatrix(step.axis.p, step.axis.d, Math.PI * e);
      return step.pieces_before.map((p) => {
        const d = flat(p, "b");
        d.matrix = m.clone().multiply(d.matrix);
        return d;
      });
    }
    case "rotate": {
      if (t >= 1) return after();
      const c = step.center ?? [0.5, 0.5];
      const m = new THREE.Matrix4()
        .makeTranslation(c[0], c[1], 0)
        .multiply(new THREE.Matrix4().makeRotationZ(((step.rotate_deg ?? 0) * Math.PI * e) / 180))
        .multiply(new THREE.Matrix4().makeTranslation(-c[0], -c[1], 0));
      return step.pieces_before.map((p) => {
        const d = flat(p, "b");
        d.matrix = m.clone().multiply(d.matrix);
        return d;
      });
    }
    case "collapse": {
      if (t >= 1 || !collapse || !step.collapse) return after();
      const mats = collapseMatrices(collapse, e);
      return collapse.order.map((f) => ({
        key: `c${f}`,
        poly: collapse.polys.get(f) ?? [],
        faceUp: step.pieces_before[0]?.face_up ?? true,
        matrix: mats.get(f)!,
      }));
    }
    case "unfold":
      return t < 0.5 ? step.pieces_before.map((p) => flat(p, "b")) : after();
    default:
      return after();
  }
}

/** Bounding box of a step's before/after states, so the camera frame does not jump. */
export function stepBounds(step: CompiledStep): [number, number, number, number] {
  const pts = [...step.pieces_before, ...step.state_after].flatMap((p) => p.poly);
  const xs = pts.map((p) => p[0]);
  const ys = pts.map((p) => p[1]);
  return [Math.min(...xs), Math.min(...ys), Math.max(...xs), Math.max(...ys)];
}
