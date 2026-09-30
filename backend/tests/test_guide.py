from app.catalog import get
from app.fold_utils import EPS, build_fold
from app.guide import make_guide


def test_preliminary_base_steps():
    g = get("preliminary-base")["guide"]
    kinds = [s["kind"] for s in g["steps"]]
    assert kinds.count("reference") == 4
    assert kinds.count("collapse") == 1
    assert kinds[:2] == ["reference", "reference"]
    # book folds before diagonals
    assert "half" in g["steps"][0]["title"] and "corner" in g["steps"][2]["title"]


def test_pleat_folded_coords_collapse_to_one_strip():
    g = get("pleat-8")["guide"]
    for x, _ in g["folded_coords"]:
        assert -EPS <= x <= 0.125 + EPS


def test_cumulative_edges_grow():
    g = get("pleat-8")["guide"]
    prev = set()
    for s in g["steps"]:
        cur = set(s["cumulative_edges"])
        assert prev <= cur
        assert set(s["edges"]) <= cur
        prev = cur


def test_face_tree_spans_all_faces():
    for mid in ("kite-base", "miura-ori", "square-twist", "sonobe-unit"):
        m = get(mid)
        tree = m["guide"]["face_tree"]
        assert len(tree["nodes"]) == len(m["fold"]["faces_vertices"])
        assert tree["nodes"][0]["parent"] == -1


def test_difficulty_labels():
    g = make_guide(build_fold([]))
    assert g["difficulty"]["label"] == "Beginner"
    assert get("miura-ori")["guide"]["difficulty"]["score"] > get("kite-base")["guide"]["difficulty"]["score"]


def test_sonobe_has_assembly_step():
    g = get("sonobe-unit")["guide"]
    assert g["steps"][-1]["kind"] == "assembly"


def test_many_lines_merge_into_one_step():
    segs = [((k / 32, 0), (k / 32, 1), "M" if k % 2 else "V") for k in range(1, 32) if k % 2]
    g = make_guide(build_fold(segs))
    pre = [s for s in g["steps"] if s["kind"] == "precrease"]
    assert len(pre) == 1 and len(pre[0]["edges"]) == 16
