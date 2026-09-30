from fastapi.testclient import TestClient

from app.main import app

client = TestClient(app)


def test_library_list_and_detail():
    items = client.get("/api/library").json()
    assert len(items) >= 6
    assert {i["category"] for i in items} == {"bases", "tessellations", "modular"}
    m = client.get(f"/api/library/{items[0]['id']}").json()
    assert set(m) == {"id", "title", "category", "description", "fold", "guide"}
    assert client.get("/api/library/nope").status_code == 404


def test_post_guide_roundtrip():
    fold = client.get("/api/library/preliminary-base").json()["fold"]
    g = client.post("/api/guide", json={"fold": fold}).json()
    assert g["validation"]["ok"]
    assert len(g["steps"]) == 5
