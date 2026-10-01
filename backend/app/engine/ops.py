"""Fold operations. Every op is pure: (state, args) -> (new_state, keyframe).

Coordinates: paper coordinates for creases and piece outlines, folded coordinates
(what the viewer sees, y up, +z toward the viewer) for lines and keyframes.
Valley = the moving part rotates toward the viewer and lands on top.
"""
from __future__ import annotations

import math

import numpy as np
from shapely.geometry import LineString, MultiPoint, MultiPolygon, Point, Polygon
from shapely.geometry.base import BaseGeometry

from ..fold_utils import build_fold, polygon_area
from ..guide import face_transforms, face_tree
from .state import Crease, EngineError, Paper, Piece, State, apply, reflection, rotation

SLIVER = 1e-9
BIG = 100.0


# ---------------------------------------------------------------- small helpers

def _ccw(poly: list[tuple[float, float]]) -> list[tuple[float, float]]:
    return poly if polygon_area(poly) >= 0 else list(reversed(poly))


def _polys(geom: BaseGeometry) -> list[Polygon]:
    if geom.is_empty:
        return []
    if isinstance(geom, Polygon):
        return [geom] if geom.area > SLIVER else []
    if isinstance(geom, MultiPolygon) or hasattr(geom, "geoms"):
        return [g for g in geom.geoms if isinstance(g, Polygon) and g.area > SLIVER]
    return []


def _half_planes(p: np.ndarray, d: np.ndarray) -> tuple[Polygon, Polygon]:
    n = np.array([-d[1], d[0]])
    a, b = p - d * BIG, p + d * BIG
    left = Polygon([tuple(a), tuple(b), tuple(b + n * BIG), tuple(a + n * BIG)])
    right = Polygon([tuple(a), tuple(b), tuple(b - n * BIG), tuple(a - n * BIG)])
    return left, right


def _side(pt, p, d) -> float:
    return float(d[0] * (pt[1] - p[1]) - d[1] * (pt[0] - p[0]))


def _piece_dict(piece: Piece, paper: Paper, moving: bool | None = None) -> dict:
    out = {
        "id": piece.id,
        "poly": [[round(x, 6), round(y, 6)] for x, y in piece.folded_poly],
        "layer": piece.layer,
        "face_up": piece.face_up(paper),
    }
    if moving is not None:
        out["moving"] = moving
    return out


def _rerank(pieces: list[Piece]) -> None:
    for rank, piece in enumerate(sorted(pieces, key=lambda q: (q.layer, q.id))):
        piece.layer = rank


def snapshot(state: State) -> list[dict]:
    return [_piece_dict(p, state.paper) for p in state.pieces]


def _keyframe(op: str, before: list[dict], after: State, axis=None, direction: int = 0, **extra) -> dict:
    kf = {
        "op": op,
        "axis": axis,
        "direction": direction,
        "pieces_before": before,
        "state_after": snapshot(after),
        "is_shaping": False,
    }
    kf.update(extra)
    return kf


def _add_crease(state: State, a, b, asg: str) -> None:
    """Append a crease, merging with a collinear overlapping crease of the same assignment."""
    a = (float(a[0]), float(a[1]))
    b = (float(b[0]), float(b[1]))
    if math.dist(a, b) < 1e-6:
        return
    d = np.array(b) - np.array(a)
    d /= np.linalg.norm(d)
    for c in state.creases:
        if c.assignment != asg:
            continue
        e = np.array(c.b) - np.array(c.a)
        L = np.linalg.norm(e)
        e /= L
        if abs(d[0] * e[1] - d[1] * e[0]) > 1e-6:
            continue
        off = np.array(a) - np.array(c.a)
        if abs(off[0] * e[1] - off[1] * e[0]) > 1e-6:
            continue
        ts = [0.0, L, float((np.array(a) - c.a) @ e), float((np.array(b) - c.a) @ e)]
        lo_new, hi_new = sorted(ts[2:])
        if lo_new > L + 1e-6 or hi_new < -1e-6:
            continue
        lo, hi = min(ts), max(ts)
        base = np.array(c.a)
        c.a = tuple(map(float, base + e * lo))
        c.b = tuple(map(float, base + e * hi))
        return
    state.creases.append(Crease(a, b, asg))


def _flip(asg: str) -> str:
    return "M" if asg == "V" else "V"


def _clip_segment(seg: LineString, clip) -> LineString:
    if clip is None:
        return seg
    a, b = np.asarray(clip[0], float), np.asarray(clip[1], float)
    c = LineString([tuple(a), tuple(b)]).buffer(1e-6, cap_style=2)
    return seg.intersection(c)


def _line_pieces(geom: BaseGeometry) -> list[LineString]:
    if geom.is_empty:
        return []
    if isinstance(geom, LineString):
        return [geom] if geom.length > 1e-7 else []
    return [g for g in getattr(geom, "geoms", []) if isinstance(g, LineString) and g.length > 1e-7]


# ---------------------------------------------------------------- fold / crease

def _select(state: State, layers, move, flap_count: int, paper_rect) -> list[Piece]:
    if layers == "all":
        return list(state.pieces)
    if layers == "paper":
        if not paper_rect:
            raise EngineError("layers: paper needs paper_rect [x0, y0, x1, y1]")
        x0, y0, x1, y1 = paper_rect
        sel = []
        for piece in state.pieces:
            c = Polygon(piece.paper_poly).centroid
            if x0 - 1e-9 <= c.x <= x1 + 1e-9 and y0 - 1e-9 <= c.y <= y1 + 1e-9:
                sel.append(piece)
        if not sel:
            raise EngineError("no piece of paper inside paper_rect")
        return sel
    if move is None:
        raise EngineError(f"layers: {layers} needs a move point")
    pt = Point(float(move[0]), float(move[1]))
    under = [q for q in state.pieces if Polygon(q.folded_poly).buffer(1e-7).covers(pt)]
    if not under:
        raise EngineError("flap point is not on any piece")
    under.sort(key=lambda q: -q.layer)
    if layers == "flap":
        return under[: max(1, flap_count)]
    if layers == "front":
        return under[: max(1, len(under) // 2)]
    raise EngineError(f"unknown layers option: {layers!r}")


def _split(state: State, line, kind: str, move=None, layers="all", flap_count=1,
           paper_rect=None, clip=None):
    """Split the selected pieces along the line. Returns (pieces, moving_ids, creases, axis)."""
    p, d = line
    sel = _select(state, layers, move, flap_count, paper_rect)
    sel_ids = {q.id for q in sel}
    left_hp, right_hp = _half_planes(p, d)

    # which side moves
    if move is not None:
        s = _side(move, p, d)
        if abs(s) < 1e-9:
            raise EngineError("the move point lies on the fold line")
        move_left = s > 0
    else:
        area_l = sum(Polygon(q.folded_poly).intersection(left_hp).area for q in sel)
        area_r = sum(Polygon(q.folded_poly).intersection(right_hp).area for q in sel)
        if area_l < SLIVER and area_r < SLIVER:
            raise EngineError("line misses paper")
        if abs(area_l - area_r) > 1e-7:
            move_left = area_l < area_r
        else:
            hull = MultiPoint([pt for q in sel for pt in q.folded_poly]).convex_hull
            cl = hull.intersection(left_hp).centroid
            cr = hull.intersection(right_hp).centroid
            move_left = (cl.y, cl.x) < (cr.y, cr.x)

    out: list[Piece] = []
    moving: set[int] = set()
    creases: list[tuple] = []
    long_line = LineString([tuple(p - d * BIG), tuple(p + d * BIG)])
    for q in state.pieces:
        if q.id not in sel_ids:
            out.append(Piece(q.id, list(q.paper_poly), q.M.copy(), q.layer))
            continue
        fpoly = Polygon(q.folded_poly)
        Minv = np.linalg.inv(q.M)
        halves = []
        for hp, is_left in ((left_hp, True), (right_hp, False)):
            for g in _polys(fpoly.intersection(hp)):
                halves.append((g, is_left == move_left))
        if any(m for _, m in halves) and any(not m for _, m in halves):
            for seg in _line_pieces(_clip_segment(fpoly.intersection(long_line), clip)):
                (ax, ay), (bx, by) = seg.coords[0], seg.coords[-1]
                pa, pb = apply(Minv, [(ax, ay), (bx, by)])
                asg = kind if q.det > 0 else _flip(kind)
                creases.append((pa, pb, asg))
        for i, (g, is_moving) in enumerate(halves):
            paper_poly = _ccw(apply(Minv, list(g.exterior.coords)[:-1]))
            pid = q.id if i == 0 else state.next_id
            if i > 0:
                state.next_id += 1
            out.append(Piece(pid, paper_poly, q.M.copy(), q.layer))
            if is_moving:
                moving.add(pid)
    if not moving:
        raise EngineError("nothing moves: the fold line misses the selected paper")
    # orient the axis so the moving side is on its left (+angle lifts it toward +z)
    axis_d = d if move_left else -d
    return out, moving, creases, {"p": [float(p[0]), float(p[1])], "d": [float(axis_d[0]), float(axis_d[1])]}


def fold(state: State, line, kind: str = "valley", move=None, layers="all", flap_count: int = 1,
         paper_rect=None):
    s = state.clone()
    k = "V" if kind == "valley" else "M"
    pieces, moving, creases, axis = _split(s, line, k, move, layers, flap_count, paper_rect)
    before = [_piece_dict(q, s.paper, q.id in moving) for q in pieces]

    p, d = line
    R = reflection(p, d)
    gmax = max(q.layer for q in pieces)
    gmin = min(q.layer for q in pieces)
    mov = [q for q in pieces if q.id in moving]
    smax = max(q.layer for q in mov)
    smin = min(q.layer for q in mov)
    for q in mov:
        q.M = R @ q.M
        q.layer = gmax + (smax - q.layer) + 1 if k == "V" else gmin - (q.layer - smin) - 1
    _rerank(pieces)
    s.pieces = pieces
    for a, b, asg in creases:
        _add_crease(s, a, b, asg)
    return s, _keyframe("fold", before, s, axis=axis, direction=1 if k == "V" else -1)


def crease(state: State, lines: list[dict]):
    """Fold and unfold. Each entry: {line, kind, clip?, move?, layers?, flap_count?, paper_rect?}.

    The state does not change; only creases are added.
    """
    s = state.clone()
    before = snapshot(s)
    axis, direction = None, 0
    for i, entry in enumerate(lines):
        k = "V" if entry.get("kind", "valley") == "valley" else "M"
        work = s.clone()
        pieces, moving, creases, ax = _split(
            work, entry["line"], k, entry.get("move"), entry.get("layers", "all"),
            entry.get("flap_count", 1), entry.get("paper_rect"), entry.get("clip"))
        if i == 0:
            before = [_piece_dict(q, s.paper, q.id in moving) for q in pieces]
            axis, direction = ax, 1 if k == "V" else -1
        for a, b, asg in creases:
            _add_crease(s, a, b, asg)
    # several creases at once: the first one is animated, the rest appear with it
    return s, _keyframe("crease", before, s, axis=axis, direction=direction, crease_count=len(lines))


def turn_over(state: State, axis: str = "vertical"):
    s = state.clone()
    before = snapshot(s)
    x0, y0, x1, y1 = s.bbox()
    c = np.array([(x0 + x1) / 2, (y0 + y1) / 2])
    d = np.array([0.0, 1.0]) if axis == "vertical" else np.array([1.0, 0.0])
    R = reflection(c, d)
    top = max(q.layer for q in s.pieces)
    for q in s.pieces:
        q.M = R @ q.M
        q.layer = top - q.layer
    _rerank(s.pieces)
    return s, _keyframe("turn_over", before, s, axis={"p": c.tolist(), "d": d.tolist()}, direction=1)


def rotate(state: State, deg: float):
    s = state.clone()
    before = snapshot(s)
    x0, y0, x1, y1 = s.bbox()
    c = [(x0 + x1) / 2, (y0 + y1) / 2]
    R = rotation(c, deg)
    for q in s.pieces:
        q.M = R @ q.M
    return s, _keyframe("rotate", before, s, rotate_deg=float(deg), center=[float(c[0]), float(c[1])])


def unfold(state: State, to_step: int):
    """Restore the pieces from after step `to_step` (-1 = the flat sheet), keeping every crease."""
    s = state.clone()
    before = snapshot(s)
    if to_step < -1 or to_step >= len(s.history):
        raise EngineError(f"cannot unfold to step {to_step}")
    if to_step == -1:
        from .state import initial_state
        s.pieces = initial_state(s.paper).pieces
    else:
        s.pieces = [Piece(q.id, list(q.paper_poly), q.M.copy(), q.layer) for q in s.history[to_step]]
    return s, _keyframe("unfold", before, s)


def shape(state: State, note: str = ""):
    s = state.clone()
    kf = _keyframe("shape", snapshot(s), s)
    kf["is_shaping"] = True
    kf["note"] = note
    return s, kf


# ---------------------------------------------------------------- collapse

def crease_pattern(state: State, flat: list | None = None) -> dict:
    """FOLD crease pattern of the creases so far (unit square papers only).

    Creases inside a `flat` segment stay unfolded in the collapsed result ("F").
    """
    if abs(state.paper.width - 1) > 1e-9 or abs(state.paper.height - 1) > 1e-9:
        raise EngineError("collapse needs a square sheet")
    segs = [(c.a, c.b, c.assignment) for c in reversed(state.creases)]  # newest wins
    fold_ = build_fold(segs)
    for a, b in flat or []:
        zone = LineString([tuple(a), tuple(b)]).buffer(1e-6)
        hit = False
        for ei, (u, v) in enumerate(fold_["edges_vertices"]):
            if fold_["edges_assignment"][ei] in ("M", "V") and zone.covers(
                    LineString([fold_["vertices_coords"][u], fold_["vertices_coords"][v]])):
                fold_["edges_assignment"][ei] = "F"
                hit = True
        if not hit:
            raise EngineError(f"no crease to keep flat between {a} and {b}")
    return fold_


def _hinge4(a, b, angle: float) -> np.ndarray:
    axis = np.array([b[0] - a[0], b[1] - a[1], 0.0])
    axis /= np.linalg.norm(axis)
    x, y, z = axis
    c, s, C = math.cos(angle), math.sin(angle), 1 - math.cos(angle)
    R = np.array([[c + x * x * C, x * y * C - z * s, x * z * C + y * s],
                  [y * x * C + z * s, c + y * y * C, y * z * C - x * s],
                  [z * x * C - y * s, z * y * C + x * s, c + z * z * C]])
    T = np.eye(4)
    T[:3, :3] = R
    p = np.array([a[0], a[1], 0.0])
    T[:3, 3] = p - R @ p
    return T


def collapse_layers(fold: dict, tree: dict, angle: float = 0.95 * math.pi) -> dict[int, float]:
    """Approximate stacking: fold every hinge to `angle` in 3D and read each face's height."""
    coords = fold["vertices_coords"]
    mats: dict[int, np.ndarray] = {}
    z: dict[int, float] = {}
    for node in tree["nodes"]:
        f = node["face"]
        base = mats.get(node["parent"], np.eye(4)).copy()
        if node["parent"] != -1 and node["sign"] != 0:
            u, v = fold["edges_vertices"][node["hinge_edge"]]
            a, b = coords[u], coords[v]
            poly = [coords[i] for i in fold["faces_vertices"][f]]
            cx = sum(p[0] for p in poly) / len(poly)
            cy = sum(p[1] for p in poly) / len(poly)
            if (b[0] - a[0]) * (cy - a[1]) - (b[1] - a[1]) * (cx - a[0]) < 0:
                a, b = b, a
            base = base @ _hinge4(a, b, node["sign"] * angle)
        mats[f] = base
        poly = [coords[i] for i in fold["faces_vertices"][f]]
        cx = sum(p[0] for p in poly) / len(poly)
        cy = sum(p[1] for p in poly) / len(poly)
        z[f] = float((base @ np.array([cx, cy, 0.0, 1.0]))[2])
    return z


def collapse(state: State, reverse: list | None = None, flat: list | None = None):
    """Collapse the flat, creased sheet along all its creases (approximate layer order)."""
    s = state.clone()
    if len(s.pieces) != 1 or not np.allclose(s.pieces[0].M, np.eye(3), atol=1e-6):
        raise EngineError("collapse needs the paper flat, unfolded and in the starting position")
    before = snapshot(s)
    for a, b in reverse or []:
        hit = [c for c in s.creases
               if LineString([c.a, c.b]).buffer(1e-6).covers(LineString([a, b]))]
        if not hit:
            raise EngineError(f"no crease to reverse between {a} and {b}")
        s.creases.append(Crease(tuple(a), tuple(b), _flip(hit[-1].assignment)))
    fold_ = crease_pattern(s, flat)
    tree = face_tree(fold_)
    mats = face_transforms(fold_, tree)
    z = collapse_layers(fold_, tree)
    pieces = []
    for f, verts in enumerate(fold_["faces_vertices"]):
        m = mats[f]
        M = np.array([m[0], m[1], [0.0, 0.0, 1.0]], float)
        pieces.append(Piece(s.next_id + f, _ccw([tuple(fold_["vertices_coords"][v]) for v in verts]), M, 0))
        pieces[-1].layer = 0
    order = sorted(range(len(pieces)), key=lambda f: z[f])
    for rank, f in enumerate(order):
        pieces[f].layer = rank
    s.next_id += len(pieces)
    s.pieces = pieces
    s.collapse_flat = [list(map(list, seg)) for seg in flat or []]
    return s, _keyframe("collapse", before, s, approx_layers=True,
                        collapse={"fold": fold_, "face_tree": tree})
