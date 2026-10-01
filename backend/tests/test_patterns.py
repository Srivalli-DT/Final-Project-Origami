import pytest
from fastapi.testclient import TestClient

from app import db
from app.library import library_models
from app.fold_utils import build_fold


def get(mid):
    spec = next(s for s in library_models() if s["id"] == mid)
    fold = build_fold(spec["segments"])
    from app.guide import make_guide
    return {"fold": fold, "guide": make_guide(fold, spec.get("extra_steps"))}
from app.main import app


@pytest.fixture()
def client(tmp_path, monkeypatch):
    monkeypatch.setenv("DATABASE_URL", f"sqlite:///{tmp_path / 'test.db'}")
    db.reset_engine()
    with TestClient(app) as c:
        yield c
    db.reset_engine()


def test_save_list_and_load(client):
    fold = get("waterbomb-base")["fold"]
    assert client.get("/api/patterns").json() == []
    pid = client.post("/api/patterns", json={"title": "My bomb", "fold": fold}).json()["id"]
    items = client.get("/api/patterns").json()
    assert [i["title"] for i in items] == ["My bomb"] and items[0]["id"] == pid and items[0]["created_at"]
    p = client.get(f"/api/patterns/{pid}").json()
    assert p["title"] == "My bomb"
    assert p["fold"]["edges_vertices"]
    assert len(p["fold"]["edges_vertices"]) == len(fold["edges_vertices"])


def test_missing_pattern_and_bad_title(client):
    assert client.get("/api/patterns/999").status_code == 404
    fold = get("kite-base")["fold"]
    assert client.post("/api/patterns", json={"title": "", "fold": fold}).status_code == 422


def test_postgres_url_rewrite(monkeypatch):
    monkeypatch.setenv("DATABASE_URL", "postgres://u:p@host/db")
    assert db._url().startswith("postgresql://")
