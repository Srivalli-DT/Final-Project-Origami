"""Library catalogue: builds every model once and caches its guide."""
from __future__ import annotations

from functools import lru_cache

from .fold_utils import build_fold, fold_to_svg
from .guide import make_guide
from .library import library_models


@lru_cache(maxsize=1)
def _catalog() -> dict[str, dict]:
    out = {}
    for spec in library_models():
        fold = build_fold(spec["segments"])
        out[spec["id"]] = {
            "id": spec["id"],
            "title": spec["title"],
            "category": spec["category"],
            "description": spec["description"],
            "fold": fold,
            "guide": make_guide(fold, spec.get("extra_steps")),
            "thumbnail_svg": fold_to_svg(fold),
        }
    return out


def summaries() -> list[dict]:
    return [
        {
            "id": m["id"],
            "title": m["title"],
            "category": m["category"],
            "difficulty": m["guide"]["difficulty"],
            "thumbnail_svg": m["thumbnail_svg"],
        }
        for m in _catalog().values()
    ]


def get(model_id: str) -> dict | None:
    m = _catalog().get(model_id)
    if m is None:
        return None
    return {k: m[k] for k in ("id", "title", "category", "description", "fold", "guide")}


def normalize_fold(fold: dict) -> dict:
    """Rebuild a (possibly hand-edited) FOLD so it is split, merged and has faces."""
    coords = fold["vertices_coords"]
    segs = [
        (coords[a], coords[b], asg)
        for (a, b), asg in zip(fold["edges_vertices"], fold["edges_assignment"])
        if asg != "B"
    ]
    return build_fold(segs)


def warm() -> None:
    _catalog()
