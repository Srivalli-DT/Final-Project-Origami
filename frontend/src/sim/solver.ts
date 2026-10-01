/**
 * Bar-and-hinge origami simulation (after Ghassaei, Demaine & Gershenfeld, 7OSME 2018).
 *
 * - Particles are the crease-pattern vertices (unit mass).
 * - Axial bars on every triangle edge keep lengths (stiff springs).
 * - Crease hinges on M/V edges drive the dihedral angle to ±fold% × π (valley +, toward +z).
 * - Facet hinges on triangulation edges and flat lines keep faces planar (target 0).
 * - Dihedral forces use the standard four-vertex hinge gradient (Bridson et al. 2003).
 * - Integration is explicit (semi-implicit Euler) with velocity damping and many substeps.
 */
import * as THREE from "three";
import type { Fold } from "../types";

export interface Hinge {
  p1: number; // hinge edge
  p2: number;
  p3: number; // opposite vertex in triangle A
  p4: number; // opposite vertex in triangle B
  sign: number; // +1 valley, -1 mountain, 0 facet
  k: number;
}

export interface Bar {
  a: number;
  b: number;
  L0: number;
}

export interface SimModel {
  n: number;
  rest: Float64Array; // n*3
  pos: Float64Array;
  vel: Float64Array;
  force: Float64Array;
  bars: Bar[];
  hinges: Hinge[];
  tris: [number, number, number][];
  fixed: Set<number>;
  pinned: Map<number, [number, number, number]>;
  stable: boolean;
}

export const PARAMS = {
  axial: 80,
  crease: 0.7,
  facet: 4,
  damping: 0.06,
  dt: 0.02,
};

const key = (a: number, b: number) => (a < b ? `${a},${b}` : `${b},${a}`);

/** Triangulate every face (handles non-convex faces) and build bars and hinges. */
export function buildModel(fold: Fold): SimModel {
  const n = fold.vertices_coords.length;
  const rest = new Float64Array(n * 3);
  fold.vertices_coords.forEach(([x, y], i) => {
    rest[i * 3] = x;
    rest[i * 3 + 1] = y;
  });
  const asgByEdge = new Map<string, string>();
  fold.edges_vertices.forEach(([a, b], i) => asgByEdge.set(key(a, b), fold.edges_assignment[i]));

  const tris: [number, number, number][] = [];
  for (const face of fold.faces_vertices) {
    if (face.length < 3) continue;
    const contour = face.map((v) => new THREE.Vector2(fold.vertices_coords[v][0], fold.vertices_coords[v][1]));
    for (const [a, b, c] of THREE.ShapeUtils.triangulateShape(contour, [])) {
      tris.push([face[a], face[b], face[c]]);
    }
  }

  const edgeTris = new Map<string, { a: number; b: number; opp: number[] }>();
  for (const [a, b, c] of tris) {
    for (const [u, v, w] of [
      [a, b, c],
      [b, c, a],
      [c, a, b],
    ] as const) {
      const k = key(u, v);
      const e = edgeTris.get(k) ?? { a: u, b: v, opp: [] };
      e.opp.push(w);
      edgeTris.set(k, e);
    }
  }

  const bars: Bar[] = [];
  const hinges: Hinge[] = [];
  for (const [k, e] of edgeTris) {
    const dx = rest[e.b * 3] - rest[e.a * 3];
    const dy = rest[e.b * 3 + 1] - rest[e.a * 3 + 1];
    const L0 = Math.hypot(dx, dy);
    bars.push({ a: e.a, b: e.b, L0 });
    if (e.opp.length !== 2) continue;
    const asg = asgByEdge.get(k);
    if (asg === "C") continue; // cuts do not connect
    const sign = asg === "V" ? 1 : asg === "M" ? -1 : 0;
    // orient so p3 lies left of p1→p2 (normals then agree in the flat state)
    let [p1, p2] = [e.a, e.b];
    let [p3, p4] = e.opp;
    const side = (p: number) =>
      (rest[p2 * 3] - rest[p1 * 3]) * (rest[p * 3 + 1] - rest[p1 * 3 + 1]) -
      (rest[p2 * 3 + 1] - rest[p1 * 3 + 1]) * (rest[p * 3] - rest[p1 * 3]);
    if (side(p3) < 0) [p3, p4] = [p4, p3];
    if (side(p3) < 0) [p1, p2] = [p2, p1];
    hinges.push({ p1, p2, p3, p4, sign, k: (sign ? PARAMS.crease : PARAMS.facet) * L0 });
  }

  // pin the first face so the model cannot drift or spin
  const fixed = new Set<number>(fold.faces_vertices[0] ?? tris[0] ?? []);
  return {
    n,
    rest,
    pos: Float64Array.from(rest),
    vel: new Float64Array(n * 3),
    force: new Float64Array(n * 3),
    bars,
    hinges,
    tris,
    fixed,
    pinned: new Map(),
    stable: true,
  };
}

// ------------------------------------------------------------------ vector helpers (on flat arrays)

const sub = (P: Float64Array, i: number, j: number): [number, number, number] => [
  P[i * 3] - P[j * 3],
  P[i * 3 + 1] - P[j * 3 + 1],
  P[i * 3 + 2] - P[j * 3 + 2],
];
const cross = (a: number[], b: number[]): [number, number, number] => [
  a[1] * b[2] - a[2] * b[1],
  a[2] * b[0] - a[0] * b[2],
  a[0] * b[1] - a[1] * b[0],
];
const dot = (a: number[], b: number[]) => a[0] * b[0] + a[1] * b[1] + a[2] * b[2];
const norm = (a: number[]) => Math.hypot(a[0], a[1], a[2]);

/** Signed dihedral angle of a hinge: positive when folded toward +z (valley). */
export function dihedral(P: Float64Array, h: Hinge): number {
  const N1 = cross(sub(P, h.p3, h.p1), sub(P, h.p3, h.p2));
  const N2 = cross(sub(P, h.p4, h.p2), sub(P, h.p4, h.p1));
  const E = sub(P, h.p2, h.p1);
  const l1 = norm(N1);
  const l2 = norm(N2);
  const lE = norm(E);
  if (l1 < 1e-12 || l2 < 1e-12 || lE < 1e-12) return 0;
  const n1 = N1.map((v) => v / l1);
  const n2 = N2.map((v) => v / l2);
  const e = E.map((v) => v / lE);
  return -Math.atan2(dot(cross(n1, n2), e), dot(n1, n2));
}

function addForce(F: Float64Array, i: number, s: number, v: number[]) {
  F[i * 3] += s * v[0];
  F[i * 3 + 1] += s * v[1];
  F[i * 3 + 2] += s * v[2];
}

function computeForces(m: SimModel, foldPct: number) {
  const P = m.pos;
  const F = m.force;
  F.fill(0);
  for (const b of m.bars) {
    const d = sub(P, b.b, b.a);
    const L = norm(d);
    if (L < 1e-12) continue;
    const f = (PARAMS.axial * (L - b.L0)) / b.L0 / L;
    addForce(F, b.a, f, d);
    addForce(F, b.b, -f, d);
  }
  for (const h of m.hinges) {
    const target = h.sign * foldPct * Math.PI;
    const theta = dihedral(P, h);
    let err = theta - target;
    // wrap so a hinge near ±π does not snap the wrong way
    if (err > Math.PI) err -= 2 * Math.PI;
    if (err < -Math.PI) err += 2 * Math.PI;
    if (Math.abs(err) < 1e-9) continue;
    const N1 = cross(sub(P, h.p3, h.p1), sub(P, h.p3, h.p2));
    const N2 = cross(sub(P, h.p4, h.p2), sub(P, h.p4, h.p1));
    const E = sub(P, h.p2, h.p1);
    const l1 = dot(N1, N1);
    const l2 = dot(N2, N2);
    const lE = norm(E);
    if (l1 < 1e-16 || l2 < 1e-16 || lE < 1e-12) continue;
    const e = E.map((v) => v / lE);
    const u3 = N1.map((v) => (lE * v) / l1);
    const u4 = N2.map((v) => (lE * v) / l2);
    const a31 = dot(sub(P, h.p3, h.p2), e);
    const a41 = dot(sub(P, h.p4, h.p2), e);
    const a32 = dot(sub(P, h.p3, h.p1), e);
    const a42 = dot(sub(P, h.p4, h.p1), e);
    const u1 = [0, 1, 2].map((k) => (a31 * N1[k]) / l1 + (a41 * N2[k]) / l2);
    const u2 = [0, 1, 2].map((k) => -(a32 * N1[k]) / l1 - (a42 * N2[k]) / l2);
    const s = -h.k * err;
    addForce(F, h.p3, s, u3);
    addForce(F, h.p4, s, u4);
    addForce(F, h.p1, s, u1);
    addForce(F, h.p2, s, u2);
  }
}

/** Advance the simulation by `substeps` explicit steps. Returns false if it blew up. */
export function step(m: SimModel, foldPct: number, substeps = 30): boolean {
  const { pos, vel, force } = m;
  const dt = PARAMS.dt;
  const keep = 1 - PARAMS.damping;
  for (let s = 0; s < substeps; s++) {
    computeForces(m, foldPct);
    for (let i = 0; i < m.n; i++) {
      if (m.fixed.has(i)) continue;
      const pin = m.pinned.get(i);
      if (pin) {
        pos[i * 3] = pin[0];
        pos[i * 3 + 1] = pin[1];
        pos[i * 3 + 2] = pin[2];
        vel[i * 3] = vel[i * 3 + 1] = vel[i * 3 + 2] = 0;
        continue;
      }
      for (let k = 0; k < 3; k++) {
        const j = i * 3 + k;
        vel[j] = (vel[j] + force[j] * dt) * keep;
        pos[j] += vel[j] * dt;
      }
    }
  }
  for (let j = 0; j < pos.length; j++) {
    if (!Number.isFinite(pos[j]) || Math.abs(pos[j]) > 50) {
      m.stable = false;
      return false;
    }
  }
  return true;
}

/** Per-vertex strain: mean |L − L0| / L0 of incident bars. */
export function vertexStrain(m: SimModel): Float64Array {
  const sum = new Float64Array(m.n);
  const cnt = new Float64Array(m.n);
  for (const b of m.bars) {
    const s = Math.abs(norm(sub(m.pos, b.b, b.a)) - b.L0) / b.L0;
    sum[b.a] += s;
    sum[b.b] += s;
    cnt[b.a]++;
    cnt[b.b]++;
  }
  return sum.map((v, i) => (cnt[i] ? v / cnt[i] : 0));
}

export function maxBarStrain(m: SimModel): number {
  let mx = 0;
  for (const b of m.bars) mx = Math.max(mx, Math.abs(norm(sub(m.pos, b.b, b.a)) - b.L0) / b.L0);
  return mx;
}

export function reset(m: SimModel) {
  m.pos.set(m.rest);
  m.vel.fill(0);
  m.pinned.clear();
  m.stable = true;
}

// ------------------------------------------------------------------ colour ramps (with legend support)

export type Ramp = "greenred" | "viridis";

const VIRIDIS = [
  [68, 1, 84],
  [59, 82, 139],
  [33, 145, 140],
  [94, 201, 98],
  [253, 231, 37],
];

export function rampColor(t: number, ramp: Ramp): [number, number, number] {
  t = Math.min(1, Math.max(0, t));
  if (ramp === "greenred") {
    // green → amber → red
    const stops = [
      [60, 207, 145],
      [245, 177, 76],
      [255, 93, 93],
    ];
    const x = t * (stops.length - 1);
    const i = Math.min(stops.length - 2, Math.floor(x));
    const f = x - i;
    return stops[i].map((c, k) => (c + (stops[i + 1][k] - c) * f) / 255) as [number, number, number];
  }
  const x = t * (VIRIDIS.length - 1);
  const i = Math.min(VIRIDIS.length - 2, Math.floor(x));
  const f = x - i;
  return VIRIDIS[i].map((c, k) => (c + (VIRIDIS[i + 1][k] - c) * f) / 255) as [number, number, number];
}
