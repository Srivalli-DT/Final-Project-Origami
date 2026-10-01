"""Fold lines from Huzita–Justin axioms, in current folded coordinates.

A line is (p, d): a point and a unit direction.
"""
from __future__ import annotations

import numpy as np

from .refs import resolve
from .state import EngineError, State

Line = tuple[np.ndarray, np.ndarray]


def _unit(v) -> np.ndarray:
    v = np.asarray(v, float)
    n = np.linalg.norm(v)
    if n < 1e-12:
        raise EngineError("the two points of the line coincide")
    return v / n


def _perp(d: np.ndarray) -> np.ndarray:
    return np.array([-d[1], d[0]])


def through(p, q) -> Line:
    """Axiom 1: the line through two points."""
    return np.asarray(p, float), _unit(np.asarray(q, float) - np.asarray(p, float))


def point_to_point(p, q) -> Line:
    """Axiom 2: the fold that places p onto q (perpendicular bisector)."""
    p, q = np.asarray(p, float), np.asarray(q, float)
    return (p + q) / 2, _perp(_unit(q - p))


def line_to_line(l1: Line, l2: Line, which: int = 0) -> Line:
    """Axiom 3: the fold that places l1 onto l2 (an angle bisector, or the midline if parallel)."""
    (p1, d1), (p2, d2) = l1, l2
    cross = d1[0] * d2[1] - d1[1] * d2[0]
    if abs(cross) < 1e-9:
        if abs(_perp(d1) @ (p2 - p1)) < 1e-12:
            raise EngineError("the two lines are the same line")
        return (p1 + p2) / 2, d1
    t = ((p2 - p1)[0] * d2[1] - (p2 - p1)[1] * d2[0]) / cross
    x = p1 + t * d1
    bis = [d1 + d2, d1 - d2]
    return x, _unit(bis[which % 2])


def perp_through(l: Line, p) -> Line:
    """Axiom 4: the fold perpendicular to l through p."""
    return np.asarray(p, float), _perp(l[1])


def point_to_line_through(p, l: Line, q, which: int = 0) -> Line:
    """Axiom 5: the fold through q that places p onto l."""
    p, q = np.asarray(p, float), np.asarray(q, float)
    lp, ld = l
    r = np.linalg.norm(p - q)
    # |lp + s ld - q| = r
    w = lp - q
    b = 2 * (ld @ w)
    c = w @ w - r * r
    disc = b * b - 4 * c
    if disc < 0:
        raise EngineError("point cannot reach the line with a fold through that point")
    roots = sorted([(-b - np.sqrt(disc)) / 2, (-b + np.sqrt(disc)) / 2])
    target = lp + roots[which % 2] * ld
    if np.linalg.norm(target - p) < 1e-9:
        target = lp + roots[(which + 1) % 2] * ld
    return q, _perp(_unit(target - p))


def _line_from_pair(pair, state: State) -> Line:
    if not isinstance(pair, (list, tuple)) or len(pair) != 2:
        raise EngineError(f"a line needs two points, got {pair!r}")
    return through(resolve(pair[0], state), resolve(pair[1], state))


def parse_line(spec: dict, state: State) -> Line:
    """Build a fold line from a tutorial spec."""
    if not isinstance(spec, dict) or not spec:
        raise EngineError(f"bad line spec: {spec!r}")
    which = int(spec.get("which", 0))
    if "through" in spec:
        a, b = spec["through"]
        return through(resolve(a, state), resolve(b, state))
    if "point_to_point" in spec:
        a, b = spec["point_to_point"]
        return point_to_point(resolve(a, state), resolve(b, state))
    if "line_to_line" in spec:
        l1, l2 = spec["line_to_line"]
        return line_to_line(_line_from_pair(l1, state), _line_from_pair(l2, state), which)
    if "perp_through" in spec:
        l, p = spec["perp_through"]
        return perp_through(_line_from_pair(l, state), resolve(p, state))
    if "point_to_line_through" in spec:
        p, l, q = spec["point_to_line_through"]
        return point_to_line_through(resolve(p, state), _line_from_pair(l, state), resolve(q, state), which)
    if "horizontal" in spec:
        return resolve(spec["horizontal"], state), np.array([1.0, 0.0])
    if "vertical" in spec:
        return resolve(spec["vertical"], state), np.array([0.0, 1.0])
    raise EngineError(f"unknown line spec: {sorted(spec)}")
