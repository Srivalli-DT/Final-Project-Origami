from app.fold_utils import build_fold
from app.library import library_models
from app.studio import run_checks


def _lib(mid):
    spec = next(s for s in library_models() if s["id"] == mid)
    return build_fold(spec["segments"])


def by_rule(res):
    return {c["rule_id"]: c for c in res["checks"]}


def test_valid_library_patterns_pass_everything():
    for mid in ("preliminary-base", "miura-ori", "square-twist", "fish-base"):
        res = run_checks(_lib(mid))
        assert res["ok"], (mid, [c for c in res["checks"] if not c["ok"]])


def test_maekawa_failure_and_points():
    fold = build_fold([((0.5, 0.5), (1, 0.5), "V"), ((0.5, 0.5), (0, 0.5), "V"),
                       ((0.5, 0.5), (0.5, 1), "V"), ((0.5, 0.5), (0.5, 0), "V")])
    r = by_rule(run_checks(fold))
    assert not r["maekawa"]["ok"] and r["maekawa"]["points"] == [[0.5, 0.5]]
    assert r["kawasaki"]["ok"] and r["even-degree"]["ok"]


def test_kawasaki_and_odd_degree():
    fold = build_fold([((0.5, 0.5), (1, 0.5), "V"), ((0.5, 0.5), (0, 0.5), "V"), ((0.5, 0.5), (0.5, 1), "M")])
    r = by_rule(run_checks(fold))
    assert not r["even-degree"]["ok"] and not r["kawasaki"]["ok"] and not r["two-colourable"]["ok"]


def test_big_little_big():
    good = [((0.5, 0.5), (1, 0.5), "M"), ((0.5, 0.5), (0.5, 1), "V"),
            ((0.5, 0.5), (0, 0), "V"), ((0.5, 0.5), (1, 0), "V")]
    assert by_rule(run_checks(build_fold(good)))["big-little-big"]["ok"]
    bad = [((0.5, 0.5), (1, 0.5), "V"), ((0.5, 0.5), (0.5, 1), "M"),
           ((0.5, 0.5), (0, 0), "V"), ((0.5, 0.5), (1, 0), "V")]
    r = by_rule(run_checks(build_fold(bad)))
    assert not r["big-little-big"]["ok"]


def test_exceptions_skip_checks():
    fold = build_fold([((0.5, 0.5), (1, 0.5), "V"), ((0.5, 0.5), (0, 0.5), "V"), ((0.5, 0.5), (0.5, 1), "M")])
    r = by_rule(run_checks(fold, {"non_flat": True}))
    assert r["maekawa"]["skipped"] and r["kawasaki"]["skipped"] and not r["even-degree"]["skipped"]
    r = by_rule(run_checks(fold, {"curved": True}))
    assert r["kawasaki"]["skipped"] and not r["maekawa"]["skipped"]
    cut = build_fold([((0.5, 0.5), (1, 0.5), "V"), ((0.5, 0.5), (0, 0.5), "C"), ((0.5, 0.5), (0.5, 1), "M")])
    r = by_rule(run_checks(cut, {"allow_cuts": True}))
    assert r["even-degree"]["ok"] and r["maekawa"]["ok"]


def test_api(client):
    fold = _lib("waterbomb-base")
    res = client.post("/api/studio/check", json={"fold": fold, "exceptions": {}}).json()
    assert res["ok"] and len(res["checks"]) == 5
    prev = client.post("/api/studio/preview", json={"fold": fold}).json()
    assert {"face_tree", "folded_coords", "faces", "difficulty"} <= set(prev)
    rules = client.get("/api/rules").json()
    ids = [r["id"] for r in rules]
    assert ids[:5] == ["maekawa", "kawasaki", "even-degree", "big-little-big", "two-colourable"]
    assert rules[0]["demo_fold"]["edges_vertices"] and rules[0]["exceptions"]
    # every rule demo passes its own check
    for r in rules:
        if r.get("demo_fold"):
            checks = {c["rule_id"]: c for c in client.post(
                "/api/studio/check", json={"fold": r["demo_fold"]}).json()["checks"]}
            if r["id"] in checks:
                assert checks[r["id"]]["ok"], r["id"]
