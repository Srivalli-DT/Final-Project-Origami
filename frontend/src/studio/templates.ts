import type { P2 } from "../types";
import type { Seg } from "./geometry";

const C: P2 = [0.5, 0.5];
const T = Math.tan(Math.PI / 8);

function miura(): Seg[] {
  const n = 4;
  const off = 0.06;
  const xs = Array.from({ length: n + 1 }, (_, i) => i / n);
  const shift = (j: number) => (j % 2 ? off : 0);
  const zig = (i: number): "M" | "V" => (i % 2 ? "M" : "V");
  const opp = (k: "M" | "V"): "M" | "V" => (k === "M" ? "V" : "M");
  const pt = (i: number, j: number): P2 => [i === 0 || i === n ? xs[i] : xs[i] + shift(j), j / n];
  const segs: Seg[] = [];
  for (let i = 1; i < n; i++) for (let j = 0; j < n; j++) segs.push({ a: pt(i, j), b: pt(i, j + 1), asg: zig(i) });
  for (let j = 1; j < n; j++)
    for (let k = 0; k < n; k++) {
      const asg = j % 2 ? (k >= 1 ? zig(k) : opp(zig(1))) : k + 1 < n ? zig(k + 1) : opp(zig(n - 1));
      segs.push({ a: pt(k, j), b: pt(k + 1, j), asg });
    }
  return segs;
}

export const TEMPLATES: { id: string; title: string; segs: () => Seg[] }[] = [
  { id: "blank", title: "Blank", segs: () => [] },
  {
    id: "kite",
    title: "Kite",
    segs: () => [
      { a: [0, 0], b: [1, 1], asg: "F" },
      { a: [0, 0], b: [1, T], asg: "V" },
      { a: [0, 0], b: [T, 1], asg: "V" },
    ],
  },
  {
    id: "square-base",
    title: "Square base",
    segs: () => [
      { a: [0, 0], b: C, asg: "F" },
      { a: C, b: [1, 1], asg: "F" },
      { a: [1, 0], b: [0, 1], asg: "V" },
      { a: [0, 0.5], b: [1, 0.5], asg: "M" },
      { a: [0.5, 0], b: [0.5, 1], asg: "M" },
    ],
  },
  {
    id: "waterbomb",
    title: "Waterbomb",
    segs: () => [
      { a: [0, 0], b: [1, 1], asg: "M" },
      { a: [1, 0], b: [0, 1], asg: "M" },
      { a: [0, 0.5], b: [1, 0.5], asg: "V" },
      { a: [0.5, 0], b: C, asg: "F" },
      { a: C, b: [0.5, 1], asg: "F" },
    ],
  },
  { id: "miura", title: "Miura-ori", segs: miura },
];
