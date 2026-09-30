import pytest
from fastapi.testclient import TestClient

from app import narrate as nar
from app.main import app

STEP = {"index": 0, "title": "Fold in half", "kind": "reference", "line": [[0, 0.5], [1, 0.5]],
        "assignment": "V", "edges": [], "cumulative_edges": [],
        "text": "Fold in half, bottom edge to top edge. Valley fold (toward you), then unfold."}


@pytest.fixture(autouse=True)
def _clean(monkeypatch):
    monkeypatch.delenv("GEMINI_API_KEY", raising=False)
    nar.clear_cache()
    yield
    nar.clear_cache()


def test_no_key_uses_template():
    r = nar.narrate(STEP, "normal")
    assert r == {"text": STEP["text"], "source": "template"}


def test_simpler_template_adds_help():
    r = nar.narrate(STEP, "simpler")
    assert r["source"] == "template"
    assert r["text"].startswith(STEP["text"]) and "mistake" in r["text"]


def test_generator_success_is_cached():
    calls = []

    def gen(system, prompt):
        calls.append(prompt)
        assert "patient origami teacher" in system and "valley" in prompt
        return "Bring the bottom edge up to the top edge."

    assert nar.narrate(STEP, "normal", generator=gen)["source"] == "gemini"
    assert nar.narrate(STEP, "normal", generator=gen)["text"].startswith("Bring")
    assert len(calls) == 1


def test_generator_error_falls_back():
    def boom(system, prompt):
        raise TimeoutError("slow")

    r = nar.narrate(STEP, "simpler", generator=boom)
    assert r["source"] == "template"


def test_endpoint_without_key():
    r = TestClient(app).post("/api/narrate", json={"step": STEP, "mode": "simpler"})
    assert r.status_code == 200 and r.json()["source"] == "template"
