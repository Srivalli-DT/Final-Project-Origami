import { describe, expect, it } from "vitest";
import { buildModel, dihedral, maxBarStrain, step } from "./solver";
import type { Fold } from "../types";

/** Unit square with one crease down the middle (two rectangular faces). */
function singleCrease(asg: "V" | "M"): Fold {
  return {
    vertices_coords: [
      [0, 0],
      [0.5, 0],
      [1, 0],
      [1, 1],
      [0.5, 1],
      [0, 1],
    ],
    edges_vertices: [
      [0, 1],
      [1, 2],
      [2, 3],
      [3, 4],
      [4, 5],
      [5, 0],
      [1, 4],
    ],
    edges_assignment: ["B", "B", "B", "B", "B", "B", asg],
    faces_vertices: [
      [0, 1, 4, 5],
      [1, 2, 3, 4],
    ],
  };
}

const creaseAngle = (fold: Fold) => {
  const m = buildModel(fold);
  return { m, hinge: m.hinges.find((h) => h.sign !== 0)! };
};

describe("bar-and-hinge solver", () => {
  it("a valley crease reaches fold% × π within 500 steps", () => {
    const { m, hinge } = creaseAngle(singleCrease("V"));
    for (let i = 0; i < 500; i++) step(m, 0.5, 1);
    expect(dihedral(m.pos, hinge)).toBeCloseTo(0.5 * Math.PI, 1);
    // valley folds toward the viewer (+z)
    const zs = Array.from({ length: m.n }, (_, i) => m.pos[i * 3 + 2]);
    expect(Math.max(...zs)).toBeGreaterThan(0.3);
  });

  it("a mountain crease folds away from the viewer", () => {
    const { m, hinge } = creaseAngle(singleCrease("M"));
    for (let i = 0; i < 500; i++) step(m, 0.5, 1);
    expect(dihedral(m.pos, hinge)).toBeCloseTo(-0.5 * Math.PI, 1);
    const zs = Array.from({ length: m.n }, (_, i) => m.pos[i * 3 + 2]);
    expect(Math.min(...zs)).toBeLessThan(-0.3);
  });

  it("bar strain is under 1% at rest and while folding", () => {
    const { m } = creaseAngle(singleCrease("V"));
    for (let i = 0; i < 200; i++) step(m, 0, 1);
    expect(maxBarStrain(m)).toBeLessThan(0.01);
    for (let i = 0; i < 500; i++) step(m, 0.9, 1);
    expect(maxBarStrain(m)).toBeLessThan(0.01);
    expect(m.stable).toBe(true);
  });
});
