"""FOLD construction and planar-graph helpers.

All coordinates live in the unit square [0,1]^2 with y pointing up.
"""
from __future__ import annotations

import math
from collections import defaultdict
from typing import Iterable, Sequence

EPS = 1e-6
SNAP = 1e-3

Point = tuple[float, float]
Segment = tuple[Point, Point, str]

_PRIORITY = {"M": 3, "V": 3, "F": 2, "B": 1}
_BOUNDARY: list[Segment] = [
    ((0.0, 0.0), (1.0, 0.0), "B"),
    ((1.0, 0.0), (1.0, 1.0), "B"),
    ((1.0, 1.0), (0.0, 1.0), "B"),
    ((0.0, 1.0), (0.0, 0.0), "B"),
]


# ---------------------------------------------------------------- basic geometry

def _snap_coord(c: float) -> float:
    if abs(c) < SNAP:
        return 0.0
    if abs(c - 1.0) < SNAP:
        return 1.0
    return c


def _clip_to_square(p: Point, q: Point) -> tuple[Point, Point] | None:
    """Liang-Barsky clip of segment pq to the unit square."""
    x0, y0 = p
    dx, dy = q[0] - x0, q[1] - y0
    t0, t1 = 0.0, 1.0
    for pk, qk in ((-dx, x0), (dx, 1 - x0), (-dy, y0), (dy, 1 - y0)):
        if abs(pk) < 1e-15:
            if qk < -EPS:
                return None
            continue
        t = qk / pk
        if pk < 0:
            t0 = max(t0, t)
        else:
            t1 = min(t1, t)
    if t0 > t1 + EPS:
        return None
    a = (_snap_coord(x0 + t0 * dx), _snap_coord(y0 + t0 * dy))
    b = (_snap_coord(x0 + t1 * dx), _snap_coord(y0 + t1 * dy))
    return a, b


def _point_on_segment(p: Point, a: Point, b: Point, tol: float = SNAP) -> bool:
    ax, ay = a
    bx, by = b
    dx, dy = bx - ax, by - ay
    L2 = dx * dx + dy * dy
    if L2 < EPS * EPS:
        return math.dist(p, a) < tol
    t = ((p[0] - ax) * dx + (p[1] - ay) * dy) / L2
    if t < -tol or t > 1 + tol:
        return False
    cx, cy = ax + t * dx, ay + t * dy
    return math.hypot(p[0] - cx, p[1] - cy) < tol


def _intersection(a: Point, b: Point, c: Point, d: Point) -> Point | None:
    """Proper or touching intersection of segments ab and cd (non-parallel)."""
    r = (b[0] - a[0], b[1] - a[1])
    s = (d[0] - c[0], d[1] - c[1])
    den = r[0] * s[1] - r[1] * s[0]
    if abs(den) < 1e-12:
        return None
    qp = (c[0] - a[0], c[1] - a[1])
    t = (qp[0] * s[1] - qp[1] * s[0]) / den
    u = (qp[0] * r[1] - qp[1] * r[0]) / den
    lr = math.hypot(*r)
    ls = math.hypot(*s)
    tt = SNAP / max(lr, EPS)
    tu = SNAP / max(ls, EPS)
    if -tt <= t <= 1 + tt and -tu <= u <= 1 + tu:
        return (a[0] + t * r[0], a[1] + t * r[1])
    return None


class _VertexIndex:
    """Merges points within SNAP using a hash grid."""

    def __init__(self) -> None:
        self.coords: list[Point] = []
        self._grid: dict[tuple[int, int], list[int]] = defaultdict(list)

    def add(self, p: Point) -> int:
        p = (_snap_coord(p[0]), _snap_coord(p[1]))
        gx, gy = int(math.floor(p[0] / SNAP)), int(math.floor(p[1] / SNAP))
        for dx in (-1, 0, 1):
            for dy in (-1, 0, 1):
                for i in self._grid[(gx + dx, gy + dy)]:
                    if math.dist(self.coords[i], p) < SNAP:
                        return i
        self.coords.append(p)
        idx = len(self.coords) - 1
        self._grid[(gx, gy)].append(idx)
        return idx


# ---------------------------------------------------------------- build_fold

def build_fold(segments: Iterable[Sequence]) -> dict:
    """Build a FOLD dict from (p1, p2, assignment) segments.

    Adds the square boundary, splits at all intersections, merges vertices
    within SNAP, removes zero-length/duplicate edges and computes faces.
    """
    segs: list[Segment] = list(_BOUNDARY)
    for p1, p2, asg in segments:
        clipped = _clip_to_square(tuple(map(float, p1)), tuple(map(float, p2)))
        if clipped is None:
            continue
        a, b = clipped
        if math.dist(a, b) < SNAP:
            continue
        segs.append((a, b, asg))

    cuts: list[list[Point]] = [[s[0], s[1]] for s in segs]
    n = len(segs)
    for i in range(n):
        a, b, _ = segs[i]
        for j in range(i + 1, n):
            c, d, _ = segs[j]
            # quick bbox reject
            if (max(a[0], b[0]) < min(c[0], d[0]) - SNAP or max(c[0], d[0]) < min(a[0], b[0]) - SNAP
                    or max(a[1], b[1]) < min(c[1], d[1]) - SNAP or max(c[1], d[1]) < min(a[1], b[1]) - SNAP):
                continue
            p = _intersection(a, b, c, d)
            if p is not None:
                cuts[i].append(p)
                cuts[j].append(p)
            else:
                # parallel: handle collinear overlaps / touching endpoints
                for q in (c, d):
                    if _point_on_segment(q, a, b):
                        cuts[i].append(q)
                for q in (a, b):
                    if _point_on_segment(q, c, d):
                        cuts[j].append(q)

    vidx = _VertexIndex()
    edge_map: dict[tuple[int, int], str] = {}
    edge_order: list[tuple[int, int]] = []
    for (a, b, asg), pts in zip(segs, cuts):
        dx, dy = b[0] - a[0], b[1] - a[1]
        pts_sorted = sorted(pts, key=lambda p: (p[0] - a[0]) * dx + (p[1] - a[1]) * dy)
        ids = [vidx.add(p) for p in pts_sorted]
        for u, v in zip(ids, ids[1:]):
            if u == v:
                continue
            key = (min(u, v), max(u, v))
            if key not in edge_map:
                edge_map[key] = asg
                edge_order.append(key)
            elif _PRIORITY[asg] > _PRIORITY[edge_map[key]]:
                edge_map[key] = asg

    # compact vertices to those used
    used = sorted({v for e in edge_order for v in e})
    remap = {old: new for new, old in enumerate(used)}
    coords = [list(vidx.coords[v]) for v in used]
    edges = [[remap[u], remap[v]] for u, v in edge_order]
    assigns = [edge_map[e] for e in edge_order]

    fold = {
        "vertices_coords": coords,
        "edges_vertices": edges,
        "edges_assignment": assigns,
        "faces_vertices": [],
    }
    fold["faces_vertices"] = compute_faces(fold)
    return fold


# ---------------------------------------------------------------- planar helpers

def _angle(fold: dict, u: int, v: int) -> float:
    (x1, y1), (x2, y2) = fold["vertices_coords"][u], fold["vertices_coords"][v]
    return math.atan2(y2 - y1, x2 - x1) % (2 * math.pi)


def vertex_neighbors_sorted(fold: dict, v: int) -> list[tuple[int, int, float]]:
    """(neighbor, edge index, angle) around v, sorted counter-clockwise by angle."""
    out = []
    for ei, (a, b) in enumerate(fold["edges_vertices"]):
        if a == v:
            out.append((b, ei, _angle(fold, v, b)))
        elif b == v:
            out.append((a, ei, _angle(fold, v, a)))
    out.sort(key=lambda t: t[2])
    return out


def _adjacency(fold: dict) -> dict[int, list[tuple[int, int, float]]]:
    adj: dict[int, list] = defaultdict(list)
    for ei, (a, b) in enumerate(fold["edges_vertices"]):
        adj[a].append((b, ei, _angle(fold, a, b)))
        adj[b].append((a, ei, _angle(fold, b, a)))
    for v in adj:
        adj[v].sort(key=lambda t: t[2])
    return adj


def polygon_area(pts: Sequence[Sequence[float]]) -> float:
    s = 0.0
    for i in range(len(pts)):
        x1, y1 = pts[i]
        x2, y2 = pts[(i + 1) % len(pts)]
        s += x1 * y2 - x2 * y1
    return s / 2


def compute_faces(fold: dict) -> list[list[int]]:
    """Planar face traversal; returns CCW faces (outer face dropped), sorted by centroid."""
    adj = _adjacency(fold)
    pos = {v: {nb: i for i, (nb, _, _) in enumerate(lst)} for v, lst in adj.items()}
    visited: set[tuple[int, int]] = set()
    coords = fold["vertices_coords"]
    faces = []
    for u in adj:
        for v, _, _ in adj[u]:
            if (u, v) in visited:
                continue
            face = []
            a, b = u, v
            for _ in range(10000):
                if (a, b) in visited:
                    break
                visited.add((a, b))
                face.append(a)
                lst = adj[b]
                i = pos[b][a]
                w = lst[(i - 1) % len(lst)][0]  # next clockwise from the reverse edge
                a, b = b, w
            if len(face) >= 3 and polygon_area([coords[i] for i in face]) > EPS * EPS:
                faces.append(face)

    def centroid(f):
        xs = [coords[i][0] for i in f]
        ys = [coords[i][1] for i in f]
        return (round(sum(xs) / len(xs), 6), round(sum(ys) / len(ys), 6))

    faces.sort(key=centroid)
    return faces


def is_boundary_vertex(fold: dict, v: int) -> bool:
    x, y = fold["vertices_coords"][v]
    return min(abs(x), abs(y), abs(1 - x), abs(1 - y)) < EPS


def face_adjacency(fold: dict) -> dict[tuple[int, int], int]:
    """{(f1, f2): edge index} for faces sharing an edge (f1 < f2)."""
    edge_index = {}
    for ei, (a, b) in enumerate(fold["edges_vertices"]):
        edge_index[(min(a, b), max(a, b))] = ei
    owners: dict[int, list[int]] = defaultdict(list)
    for fi, f in enumerate(fold["faces_vertices"]):
        for i in range(len(f)):
            a, b = f[i], f[(i + 1) % len(f)]
            ei = edge_index.get((min(a, b), max(a, b)))
            if ei is not None and fi not in owners[ei]:
                owners[ei].append(fi)
    out = {}
    for ei, fs in owners.items():
        if len(fs) == 2:
            f1, f2 = sorted(fs)
            out[(f1, f2)] = ei
    return out


def point_in_polygon(p: Point, pts: Sequence[Sequence[float]], strict: bool = True) -> bool:
    """Ray-casting test. With strict=True, points on the border return False."""
    n = len(pts)
    for i in range(n):
        if _point_on_segment(p, tuple(pts[i]), tuple(pts[(i + 1) % n]), tol=EPS * 10):
            return not strict
    inside = False
    x, y = p
    for i in range(n):
        x1, y1 = pts[i]
        x2, y2 = pts[(i + 1) % n]
        if (y1 > y) != (y2 > y):
            xi = x1 + (y - y1) * (x2 - x1) / (y2 - y1)
            if xi > x:
                inside = not inside
    return inside


def _line_key(p: Point, q: Point) -> tuple[float, float]:
    """(direction angle in [0, pi), signed offset) identifying the infinite line."""
    ang = math.atan2(q[1] - p[1], q[0] - p[0]) % math.pi
    if ang > math.pi - 1e-4:
        ang = 0.0
    nx, ny = -math.sin(ang), math.cos(ang)
    return ang, p[0] * nx + p[1] * ny


def merge_collinear_lines(fold: dict, include=("M", "V", "F")) -> list[dict]:
    """Group connected collinear edges into maximal lines.

    Returns [{p1, p2, edges, assignments, angle}] where p1/p2 are the extreme
    endpoints. Disjoint pieces on the same infinite line become separate lines.
    """
    coords = fold["vertices_coords"]
    groups: list[tuple[tuple[float, float], list[int]]] = []
    for ei, (a, b) in enumerate(fold["edges_vertices"]):
        if fold["edges_assignment"][ei] not in include:
            continue
        ang, off = _line_key(coords[a], coords[b])
        for (gang, goff), members in groups:
            dang = min(abs(ang - gang), math.pi - abs(ang - gang))
            if dang < 1e-3 and abs(off - goff) < SNAP:
                members.append(ei)
                break
        else:
            groups.append(((ang, off), [ei]))

    lines = []
    for (ang, _), members in groups:
        d = (math.cos(ang), math.sin(ang))
        proj = lambda v: coords[v][0] * d[0] + coords[v][1] * d[1]  # noqa: E731
        spans = []
        for ei in members:
            a, b = fold["edges_vertices"][ei]
            lo, hi = sorted((proj(a), proj(b)))
            va, vb = (a, b) if proj(a) <= proj(b) else (b, a)
            spans.append((lo, hi, va, vb, ei))
        spans.sort()
        chains: list[list] = []
        for s in spans:
            if chains and s[0] <= chains[-1][-1][1] + SNAP:
                chains[-1].append(s)
            else:
                chains.append([s])
        for ch in chains:
            start = ch[0][2]
            end = max(ch, key=lambda s: s[1])[3]
            edges = [s[4] for s in ch]
            lines.append({
                "p1": list(coords[start]),
                "p2": list(coords[end]),
                "edges": edges,
                "assignments": [fold["edges_assignment"][e] for e in edges],
                "angle": math.degrees(ang),
            })
    return lines


# ---------------------------------------------------------------- SVG

COLOURS = {"M": "#e53935", "V": "#1e88e5", "F": "#9e9e9e", "B": "#000000"}


def fold_to_svg(fold: dict, highlight_edges: Iterable[int] | None = None, size: int = 200) -> str:
    """Render a FOLD as SVG (y flipped so (0,0) is bottom-left)."""
    hl = set(highlight_edges or [])
    coords = fold["vertices_coords"]
    parts = [
        f'<svg xmlns="http://www.w3.org/2000/svg" viewBox="-0.02 -0.02 1.04 1.04" '
        f'width="{size}" height="{size}">',
        '<rect x="0" y="0" width="1" height="1" fill="#fffdf8"/>',
    ]
    order = sorted(range(len(fold["edges_vertices"])),
                   key=lambda e: {"F": 0, "M": 1, "V": 1, "B": 2}[fold["edges_assignment"][e]])
    for ei in order:
        a, b = fold["edges_vertices"][ei]
        asg = fold["edges_assignment"][ei]
        (x1, y1), (x2, y2) = coords[a], coords[b]
        width = 0.012 if ei in hl else 0.006
        dash = ' stroke-dasharray="0.025 0.015"' if asg == "V" else ""
        parts.append(
            f'<line x1="{x1:.5f}" y1="{1 - y1:.5f}" x2="{x2:.5f}" y2="{1 - y2:.5f}" '
            f'stroke="{COLOURS[asg]}" stroke-width="{width}" stroke-linecap="round"{dash}/>'
        )
    parts.append("</svg>")
    return "".join(parts)


def normalize_fold(fold: dict) -> dict:
    """Rebuild a (possibly hand-edited) FOLD so it is split, merged and has faces."""
    coords = fold["vertices_coords"]
    segs = [
        (coords[a], coords[b], asg)
        for (a, b), asg in zip(fold["edges_vertices"], fold["edges_assignment"])
        if asg != "B"
    ]
    return build_fold(segs)
