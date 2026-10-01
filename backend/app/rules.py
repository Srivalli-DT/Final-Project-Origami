"""Rules content: turns rules.yaml entries into API objects (with demo crease patterns)."""
from __future__ import annotations

from .fold_utils import build_fold


def build_rule(r: dict) -> dict:
    out = {
        "id": r["id"],
        "title": r["title"],
        "statement": r.get("statement", ""),
        "why": r.get("why", ""),
        "example": r.get("example", ""),
        "details": r.get("details", []),
        "exceptions": r.get("exceptions", []),
        "checkable": bool(r.get("checkable", False)),
    }
    if r.get("demo_segments"):
        out["demo_fold"] = build_fold([(tuple(a), tuple(b), asg) for a, b, asg in r["demo_segments"]])
    return out
