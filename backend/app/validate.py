"""Local flat-foldability checks (Maekawa and Kawasaki).

These are *local, necessary* conditions checked independently at every
interior vertex. Passing them does not guarantee the whole crease pattern
folds flat: global flat-foldability (finding a valid layer order) is NP-hard
(Bern & Hayes 1996) and is out of scope here.
"""
from __future__ import annotations

import math

from .fold_utils import is_boundary_vertex, vertex_neighbors_sorted

KAWASAKI_TOL = 1e-4


def check_vertex(fold: dict, v: int) -> dict | None:
    """Return the check dict for an interior vertex, or None if not applicable."""
    if is_boundary_vertex(fold, v):
        return None
    creases = [(nb, ei, ang) for nb, ei, ang in vertex_neighbors_sorted(fold, v)
               if fold["edges_assignment"][ei] in ("M", "V")]
    if not creases:
        return None

    reasons: list[str] = []
    n_m = sum(1 for _, ei, _ in creases if fold["edges_assignment"][ei] == "M")
    n_v = len(creases) - n_m
    maekawa_ok = abs(n_m - n_v) == 2
    if not maekawa_ok:
        reasons.append(
            f"Maekawa: {n_m} mountain vs {n_v} valley (difference must be 2)"
        )

    deg = len(creases)
    if deg % 2:
        kawasaki_ok = False
        reasons.append(f"Kawasaki: odd number of creases ({deg}); needs an even degree")
    else:
        angles = [a for _, _, a in creases]
        sectors = [(angles[(i + 1) % deg] - angles[i]) % (2 * math.pi) for i in range(deg)]
        alt = sum(sectors[0::2])
        kawasaki_ok = abs(alt - math.pi) <= KAWASAKI_TOL
        if not kawasaki_ok:
            reasons.append(
                f"Kawasaki: alternate angles sum to {math.degrees(alt):.2f}° "
                f"(must be 180°)"
            )
    return {
        "vertex": v,
        "ok": maekawa_ok and kawasaki_ok,
        "maekawa_ok": maekawa_ok,
        "kawasaki_ok": kawasaki_ok,
        "reasons": reasons,
    }


def validate(fold: dict) -> dict:
    """Check every interior vertex with M/V creases. Returns {ok, vertices}."""
    results = []
    for v in range(len(fold["vertices_coords"])):
        r = check_vertex(fold, v)
        if r is not None:
            results.append(r)
    return {"ok": all(r["ok"] for r in results), "vertices": results}
