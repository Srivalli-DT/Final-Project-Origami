import pytest

from app import ask as ask_mod

TUT = {"id": "t", "title": "Cup", "steps": [{"index": 0, "title": "Fold", "instruction": "Fold in half.",
                                             "tips": ["Line up corners."], "mistakes": ["Uneven edges."],
                                             "check": "A triangle."}]}


@pytest.fixture(autouse=True)
def _clean(monkeypatch):
    monkeypatch.delenv("GEMINI_API_KEY", raising=False)
    ask_mod.clear_cache()
    yield
    ask_mod.clear_cache()


def test_template_without_key():
    r = ask_mod.ask(TUT, 0)
    assert r["source"] == "template"
    assert "Line up corners." in r["text"] and "Uneven edges." in r["text"]


def test_generator_used_and_cached():
    calls = []

    def gen(system, prompt):
        calls.append(prompt)
        assert "3 short sentences" in system and "Question: why?" in prompt and "Model: Cup" in prompt
        return "Because the edges must meet."

    assert ask_mod.ask(TUT, 0, "why?", generator=gen)["source"] == "gemini"
    assert ask_mod.ask(TUT, 0, "WHY?", generator=gen)["text"].startswith("Because")
    assert len(calls) == 1


def test_generator_error_falls_back():
    def boom(system, prompt):
        raise TimeoutError

    assert ask_mod.ask(TUT, 0, "help", generator=boom)["source"] == "template"


def test_endpoint(client):
    r = client.post("/api/ask", json={"tutorial_id": "cup", "step_index": 0, "question": "how?"})
    assert r.status_code == 200 and r.json()["source"] == "template"
    assert client.post("/api/ask", json={"tutorial_id": "nope", "step_index": 0}).status_code == 404
    assert client.post("/api/ask", json={"tutorial_id": "cup", "step_index": 99}).status_code == 422
