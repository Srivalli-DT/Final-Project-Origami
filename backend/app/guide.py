"""Turn a FOLD crease pattern into a step-by-step guide."""
from __future__ import annotations

import math
from collections import deque
from fractions import Fraction

from .fold_utils import (
    EPS,
    SNAP,
    face_adjacency,
    is_boundary_vertex,
    merge_collinear_lines,
    point_in_polygon,
)
from .validate import validate

MERGE_THRESHOLD = 12
_DIRECTION_ORDER = {0.0: 0, 90.0: 1, 45.0: 2, 135.0: 3}


# ---------------------------------------------------------------- small helpers

def _on_boundary(p) -> bool:
    x, y = p
    return min(abs(x), abs(y), abs(1 - x), abs(1 - y)) < SNAP


def _frac(x: float) -> str:
    lvl = _dyadic_level(x)
    if lvl is None:
        return f"{x:.2f}"
    f = Fraction(round(x * lvl), lvl)
    return str(f.numerator) if f.denominator == 1 else f"{f.numerator}/{f.denominator}"


def _dyadic_level(x: float) -> int | None:
    """Smallest 2^k (k<=6) such that x is a multiple of 1/2^k, else None."""
    for k in range(0, 7):
        d = 2 ** k
        if abs(x * d - round(x * d)) < SNAP * d:
            return d
    return None


def _direction(angle: float) -> float:
    a = round(angle, 3) % 180
    for d in (0.0, 45.0, 90.0, 135.0):
        if abs(a - d) < 0.05 or abs(a - d - 180) < 0.05:
            return d
    return a


def _through_centre(line: dict) -> bool:
    (x1, y1), (x2, y2) = line["p1"], line["p2"]
    cx, cy = 0.5, 0.5
    cross = (x2 - x1) * (cy - y1) - (y2 - y1) * (cx - x1)
    if abs(cross) > SNAP:
        return False
    t = ((cx - x1) * (x2 - x1) + (cy - y1) * (y2 - y1)) / ((x2 - x1) ** 2 + (y2 - y1) ** 2)
    return -EPS <= t <= 1 + EPS


def _line_offset(line: dict, direction: float) -> float:
    """Signed offset used for ordering lines within a direction."""
    (x1, y1), _ = line["p1"], line["p2"]
    if direction == 90.0:
        return x1
    if direction == 0.0:
        return y1
    if direction == 45.0:
        return y1 - x1  # y = x + c
    if direction == 135.0:
        return y1 + x1  # y = -x + c
    return x1 + y1


def _grid_level(line: dict, direction: float) -> int:
    off = _line_offset(line, direction)
    if direction in (0.0, 90.0):
        lvl = _dyadic_level(off)
    elif direction == 45.0:
        lvl = _dyadic_level(abs(off))
    elif direction == 135.0:
        lvl = _dyadic_level(abs(off - 1))
    else:
        lvl = None
    return lvl if lvl is not None else 999


def _line_assignment(line: dict) -> str:
    asg = [a for a in line["assignments"] if a in ("M", "V")]
    if not asg:
        return "V"  # reference (F) lines are folded as valleys, then unfolded
    return max(("V", "M"), key=asg.count)


# ---------------------------------------------------------------- step text

def _fold_phrase(asg: str) -> str:
    return "valley fold (toward you)" if asg == "V" else "mountain fold (away from you)"


def _describe_line(line: dict, direction: float) -> str:
    (x1, y1), (x2, y2) = line["p1"], line["p2"]
    if direction == 90.0:
        a = x1
        if abs(a - 0.5) < SNAP:
            return "Fold in half, left edge to right edge"
        if a < 0.5:
            target = 2 * a
            where = "the centre line" if abs(target - 0.5) < SNAP else f"the {_frac(target)} line"
            return f"Fold the left edge to {where}"
        target = 2 * a - 1
        where = "the centre line" if abs(target - 0.5) < SNAP else f"the {_frac(target)} line"
        return f"Fold the right edge to {where}"
    if direction == 0.0:
        a = y1
        if abs(a - 0.5) < SNAP:
            return "Fold in half, bottom edge to top edge"
        if a < 0.5:
            target = 2 * a
            where = "the centre line" if abs(target - 0.5) < SNAP else f"the {_frac(target)} line"
            return f"Fold the bottom edge to {where}"
        target = 2 * a - 1
        where = "the centre line" if abs(target - 0.5) < SNAP else f"the {_frac(target)} line"
        return f"Fold the top edge to {where}"
    corners = {(0, 0): "bottom-left", (1, 0): "bottom-right", (1, 1): "top-right", (0, 1): "top-left"}
    k1 = (round(x1), round(y1)) if abs(x1 - round(x1)) < SNAP and abs(y1 - round(y1)) < SNAP else None
    k2 = (round(x2), round(y2)) if abs(x2 - round(x2)) < SNAP and abs(y2 - round(y2)) < SNAP else None
    if k1 in corners and k2 in corners and direction in (45.0, 135.0):
        # the fold line is a diagonal: the other two corners meet
        others = [c for c in corners if c not in (k1, k2)]
        return (f"Fold corner to opposite corner: bring the {corners[others[0]]} corner "
                f"to the {corners[others[1]]} corner")
    kite = _kite_phrase(line, corners, k1, k2)
    if kite:
        return kite
    return (f"Fold along the line from ({_frac(x1)}, {_frac(y1)}) "
            f"to ({_frac(x2)}, {_frac(y2)})")


def _kite_phrase(line: dict, corners: dict, k1, k2) -> str | None:
    """'Fold the bottom edge onto the diagonal' for 22.5° lines from a corner."""
    corner = k1 if k1 in corners else k2 if k2 in corners else None
    if corner is None:
        return None
    other = line["p2"] if corner == k1 else line["p1"]
    ang = math.degrees(math.atan2(other[1] - corner[1], other[0] - corner[0])) % 360
    edges = {  # directions of the two paper edges leaving each corner
        (0, 0): {0: "bottom", 90: "left"},
        (1, 0): {180: "bottom", 90: "right"},
        (1, 1): {180: "top", 270: "right"},
        (0, 1): {0: "top", 270: "left"},
    }[corner]
    (a1, n1), (a2, n2) = edges.items()
    diag = (a1 + a2) / 2 if abs(a1 - a2) < 180 else ((a1 + a2 + 360) / 2) % 360
    for edge_ang, name in ((a1, n1), (a2, n2)):
        mid = (edge_ang + diag) / 2 if abs(edge_ang - diag) < 180 else ((edge_ang + diag + 360) / 2) % 360
        if abs((ang - mid + 180) % 360 - 180) < 0.5:
            return f"Kite fold: from the {corners[corner]} corner, fold the {name} edge onto the diagonal"
    return None


# ---------------------------------------------------------------- face tree + folded state

def _reflection(p1, p2) -> list[list[float]]:
    """2x3 affine matrix reflecting across the line p1-p2."""
    (x1, y1), (x2, y2) = p1, p2
    dx, dy = x2 - x1, y2 - y1
    L = math.hypot(dx, dy)
    ux, uy = dx / L, dy / L
    a, b = 2 * ux * ux - 1, 2 * ux * uy
    c, d = b, 2 * uy * uy - 1
    tx = x1 - (a * x1 + b * y1)
    ty = y1 - (c * x1 + d * y1)
    return [[a, b, tx], [c, d, ty]]


def _compose(m1, m2):
    """m1 ∘ m2 (apply m2 first)."""
    a = [[m1[0][0], m1[0][1], m1[0][2]], [m1[1][0], m1[1][1], m1[1][2]], [0, 0, 1]]
    b = [[m2[0][0], m2[0][1], m2[0][2]], [m2[1][0], m2[1][1], m2[1][2]], [0, 0, 1]]
    r = [[sum(a[i][k] * b[k][j] for k in range(3)) for j in range(3)] for i in range(2)]
    return r


def _apply(m, p):
    return [m[0][0] * p[0] + m[0][1] * p[1] + m[0][2], m[1][0] * p[0] + m[1][1] * p[1] + m[1][2]]


_IDENTITY = [[1.0, 0.0, 0.0], [0.0, 1.0, 0.0]]


def face_tree(fold: dict) -> dict:
    """BFS spanning tree of faces from the centre face.

    M/V edges are hinges (sign +1 valley, -1 mountain). Faces only reachable
    across F edges are attached with sign 0 (no rotation).
    """
    faces = fold["faces_vertices"]
    coords = fold["vertices_coords"]
    if not faces:
        return {"root": -1, "nodes": []}
    root = 0
    for fi, f in enumerate(faces):
        if point_in_polygon((0.5, 0.5), [coords[v] for v in f], strict=True):
            root = fi
            break
    adj: dict[int, list[tuple[int, int]]] = {i: [] for i in range(len(faces))}
    for (f1, f2), ei in face_adjacency(fold).items():
        adj[f1].append((f2, ei))
        adj[f2].append((f1, ei))

    nodes = {root: {"face": root, "parent": -1, "hinge_edge": -1, "sign": 0}}
    order = [root]
    # first pass crosses only M/V; second pass lets F edges connect the rest
    for allowed in (("M", "V"), ("M", "V", "F")):
        queue = deque(order)
        while queue:
            f = queue.popleft()
            for g, ei in sorted(adj[f]):
                asg = fold["edges_assignment"][ei]
                if g in nodes or asg not in allowed:
                    continue
                sign = 1 if asg == "V" else -1 if asg == "M" else 0
                nodes[g] = {"face": g, "parent": f, "hinge_edge": ei, "sign": sign}
                order.append(g)
                queue.append(g)
    for fi in range(len(faces)):  # disconnected leftovers
        if fi not in nodes:
            nodes[fi] = {"face": fi, "parent": -1, "hinge_edge": -1, "sign": 0}
            order.append(fi)
    return {"root": root, "nodes": [nodes[f] for f in order]}


def face_transforms(fold: dict, tree: dict) -> dict[int, list[list[float]]]:
    """2x3 affine map (CP -> flat-folded) for every face, composed along the face tree."""
    coords = fold["vertices_coords"]
    mats: dict[int, list] = {}
    for node in tree["nodes"]:
        if node["parent"] == -1 or node["sign"] == 0:
            parent = mats.get(node["parent"], _IDENTITY)
            mats[node["face"]] = parent
            continue
        a, b = fold["edges_vertices"][node["hinge_edge"]]
        mats[node["face"]] = _compose(mats[node["parent"]], _reflection(coords[a], coords[b]))
    return mats


def folded_coordinates(fold: dict, tree: dict) -> list[list[float]]:
    coords = fold["vertices_coords"]
    mats = face_transforms(fold, tree)
    out: list[list[float] | None] = [None] * len(coords)
    for node in tree["nodes"]:
        for v in fold["faces_vertices"][node["face"]]:
            if out[v] is None:
                out[v] = _apply(mats[node["face"]], coords[v])
    return [p if p is not None else list(coords[i]) for i, p in enumerate(out)]


# ---------------------------------------------------------------- difficulty

def difficulty(fold: dict) -> dict:
    coords = fold["vertices_coords"]
    mv = [i for i, a in enumerate(fold["edges_assignment"]) if a in ("M", "V")]
    touched = {v for i in mv for v in fold["edges_vertices"][i]}
    interior = sum(1 for v in touched if not is_boundary_vertex(fold, v))
    levels = [lvl for x, y in coords for lvl in (_dyadic_level(x), _dyadic_level(y)) if lvl]
    grid = max(levels) if levels else 1
    odd_angle = False
    for i in mv:
        a, b = fold["edges_vertices"][i]
        (x1, y1), (x2, y2) = coords[a], coords[b]
        ang = math.degrees(math.atan2(y2 - y1, x2 - x1)) % 180
        r = ang / 22.5
        if abs(r - round(r)) * 22.5 > 0.5:
            odd_angle = True
            break
    score = 0.4 * interior + 0.3 * len(mv) + 20 * (grid > 8) + 10 * odd_angle
    score = round(max(0.0, min(100.0, score)))
    label = "Beginner" if score < 25 else "Intermediate" if score < 60 else "Advanced"
    return {"score": score, "label": label}


# ---------------------------------------------------------------- guide

def _single_line_step(line: dict, direction: float, kind: str) -> dict:
    asg = _line_assignment(line)
    phrase = _fold_phrase(asg)
    text = f"{_describe_line(line, direction)}. {phrase[0].upper()}{phrase[1:]}, then unfold."
    title = _describe_line(line, direction)
    return {
        "title": title,
        "kind": kind,
        "line": [list(line["p1"]), list(line["p2"])],
        "assignment": asg,
        "edges": list(line["edges"]),
        "text": text,
    }


def _direction_name(direction: float) -> str:
    return {0.0: "horizontal", 90.0: "vertical", 45.0: "diagonal (/)", 135.0: "diagonal (\\)"}.get(
        direction, f"{direction:.1f}°")


def make_steps(fold: dict, extra_steps: list[dict] | None = None) -> list[dict]:
    lines = merge_collinear_lines(fold)
    e2e = [ln for ln in lines if _on_boundary(ln["p1"]) and _on_boundary(ln["p2"])]
    for ln in e2e:
        ln["direction"] = _direction(ln["angle"])

    refs = [ln for ln in e2e if _through_centre(ln)]
    refs.sort(key=lambda ln: (_DIRECTION_ORDER.get(ln["direction"], 9) >= 2,
                              _DIRECTION_ORDER.get(ln["direction"], 9)))
    steps = [_single_line_step(ln, ln["direction"], "reference") for ln in refs]

    rest = [ln for ln in e2e if ln not in refs]
    groups: dict[tuple, list[dict]] = {}
    for ln in rest:
        d = ln["direction"]
        key = (_DIRECTION_ORDER.get(d, 4), d, _grid_level(ln, d))
        groups.setdefault(key, []).append(ln)
    for key in sorted(groups):
        _, d, lvl = key
        group = sorted(groups[key], key=lambda ln: _line_offset(ln, d))
        if len(group) > MERGE_THRESHOLD:
            edges = [e for ln in group for e in ln["edges"]]
            level = f"1/{lvl}" if lvl != 999 else "remaining"
            title = f"Precrease all the {level} {_direction_name(d)} lines"
            steps.append({
                "title": title,
                "kind": "precrease",
                "line": None,
                "assignment": None,
                "edges": edges,
                "text": f"{title}: fold each one along its colour (valley toward you, "
                        f"mountain away from you), then unfold.",
            })
        else:
            steps.extend(_single_line_step(ln, d, "precrease") for ln in group)

    mv_edges = [i for i, a in enumerate(fold["edges_assignment"]) if a in ("M", "V")]
    if mv_edges:
        steps.append({
            "title": "Collapse along the existing creases",
            "kind": "collapse",
            "line": None,
            "assignment": None,
            "edges": mv_edges,
            "text": "Collapse along the existing creases: re-fold every valley toward you "
                    "and every mountain away from you at the same time, then flatten.",
        })
    for extra in extra_steps or []:
        steps.append({
            "title": extra["title"],
            "kind": extra.get("kind", "assembly"),
            "line": None,
            "assignment": None,
            "edges": [],
            "text": extra["text"],
        })

    cumulative: list[int] = []
    seen: set[int] = set()
    for i, s in enumerate(steps):
        for e in s["edges"]:
            if e not in seen:
                seen.add(e)
                cumulative.append(e)
        s["index"] = i
        s["cumulative_edges"] = list(cumulative)
    return steps


def make_guide(fold: dict, extra_steps: list[dict] | None = None) -> dict:
    tree = face_tree(fold)
    return {
        "validation": validate(fold),
        "difficulty": difficulty(fold),
        "faces": fold["faces_vertices"],
        "face_tree": tree,
        "folded_coords": folded_coordinates(fold, tree),
        "steps": make_steps(fold, extra_steps),
    }
