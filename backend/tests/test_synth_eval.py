from app.eval import crease_segments, evaluate, match
from app.fold_utils import build_fold
from app.synth import make_dataset


def test_crease_segments_split_by_assignment():
    f = build_fold([((0, 0.5), (0.5, 0.5), "M"), ((0.5, 0.5), (1, 0.5), "V"), ((0.5, 0), (0.5, 1), "V")])
    segs = crease_segments(f)
    assert sorted(s[2] for s in segs) == ["M", "V", "V"]


def test_match_perfect():
    f = build_fold([((0, 0.5), (1, 0.5), "M")])
    s = crease_segments(f)
    assert match(s, s)["tp"] == 1


def test_dataset_and_small_eval(tmp_path):
    items = make_dataset(n=4, seed=1, out_dir=tmp_path)
    assert len(items) == 4 and all(i["png"].exists() for i in items)
    summary = evaluate(n=3, seed=1, out_dir=tmp_path)
    assert summary["all"]["recall"] > 0.8
