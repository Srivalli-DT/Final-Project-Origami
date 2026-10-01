import math

import numpy as np
import pytest

from app.engine import EngineError, Paper, initial_state, run_step
from app.engine.lines import line_to_line, point_to_line_through, point_to_point, through
from app.engine.ops import crease_pattern
from app.validate import validate

T22 = math.tan(math.radians(22.5))


def run(steps, paper=None):
    s = initial_state(paper)
    frames = []
    for st in steps:
        s, kf = run_step(s, st)
        frames.append(kf)
    return s, frames


def area(s):
    x0, y0, x1, y1 = s.bbox()
    return (x1 - x0) * (y1 - y0)


def test_valley_fold_in_half():
    s, (kf,) = run([{"op": "fold", "line": {"through": ["P(0,0.5)", "P(1,0.5)"]}, "kind": "valley"}])
    assert len(s.pieces) == 2
    moving = [p for p in kf["pieces_before"] if p["moving"]]
    assert len(moving) == 1
    after = {p["id"]: p for p in kf["state_after"]}
    assert after[moving[0]["id"]]["face_up"] is False
    assert abs(area(s) - 0.5) < 1e-9
    assert kf["direction"] == 1
    # the moving (bottom) half ends on top
    assert after[moving[0]["id"]]["layer"] == 1
    assert len(s.creases) == 1 and s.creases[0].assignment == "V"


def test_mountain_fold_goes_behind():
    s, (kf,) = run([{"op": "fold", "line": {"horizontal": "P(0,0.5)"}, "kind": "mountain"}])
    moving = [p["id"] for p in kf["pieces_before"] if p["moving"]]
    after = {p["id"]: p for p in kf["state_after"]}
    assert after[moving[0]]["layer"] == 0
    assert s.creases[0].assignment == "M"


def test_turn_over_flips_every_piece():
    s, _ = run([{"op": "fold", "line": {"through": ["P(0,0)", "P(1,1)"]}}])
    ups = [p.face_up(s.paper) for p in s.pieces]
    s2, _ = run_step(s, {"op": "turn_over"})
    assert [p.face_up(s2.paper) for p in s2.pieces] == [not u for u in ups]


def test_crease_leaves_state_unchanged():
    s, (kf,) = run([{"op": "crease", "line": {"through": ["P(0,0)", "P(1,1)"]}}])
    assert len(s.pieces) == 1 and np.allclose(s.pieces[0].M, np.eye(3))
    assert len(s.creases) == 1
    assert kf["op"] == "crease" and any(p["moving"] for p in kf["pieces_before"])


def test_crease_on_back_side_records_flipped_assignment():
    s, _ = run([{"op": "turn_over"}, {"op": "crease", "line": {"horizontal": "P(0,0.5)"}, "kind": "valley"}])
    assert s.creases[0].assignment == "M"


def test_preliminary_collapse_quarter_bbox():
    steps = [
        {"op": "crease", "line": {"through": ["P(0,0)", "P(1,1)"]}, "kind": "valley"},
        {"op": "crease", "line": {"through": ["P(1,0)", "P(0,1)"]}, "kind": "valley"},
        {"op": "crease", "line": {"horizontal": "P(0,0.5)"}, "kind": "mountain"},
        {"op": "crease", "line": {"vertical": "P(0.5,0)"}, "kind": "mountain"},
        {"op": "collapse", "flat": [[[0.5, 0.5], [0, 0]], [[0.5, 0.5], [1, 1]]]},
    ]
    s, frames = run(steps)
    assert validate(frames[-1]["collapse"]["fold"])["ok"]
    assert abs(area(s) - 0.25) < 1e-6
    assert frames[-1]["approx_layers"] and frames[-1]["collapse"]["fold"]["faces_vertices"]
    assert len({p.layer for p in s.pieces}) == len(s.pieces)


def test_kite_base_creases_validate():
    s, _ = run([
        {"op": "crease", "line": {"through": ["P(0,0)", "P(1,1)"]}},
        {"op": "fold", "line": {"line_to_line": [["P(0,0)", "P(1,0)"], ["P(0,0)", "P(1,1)"]]}},
        {"op": "fold", "line": {"line_to_line": [["P(0,0)", "P(0,1)"], ["P(0,0)", "P(1,1)"]]}},
    ])
    fold = crease_pattern(s)
    assert validate(fold)["ok"]
    assert len(s.creases) == 3


def test_flap_fold_moves_only_top_layer():
    s, (_, kf) = run([
        {"op": "fold", "line": {"horizontal": "P(0,0.5)"}},
        {"op": "fold", "line": {"vertical": "F(0.5,0.75)"}, "move": "F(0.25,0.75)", "layers": "flap"},
    ])
    assert sum(p["moving"] for p in kf["pieces_before"]) == 1
    assert len(s.pieces) == 3


def test_unfold_restores_and_keeps_creases():
    s, _ = run([
        {"op": "fold", "line": {"horizontal": "P(0,0.5)"}},
        {"op": "fold", "line": {"vertical": "P(0.5,0)"}},
        {"op": "unfold", "to_step": -1},
    ])
    assert len(s.pieces) == 1 and len(s.creases) == 3


def test_rotate_keeps_shape():
    s, (_, kf) = run([{"op": "fold", "line": {"through": ["P(0,0)", "P(1,1)"]}}, {"op": "rotate", "deg": 45}])
    assert kf["rotate_deg"] == 45
    assert abs(sum(abs(p.det) for p in s.pieces) - 2) < 1e-9


def test_rectangle_paper_and_refs():
    s, _ = run([{"op": "crease", "line": {"vertical": "mid:bottom"}}], Paper(1, 1.414))
    assert abs(s.creases[0].b[1] - 1.414) < 1e-9 or abs(s.creases[0].a[1] - 1.414) < 1e-9


def test_errors_are_reported():
    with pytest.raises(EngineError, match="misses"):
        run([{"op": "fold", "line": {"horizontal": "F(0,5)"}}])
    with pytest.raises(EngineError, match="not on any piece"):
        run([{"op": "fold", "line": {"horizontal": "F(0,0.5)"}, "move": "F(3,3)", "layers": "flap"}])
    with pytest.raises(EngineError, match="flat, unfolded"):
        run([{"op": "fold", "line": {"horizontal": "P(0,0.5)"}}, {"op": "collapse"}])


def test_axioms():
    p, d = point_to_point([0, 0], [1, 0])
    assert np.allclose(p, [0.5, 0]) and abs(d[0]) < 1e-12
    p, d = line_to_line(through([0, 0], [1, 0]), through([0, 0], [0, 1]))
    assert np.allclose(abs(d[0]), abs(d[1]))
    p, d = point_to_line_through([0, 0], through([0, 1], [1, 1]), [0.5, 0.5])
    # reflecting (0,0) across the fold lands on y = 1
    n = np.array([-d[1], d[0]])
    refl = np.array([0, 0]) - 2 * ((np.array([0, 0]) - p) @ n) * n
    assert abs(refl[1] - 1) < 1e-9
