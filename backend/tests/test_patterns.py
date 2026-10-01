from app import db
from app.fold_utils import build_fold
from app.library import library_models


def _fold(mid):
    spec = next(s for s in library_models() if s["id"] == mid)
    return build_fold(spec["segments"])


def test_save_list_and_load(client):
    fold = _fold("waterbomb-base")
    uid = client.post("/api/users", json={"name": "Ana"}).json()["user_id"]
    assert client.get("/api/patterns", params={"user_id": uid}).json() == []
    pid = client.post("/api/patterns", json={"title": "My bomb", "fold": fold, "user_id": uid}).json()["id"]
    items = client.get("/api/patterns", params={"user_id": uid}).json()
    assert [i["title"] for i in items] == ["My bomb"] and items[0]["id"] == pid
    assert client.get("/api/patterns", params={"user_id": "someone-else"}).json() == []
    p = client.get(f"/api/patterns/{pid}").json()
    assert p["title"] == "My bomb" and p["fold"]["edges_vertices"]


def test_missing_pattern_and_bad_title(client):
    assert client.get("/api/patterns/999").status_code == 404
    assert client.post("/api/patterns", json={"title": "", "fold": _fold("kite-base")}).status_code == 422


def test_postgres_url_rewrite(monkeypatch):
    monkeypatch.setenv("DATABASE_URL", "postgres://u:p@host/db")
    assert db._url().startswith("postgresql://")
