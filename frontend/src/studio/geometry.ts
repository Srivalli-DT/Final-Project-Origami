import type { Fold, P2 } from "../types";

export type Kind = "M" | "V" | "F";

export interface Seg {
  a: P2;
  b: P2;
  asg: Kind;
}

export const EPS = 1e-9;
const SNAP_R = 0.03;
const ANGLE_SNAP_DEG = 4;

export const dist = (p: P2, q: P2) => Math.hypot(p[0] - q[0], p[1] - q[1]);

export function segIntersect(a: P2, b: P2, c: P2, d: P2): P2 | null {
  const r: P2 = [b[0] - a[0], b[1] - a[1]];
  const s: P2 = [d[0] - c[0], d[1] - c[1]];
  const den = r[0] * s[1] - r[1] * s[0];
  if (Math.abs(den) < EPS) return null;
  const qp: P2 = [c[0] - a[0], c[1] - a[1]];
  const t = (qp[0] * s[1] - qp[1] * s[0]) / den;
  const u = (qp[0] * r[1] - qp[1] * r[0]) / den;
  if (t < -1e-6 || t > 1 + 1e-6 || u < -1e-6 || u > 1 + 1e-6) return null;
  return [a[0] + t * r[0], a[1] + t * r[1]];
}

export function pointSegDist(p: P2, a: P2, b: P2): number {
  const dx = b[0] - a[0];
  const dy = b[1] - a[1];
  const L2 = dx * dx + dy * dy;
  const t = L2 < EPS ? 0 : Math.max(0, Math.min(1, ((p[0] - a[0]) * dx + (p[1] - a[1]) * dy) / L2));
  return Math.hypot(p[0] - (a[0] + t * dx), p[1] - (a[1] + t * dy));
}

const BORDER: [P2, P2][] = [
  [[0, 0], [1, 0]],
  [[1, 0], [1, 1]],
  [[1, 1], [0, 1]],
  [[0, 1], [0, 0]],
];

/** Snap candidates: grid points, crease endpoints and every crossing. */
export function snapPoints(segs: Seg[], grid: number): P2[] {
  const pts: P2[] = [];
  for (let i = 0; i <= grid; i++) for (let j = 0; j <= grid; j++) pts.push([i / grid, j / grid]);
  const all: [P2, P2][] = [...BORDER, ...segs.map((s) => [s.a, s.b] as [P2, P2])];
  for (const s of segs) pts.push(s.a, s.b);
  for (let i = 0; i < all.length; i++)
    for (let j = i + 1; j < all.length; j++) {
      const x = segIntersect(all[i][0], all[i][1], all[j][0], all[j][1]);
      if (x) pts.push(x);
    }
  return pts;
}

export function nearest(p: P2, pts: P2[], r = SNAP_R): P2 | null {
  let best: P2 | null = null;
  let bd = r;
  for (const q of pts) {
    const d = dist(p, q);
    if (d < bd) {
      bd = d;
      best = q;
    }
  }
  return best;
}

/** Snap the end point of a line: to a candidate point, else to a 22.5° direction from the start. */
export function snapEnd(start: P2, p: P2, pts: P2[]): P2 {
  const hit = nearest(p, pts);
  if (hit) return hit;
  const ang = Math.atan2(p[1] - start[1], p[0] - start[0]);
  const step = Math.PI / 8;
  const k = Math.round(ang / step) * step;
  if (Math.abs(ang - k) < (ANGLE_SNAP_DEG * Math.PI) / 180) {
    const L = dist(start, p);
    const q: P2 = [start[0] + L * Math.cos(k), start[1] + L * Math.sin(k)];
    // stop where the snapped ray meets the paper edge or a crease, if close
    return nearest(q, pts, SNAP_R) ?? clampToSquare(q);
  }
  return clampToSquare(p);
}

export const clampToSquare = (p: P2): P2 => [Math.min(1, Math.max(0, p[0])), Math.min(1, Math.max(0, p[1]))];

/** Clip the infinite line (p, d) to the unit square. */
export function clipLine(p: P2, d: P2): [P2, P2] | null {
  let t0 = -1e9;
  let t1 = 1e9;
  for (const [pk, qk] of [
    [-d[0], p[0]],
    [d[0], 1 - p[0]],
    [-d[1], p[1]],
    [d[1], 1 - p[1]],
  ]) {
    if (Math.abs(pk) < EPS) {
      if (qk < 0) return null;
      continue;
    }
    const t = qk / pk;
    if (pk < 0) t0 = Math.max(t0, t);
    else t1 = Math.min(t1, t);
  }
  if (t0 > t1) return null;
  return [
    [p[0] + t0 * d[0], p[1] + t0 * d[1]],
    [p[0] + t1 * d[0], p[1] + t1 * d[1]],
  ];
}

/** Axiom 2: the fold that puts p onto q. */
export function pointToPoint(p: P2, q: P2): [P2, P2] | null {
  if (dist(p, q) < EPS) return null;
  const m: P2 = [(p[0] + q[0]) / 2, (p[1] + q[1]) / 2];
  return clipLine(m, [-(q[1] - p[1]), q[0] - p[0]]);
}

/** Axiom 3: the fold that puts line l1 onto line l2 (the bisector between them). */
export function lineToLine(l1: [P2, P2], l2: [P2, P2]): [P2, P2] | null {
  const u = (l: [P2, P2]): P2 => {
    const dx = l[1][0] - l[0][0];
    const dy = l[1][1] - l[0][1];
    const L = Math.hypot(dx, dy);
    return [dx / L, dy / L];
  };
  const d1 = u(l1);
  let d2 = u(l2);
  const cross = d1[0] * d2[1] - d1[1] * d2[0];
  if (Math.abs(cross) < 1e-9) {
    const m: P2 = [(l1[0][0] + l2[0][0]) / 2, (l1[0][1] + l2[0][1]) / 2];
    return clipLine(m, d1);
  }
  const qp: P2 = [l2[0][0] - l1[0][0], l2[0][1] - l1[0][1]];
  const t = (qp[0] * d2[1] - qp[1] * d2[0]) / cross;
  const x: P2 = [l1[0][0] + t * d1[0], l1[0][1] + t * d1[1]];
  if (d1[0] * d2[0] + d1[1] * d2[1] < 0) d2 = [-d2[0], -d2[1]];
  return clipLine(x, [d1[0] + d2[0], d1[1] + d2[1]]);
}

/** The editor's segments as FOLD (the server splits and merges them). */
export function segsToFold(segs: Seg[]): Fold {
  const coords: P2[] = [];
  const edges: [number, number][] = [];
  const asg: Fold["edges_assignment"] = [];
  for (const s of segs) {
    if (dist(s.a, s.b) < 1e-6) continue;
    coords.push(s.a, s.b);
    edges.push([coords.length - 2, coords.length - 1]);
    asg.push(s.asg);
  }
  return { vertices_coords: coords, edges_vertices: edges, edges_assignment: asg, faces_vertices: [] };
}

/** Non-boundary edges of any FOLD as editor segments (coordinates scaled into the unit square). */
export function foldToSegs(fold: Fold): Seg[] {
  const xs = fold.vertices_coords.map((p) => p[0]);
  const ys = fold.vertices_coords.map((p) => p[1]);
  const minX = Math.min(...xs, 0);
  const minY = Math.min(...ys, 0);
  const span = Math.max(Math.max(...xs) - minX, Math.max(...ys) - minY, 1);
  const f = (p: P2): P2 => [(p[0] - minX) / span, (p[1] - minY) / span];
  const out: Seg[] = [];
  fold.edges_vertices.forEach(([a, b], i) => {
    const asg = fold.edges_assignment[i];
    if (asg === "M" || asg === "V" || asg === "F") out.push({ a: f(fold.vertices_coords[a]), b: f(fold.vertices_coords[b]), asg });
  });
  return out;
}
