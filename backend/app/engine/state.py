"""Fold-engine state: paper, pieces (flat polygons with an affine map) and creases."""
from __future__ import annotations

import copy
from dataclasses import dataclass, field

import numpy as np

EPS = 1e-9


class EngineError(ValueError):
    """A step cannot be executed (bad line, missing flap, ...)."""


@dataclass(frozen=True)
class Paper:
    width: float = 1.0
    height: float = 1.0
    start: str = "colour_up"  # or "white_up"

    @property
    def white_up(self) -> bool:
        return self.start == "white_up"

    def corners(self) -> list[tuple[float, float]]:
        w, h = self.width, self.height
        return [(0.0, 0.0), (w, 0.0), (w, h), (0.0, h)]


@dataclass
class Piece:
    id: int
    paper_poly: list[tuple[float, float]]  # CCW, paper coordinates
    M: np.ndarray  # 3x3 affine, paper -> folded (may include a reflection)
    layer: int

    @property
    def folded_poly(self) -> list[tuple[float, float]]:
        return apply(self.M, self.paper_poly)

    @property
    def det(self) -> float:
        return float(np.linalg.det(self.M[:2, :2]))

    def face_up(self, paper: Paper) -> bool:
        """True when the coloured side faces the viewer."""
        return (self.det > 0) != paper.white_up


@dataclass
class Crease:
    a: tuple[float, float]  # paper coordinates
    b: tuple[float, float]
    assignment: str  # "M" | "V"


@dataclass
class State:
    paper: Paper
    pieces: list[Piece]
    creases: list[Crease] = field(default_factory=list)
    history: list[list[Piece]] = field(default_factory=list)  # pieces after each step
    next_id: int = 1

    def clone(self) -> "State":
        return State(
            paper=self.paper,
            pieces=[Piece(p.id, list(p.paper_poly), p.M.copy(), p.layer) for p in self.pieces],
            creases=[Crease(c.a, c.b, c.assignment) for c in self.creases],
            history=[copy.deepcopy(h) for h in self.history],
            next_id=self.next_id,
        )

    def bbox(self) -> tuple[float, float, float, float]:
        pts = [pt for p in self.pieces for pt in p.folded_poly]
        xs = [p[0] for p in pts]
        ys = [p[1] for p in pts]
        return min(xs), min(ys), max(xs), max(ys)


def initial_state(paper: Paper | None = None) -> State:
    paper = paper or Paper()
    return State(paper=paper, pieces=[Piece(0, paper.corners(), np.eye(3), 0)])


# ---------------------------------------------------------------- affine helpers

def apply(M: np.ndarray, pts) -> list[tuple[float, float]]:
    out = []
    for x, y in pts:
        v = M @ np.array([x, y, 1.0])
        out.append((float(v[0]), float(v[1])))
    return out


def reflection(p, d) -> np.ndarray:
    """Reflection across the line through p with direction d."""
    d = np.asarray(d, float)
    d = d / np.linalg.norm(d)
    a, b = 2 * d[0] ** 2 - 1, 2 * d[0] * d[1]
    R = np.array([[a, b], [b, -a]])
    p = np.asarray(p, float)
    t = p - R @ p
    M = np.eye(3)
    M[:2, :2] = R
    M[:2, 2] = t
    return M


def rotation(center, deg: float) -> np.ndarray:
    r = np.radians(deg)
    c, s = np.cos(r), np.sin(r)
    R = np.array([[c, -s], [s, c]])
    p = np.asarray(center, float)
    M = np.eye(3)
    M[:2, :2] = R
    M[:2, 2] = p - R @ p
    return M
