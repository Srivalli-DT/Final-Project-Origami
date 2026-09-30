import * as THREE from "three";
import type { Fold, Guide, Step } from "../types";

/** Fallback: interpolate every vertex from the crease pattern to the flat-folded state. */
export const USE_LERP = false;

export const STEP_DURATION = 2.5; // seconds
const MAX_ANGLE = Math.PI * 0.98;
const Z_STEP = 0.002;

type P2 = [number, number];
export type P3 = [number, number, number];

/** A flat polygon of paper, already positioned in 3D (CP units, z toward the viewer). */
export interface Piece {
  pts: P3[];
}

export const easeInOut = (t: number) => (t < 0.5 ? 2 * t * t : 1 - Math.pow(-2 * t + 2, 2) / 2);

/** 0 → 1 → 0: fold, then unfold. */
export const foldUnfold = (t: number) => Math.sin(Math.PI * Math.min(1, Math.max(0, t)));

// ------------------------------------------------------------------ geometry helpers

const SQUARE: P2[] = [
  [0, 0],
  [1, 0],
  [1, 1],
  [0, 1],
];

const side = (p: P2, a: P2, b: P2) => (b[0] - a[0]) * (p[1] - a[1]) - (b[1] - a[1]) * (p[0] - a[0]);

/** Sutherland–Hodgman: keep the part of `poly` on the left of a→b. */
export function clipLeft(poly: P2[], a: P2, b: P2): P2[] {
  const out: P2[] = [];
  for (let i = 0; i < poly.length; i++) {
    const p = poly[i];
    const q = poly[(i + 1) % poly.length];
    const sp = side(p, a, b);
    const sq = side(q, a, b);
    if (sp >= 0) out.push(p);
    if ((sp >= 0) !== (sq >= 0)) {
      const t = sp / (sp - sq);
      out.push([p[0] + t * (q[0] - p[0]), p[1] + t * (q[1] - p[1])]);
    }
  }
  return out;
}

export function area(poly: P2[]): number {
  let s = 0;
  for (let i = 0; i < poly.length; i++) {
    const [x1, y1] = poly[i];
    const [x2, y2] = poly[(i + 1) % poly.length];
    s += x1 * y2 - x2 * y1;
  }
  return s / 2;
}

export function centroid(poly: P2[]): P2 {
  const n = poly.length || 1;
  return [poly.reduce((s, p) => s + p[0], 0) / n, poly.reduce((s, p) => s + p[1], 0) / n];
}

/** Rotation about the line a→b (in the z=0 plane) by `angle`, right-hand rule. */
export function hingeMatrix(a: P2, b: P2, angle: number): THREE.Matrix4 {
  const axis = new THREE.Vector3(b[0] - a[0], b[1] - a[1], 0).normalize();
  const m = new THREE.Matrix4().makeTranslation(a[0], a[1], 0);
  m.multiply(new THREE.Matrix4().makeRotationAxis(axis, angle));
  m.multiply(new THREE.Matrix4().makeTranslation(-a[0], -a[1], 0));
  return m;
}

function transform(poly: P2[], m: THREE.Matrix4, zOffset = 0): P3[] {
  const v = new THREE.Vector3();
  return poly.map(([x, y]) => {
    v.set(x, y, 0).applyMatrix4(m);
    return [v.x, v.y, v.z + zOffset] as P3;
  });
}

const flat = (poly: P2[]): Piece => ({ pts: poly.map(([x, y]) => [x, y, 0] as P3) });

// ------------------------------------------------------------------ single line (reference / precrease)

/**
 * Two-piece fold along one line. The smaller piece moves (ties: the lower, then
 * leftmost piece), matching step text like "bottom edge to top edge".
 */
export function lineFoldPieces(step: Step, t: number): Piece[] {
  if (!step.line) return [flat(SQUARE)];
  const [a, b] = step.line as [P2, P2];
  const left = clipLeft(SQUARE, a, b);
  const right = clipLeft(SQUARE, b, a);
  if (left.length < 3 || right.length < 3) return [flat(SQUARE)];
  const al = Math.abs(area(left));
  const ar = Math.abs(area(right));
  let moveLeft: boolean;
  if (Math.abs(al - ar) > 1e-6) moveLeft = al < ar;
  else {
    const [cl, cr] = [centroid(left), centroid(right)];
    moveLeft = Math.abs(cl[1] - cr[1]) > 1e-6 ? cl[1] < cr[1] : cl[0] < cr[0];
  }
  const sign = step.assignment === "M" ? -1 : 1;
  const angle = sign * MAX_ANGLE * foldUnfold(t);
  // the moving piece must be on the left of the axis for +angle to lift it toward +z
  const m = moveLeft ? hingeMatrix(a, b, angle) : hingeMatrix(b, a, angle);
  const fixed = moveLeft ? right : left;
  const moving = moveLeft ? left : right;
  return [flat(fixed), { pts: transform(moving, m, Z_STEP) }];
}

// ------------------------------------------------------------------ collapse (hinge method)

export interface Collapse {
  order: number[]; // faces in BFS order
  depth: Map<number, number>;
  parent: Map<number, number>;
  hinge: Map<number, [P2, P2, number]>; // axis a→b with the child on the left, sign
  polys: Map<number, P2[]>;
}

export function prepareCollapse(fold: Fold, guide: Guide): Collapse {
  const coords = fold.vertices_coords as P2[];
  const polys = new Map<number, P2[]>();
  guide.faces.forEach((f, i) => polys.set(i, f.map((v) => coords[v])));
  const order: number[] = [];
  const depth = new Map<number, number>();
  const parent = new Map<number, number>();
  const hinge = new Map<number, [P2, P2, number]>();
  for (const node of guide.face_tree.nodes) {
    order.push(node.face);
    parent.set(node.face, node.parent);
    depth.set(node.face, node.parent === -1 ? 0 : (depth.get(node.parent) ?? 0) + 1);
    if (node.parent !== -1 && node.hinge_edge >= 0) {
      const [u, v] = fold.edges_vertices[node.hinge_edge];
      let a = coords[u];
      let b = coords[v];
      const c = centroid(polys.get(node.face) ?? []);
      if (side(c, a, b) < 0) [a, b] = [b, a];
      hinge.set(node.face, [a, b, node.sign]);
    }
  }
  return { order, depth, parent, hinge, polys };
}

export function collapsePieces(c: Collapse, t: number): Piece[] {
  const mats = new Map<number, THREE.Matrix4>();
  const pieces: Piece[] = [];
  for (const f of c.order) {
    const p = c.parent.get(f) ?? -1;
    const base = p === -1 ? new THREE.Matrix4() : (mats.get(p) ?? new THREE.Matrix4()).clone();
    const h = c.hinge.get(f);
    if (h && h[2] !== 0) base.multiply(hingeMatrix(h[0], h[1], h[2] * t * MAX_ANGLE));
    mats.set(f, base);
    pieces.push({ pts: transform(c.polys.get(f) ?? [], base, (c.depth.get(f) ?? 0) * Z_STEP) });
  }
  return pieces;
}

export function lerpPieces(fold: Fold, guide: Guide, c: Collapse, t: number): Piece[] {
  const coords = fold.vertices_coords as P2[];
  const folded = guide.folded_coords as P2[];
  const lift = Math.sin(Math.PI * t) * 0.05;
  return c.order.map((f) => {
    const d = c.depth.get(f) ?? 0;
    return {
      pts: guide.faces[f].map((v) => {
        const [x0, y0] = coords[v];
        const [x1, y1] = folded[v] ?? coords[v];
        return [x0 + (x1 - x0) * t, y0 + (y1 - y0) * t, d * (lift + Z_STEP)] as P3;
      }),
    };
  });
}

/** Pieces to draw for `step` at progress t ∈ [0,1]. */
export function piecesForStep(fold: Fold, guide: Guide, c: Collapse, step: Step, t: number): Piece[] {
  const e = easeInOut(t);
  if (step.kind === "collapse") {
    return USE_LERP ? lerpPieces(fold, guide, c, e) : collapsePieces(c, e);
  }
  if (step.kind === "assembly") {
    return USE_LERP ? lerpPieces(fold, guide, c, 1) : collapsePieces(c, 1);
  }
  return lineFoldPieces(step, e);
}
