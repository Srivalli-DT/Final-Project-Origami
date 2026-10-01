"""Point references used by tutorials, resolved against the current folded state.

- "P(x,y)": where paper point (x,y) currently lies (top-most piece containing it)
- "F(x,y)": a raw folded coordinate
- "B(u,v)": fraction (u,v) of the current folded bounding box (0,0 = bottom-left)
- "corner:tl|tr|bl|br", "mid:top|bottom|left|right", "center": bounding-box points
- [x, y]: same as F(x,y)

Coordinates may be arithmetic expressions using sqrt, t22 (tan 22.5°), w and h (paper size).
"""
from __future__ import annotations

import ast
import math
import operator
import re

import numpy as np
from shapely.geometry import Point, Polygon

from .state import EngineError, State

_OPS = {
    ast.Add: operator.add, ast.Sub: operator.sub, ast.Mult: operator.mul,
    ast.Div: operator.truediv, ast.Pow: operator.pow, ast.USub: operator.neg, ast.UAdd: operator.pos,
}
_FUNCS = {"sqrt": math.sqrt, "tan": math.tan, "radians": math.radians}


def num(expr, state: State | None = None) -> float:
    """Evaluate a small arithmetic expression safely."""
    if isinstance(expr, (int, float)):
        return float(expr)
    names = {"t22": math.tan(math.radians(22.5)), "pi": math.pi}
    if state is not None:
        names.update(w=state.paper.width, h=state.paper.height)

    def ev(node):
        if isinstance(node, ast.Expression):
            return ev(node.body)
        if isinstance(node, ast.Constant) and isinstance(node.value, (int, float)):
            return float(node.value)
        if isinstance(node, ast.BinOp) and type(node.op) in _OPS:
            return _OPS[type(node.op)](ev(node.left), ev(node.right))
        if isinstance(node, ast.UnaryOp) and type(node.op) in _OPS:
            return _OPS[type(node.op)](ev(node.operand))
        if isinstance(node, ast.Name) and node.id in names:
            return names[node.id]
        if isinstance(node, ast.Call) and isinstance(node.func, ast.Name) and node.func.id in _FUNCS:
            return _FUNCS[node.func.id](*[ev(a) for a in node.args])
        raise EngineError(f"bad number expression: {expr!r}")

    try:
        return float(ev(ast.parse(str(expr), mode="eval")))
    except (SyntaxError, ZeroDivisionError) as e:
        raise EngineError(f"bad number expression: {expr!r}") from e


_CALL = re.compile(r"^\s*([PFB])\((.*)\)\s*$")


def _split_args(s: str) -> list[str]:
    parts, depth, cur = [], 0, ""
    for ch in s:
        if ch == "," and depth == 0:
            parts.append(cur)
            cur = ""
            continue
        depth += ch == "("
        depth -= ch == ")"
        cur += ch
    parts.append(cur)
    return parts


def paper_point_location(state: State, x: float, y: float) -> np.ndarray:
    """Folded location of paper point (x, y) on the top-most piece containing it."""
    pt = Point(x, y)
    best = None
    for piece in state.pieces:
        poly = Polygon(piece.paper_poly)
        if poly.buffer(1e-7).covers(pt) and (best is None or piece.layer > best.layer):
            best = piece
    if best is None:
        raise EngineError(f"paper point ({x:.3f}, {y:.3f}) is not on the paper")
    v = best.M @ np.array([x, y, 1.0])
    return v[:2]


def resolve(ref, state: State) -> np.ndarray:
    if isinstance(ref, (list, tuple)) and len(ref) == 2:
        return np.array([num(ref[0], state), num(ref[1], state)])
    if not isinstance(ref, str):
        raise EngineError(f"bad point reference: {ref!r}")
    m = _CALL.match(ref)
    if m:
        kind, args = m.group(1), _split_args(m.group(2))
        if len(args) != 2:
            raise EngineError(f"bad point reference: {ref!r}")
        a, b = num(args[0], state), num(args[1], state)
        if kind == "P":
            return paper_point_location(state, a, b)
        if kind == "F":
            return np.array([a, b])
        x0, y0, x1, y1 = state.bbox()
        return np.array([x0 + a * (x1 - x0), y0 + b * (y1 - y0)])
    x0, y0, x1, y1 = state.bbox()
    cx, cy = (x0 + x1) / 2, (y0 + y1) / 2
    named = {
        "center": (cx, cy),
        "corner:tl": (x0, y1), "corner:tr": (x1, y1), "corner:bl": (x0, y0), "corner:br": (x1, y0),
        "mid:top": (cx, y1), "mid:bottom": (cx, y0), "mid:left": (x0, cy), "mid:right": (x1, cy),
    }
    if ref.strip() in named:
        return np.array(named[ref.strip()])
    raise EngineError(f"bad point reference: {ref!r}")
