from app.fold_utils import build_fold
from app.library import library_models
from app.validate import validate


def test_every_library_model_validates():
    for spec in library_models():
        r = validate(build_fold(spec["segments"]))
        assert r["ok"], (spec["id"], [v for v in r["vertices"] if not v["ok"]])


def test_flipped_assignment_fails_maekawa():
    spec = next(s for s in library_models() if s["id"] == "preliminary-base")
    segs = list(spec["segments"])
    p1, p2, _ = segs[-1]  # the single valley book-fold ray
    segs[-1] = (p1, p2, "M")
    r = validate(build_fold(segs))
    assert not r["ok"]
    bad = [v for v in r["vertices"] if not v["maekawa_ok"]]
    assert bad and "Maekawa" in bad[0]["reasons"][0]


def test_kawasaki_failure_reported():
    # a degree-4 vertex whose alternate angles are not 180
    segs = [((0.5, 0.5), (1, 0.5), "M"), ((0.5, 0.5), (0.5, 1), "M"),
            ((0.5, 0.5), (0, 0.8), "M"), ((0.5, 0.5), (0.5, 0), "V")]
    r = validate(build_fold(segs))
    v = r["vertices"][0]
    assert v["maekawa_ok"] and not v["kawasaki_ok"]
