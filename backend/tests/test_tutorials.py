import pytest

from app.tutorials.compile import CATEGORIES, compile_file, load_spec, tutorial_paths

PATHS = tutorial_paths()


def test_there_are_tutorials():
    assert len(PATHS) >= 12


@pytest.mark.parametrize("path", PATHS, ids=lambda p: p.stem)
def test_tutorial_compiles(path):
    out = compile_file(path)
    assert out["steps"] and out["final_svg"].startswith("<svg")
    for st in out["steps"]:
        if st["is_shaping"]:
            continue
        assert st["axis"] is not None or st["op"] in {"turn_over", "rotate", "collapse", "unfold"}, st["title"]
        assert len(st["instruction"].split()) <= 12
        assert st["tips"] and st["mistakes"]
        assert st["state_after"] and "creases_so_far" in st


@pytest.mark.parametrize("path", PATHS, ids=lambda p: p.stem)
def test_level_and_category_valid(path):
    spec = load_spec(path)
    assert 1 <= spec.level <= 5
    assert spec.category in CATEGORIES
    assert spec.id == path.stem
