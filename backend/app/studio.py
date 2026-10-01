"""Studio rule checks on a user-drawn crease pattern.

Checks are local (per vertex) or face-based. They are necessary conditions for
flat-foldability; global layer ordering is NP-hard and not checked.
"""
from __future__ import annotations

import math
from collections import deque

from .fold_utils import face_adjacency, is_boundary_vertex, normalize_fold, vertex_neighbors_sorted
from .guide import difficulty, face_tree, folded_coordinates

RULES = ("maekawa", "kawasaki", "even-degree", "big-little-big", "two-colourable")
FLAT_RULES = {"maekawa", "kawasaki", "big-little-big"}
CURVED_SKIP = {"kawasaki", "big-little-big"}
ANGLE_TOL = 1e-4


def _cut_vertices(fold: dict) -> set[int]:
    out = set()
    for (a, b), asg in zip(fold["edges_vertices"], fold["edges_assignment"]):
        if asg == "C":
            out.update((a, b))
    return out


def _vertex_creases(fold: dict, v: int):
    """[(angle, assignment)] of M/V creases around v, sorted counter-clockwise."""
    return [(ang, fold["edges_assignment"][ei]) for _, ei, ang in vertex_neighbors_sorted(fold, v)
            if fold["edges_assignment"][ei] in ("M", "V")]


def _sectors(angles: list[float]) -> list[float]:
    n = len(angles)
    return [(angles[(i + 1) % n] - angles[i]) % (2 * math.pi) for i in range(n)]


def interior_vertices(fold: dict, skip: set[int]) -> list[int]:
    out = []
    for v in range(len(fold["vertices_coords"])):
        if v in skip or is_boundary_vertex(fold, v):
            continue
        if _vertex_creases(fold, v):
            out.append(v)
    return out


def check_maekawa(fold, verts):
    bad = []
    for v in verts:
        cr = _vertex_creases(fold, v)
        m = sum(1 for _, a in cr if a == "M")
        if abs(m - (len(cr) - m)) != 2:
            bad.append(v)
    return bad, "|M − V| = 2 at every interior vertex."


def check_kawasaki(fold, verts):
    bad = []
    for v in verts:
        cr = _vertex_creases(fold, v)
        if len(cr) % 2:
            bad.append(v)
            continue
        sec = _sectors([a for a, _ in cr])
        if abs(sum(sec[0::2]) - math.pi) > ANGLE_TOL:
            bad.append(v)
    return bad, "Alternate angles around each vertex sum to 180°."


def check_even_degree(fold, verts):
    return [v for v in verts if len(_vertex_creases(fold, v)) % 2], \
        "Every interior vertex has an even number of creases."


def check_big_little_big(fold, verts):
    """A strictly smallest sector must be bounded by one mountain and one valley."""
    bad = []
    for v in verts:
        cr = _vertex_creases(fold, v)
        n = len(cr)
        if n < 4:
            continue
        sec = _sectors([a for a, _ in cr])
        for i in range(n):
            prev, nxt = sec[(i - 1) % n], sec[(i + 1) % n]
            if sec[i] < prev - ANGLE_TOL and sec[i] < nxt - ANGLE_TOL:
                if cr[i][1] == cr[(i + 1) % n][1]:
                    bad.append(v)
                    break
    return bad, "Creases around a strictly smallest angle have opposite types."


def check_two_colourable(fold, _verts):
    """Faces 2-coloured so that faces across every fold (M/V) differ."""
    faces = fold["faces_vertices"]
    adj: dict[int, list[tuple[int, bool]]] = {i: [] for i in range(len(faces))}
    for (f1, f2), ei in face_adjacency(fold).items():
        crossing = fold["edges_assignment"][ei] in ("M", "V")
        adj[f1].append((f2, crossing))
        adj[f2].append((f1, crossing))
    colour: dict[int, int] = {}
    bad_edges = set()
    for start in range(len(faces)):
        if start in colour:
            continue
        colour[start] = 0
        q = deque([start])
        while q:
            f = q.popleft()
            for g, crossing in adj[f]:
                want = colour[f] ^ int(crossing)
                if g not in colour:
                    colour[g] = want
                    q.append(g)
                elif colour[g] != want:
                    bad_edges.add(tuple(sorted(set(faces[f]) & set(faces[g]))))
    bad = sorted({v for e in bad_edges for v in e if not is_boundary_vertex(fold, v)})
    return bad, "Faces can be coloured with two colours, alternating across every fold."


CHECKS = {
    "maekawa": check_maekawa,
    "kawasaki": check_kawasaki,
    "even-degree": check_even_degree,
    "big-little-big": check_big_little_big,
    "two-colourable": check_two_colourable,
}


def run_checks(fold_in: dict, exceptions: dict | None = None) -> dict:
    exceptions = exceptions or {}
    fold = normalize_fold(fold_in)
    skip_vertices = _cut_vertices(fold) if exceptions.get("allow_cuts") else set()
    verts = interior_vertices(fold, skip_vertices)
    checks = []
    for rid in RULES:
        skipped = (exceptions.get("non_flat") and rid in FLAT_RULES) or \
                  (exceptions.get("curved") and rid in CURVED_SKIP)
        if skipped:
            checks.append({"rule_id": rid, "ok": True, "skipped": True, "vertices": [], "points": [],
                           "message": "Skipped by an exception."})
            continue
        bad, message = CHECKS[rid](fold, verts)
        checks.append({
            "rule_id": rid,
            "ok": not bad,
            "skipped": False,
            "vertices": bad,
            "points": [fold["vertices_coords"][v] for v in bad],
            "message": message if not bad else f"{len(bad)} vertex(es) break it. {message}",
        })
    return {"ok": all(c["ok"] for c in checks), "checks": checks, "fold": fold,
            "interior_vertices": len(verts)}


def preview(fold_in: dict) -> dict:
    fold = normalize_fold(fold_in)
    tree = face_tree(fold)
    return {"face_tree": tree, "folded_coords": folded_coordinates(fold, tree), "faces": fold["faces_vertices"],
            "difficulty": difficulty(fold), "fold": fold}
