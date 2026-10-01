"""The CreaseLens fold engine: a flat-folding simulator for step-by-step tutorials."""
from __future__ import annotations

from . import ops
from .lines import parse_line
from .refs import resolve
from .state import Crease, EngineError, Paper, Piece, State, initial_state

__all__ = ["run_step", "initial_state", "Paper", "State", "Piece", "Crease", "EngineError", "creases_json"]


def _opt_point(ref, state):
    return None if ref is None else resolve(ref, state)


def run_step(state: State, step: dict) -> tuple[State, dict]:
    """Execute one tutorial step (already-parsed YAML dict). Records history."""
    op = step.get("op")
    if op == "fold":
        line = parse_line(step["line"], state)
        new, kf = ops.fold(state, line, step.get("kind", "valley"), _opt_point(step.get("move"), state),
                           step.get("layers", "all"), int(step.get("flap_count", 1)), step.get("paper_rect"))
    elif op == "crease":
        entries = step.get("lines") or [{k: step[k] for k in
                                         ("line", "kind", "clip", "move", "layers", "flap_count", "paper_rect")
                                         if k in step}]
        parsed = []
        for e in entries:
            parsed.append({
                "line": parse_line(e["line"], state),
                "kind": e.get("kind", step.get("kind", "valley")),
                "clip": [resolve(c, state) for c in e["clip"]] if e.get("clip") else None,
                "move": _opt_point(e.get("move"), state),
                "layers": e.get("layers", "all"),
                "flap_count": int(e.get("flap_count", 1)),
                "paper_rect": e.get("paper_rect"),
            })
        new, kf = ops.crease(state, parsed)
    elif op == "turn_over":
        new, kf = ops.turn_over(state, step.get("axis", "vertical"))
    elif op == "rotate":
        new, kf = ops.rotate(state, float(step.get("deg", 90)))
    elif op == "unfold":
        new, kf = ops.unfold(state, int(step.get("to_step", -1)))
    elif op == "collapse":
        rev = [[tuple(_paper(a, state)), tuple(_paper(b, state))] for a, b in step.get("reverse", [])]
        flat = [[tuple(_paper(a, state)), tuple(_paper(b, state))] for a, b in step.get("flat", [])]
        new, kf = ops.collapse(state, rev, flat)
    elif op == "shape":
        new, kf = ops.shape(state, step.get("note", ""))
    else:
        raise EngineError(f"unknown op {op!r}")
    new.history.append([Piece(p.id, list(p.paper_poly), p.M.copy(), p.layer) for p in new.pieces])
    kf["creases_so_far"] = creases_json(new)
    return new, kf


def _paper(ref, state):
    """Paper coordinates written as [x, y] (expressions allowed)."""
    from .refs import num
    return num(ref[0], state), num(ref[1], state)


def creases_json(state: State) -> list[dict]:
    return [{"a": [round(c.a[0], 6), round(c.a[1], 6)], "b": [round(c.b[0], 6), round(c.b[1], 6)],
             "assignment": c.assignment} for c in state.creases]
