def test_categories_and_tutorials(client):
    cats = client.get("/api/categories").json()
    assert {c["id"] for c in cats} >= {"foundations", "bases", "animals", "planes"}
    assert sum(c["count"] for c in cats) >= 12
    items = client.get("/api/tutorials").json()
    assert len(items) >= 12 and items[0]["thumbnail_svg"].startswith("<svg")
    bases = client.get("/api/tutorials", params={"category": "bases"}).json()
    assert bases and all(t["category"] == "bases" for t in bases)
    assert all(t["level"] == 1 for t in client.get("/api/tutorials", params={"level": 1}).json())
    assert [t["id"] for t in client.get("/api/tutorials", params={"q": "cup"}).json()] == ["cup"]


def test_tutorial_detail(client):
    t = client.get("/api/tutorials/square-base").json()
    assert t["steps"][-1]["op"] == "collapse" and t["final_svg"]
    step = t["steps"][0]
    assert {"index", "title", "op", "instruction", "tips", "mistakes", "symbol", "axis", "direction",
            "pieces_before", "state_after", "creases_so_far", "is_shaping"} <= set(step)
    assert client.get("/api/tutorials/nope").status_code == 404


def test_users_progress_levels(client):
    uid = client.post("/api/users", json={"name": "Ana"}).json()["user_id"]
    levels = client.get("/api/levels", params={"user_id": uid}).json()
    assert [lv["level"] for lv in levels] == [1, 2, 3, 4, 5]
    assert not levels[0]["locked"] and levels[1]["locked"]
    r = client.post("/api/progress", json={"user_id": uid, "tutorial_id": "cup", "step_index": 2}).json()
    assert r["xp"] == 30 and r["completed"] == []
    # finishing 60% of level 1 unlocks level 2
    for tid in levels[0]["tutorial_ids"]:
        client.post("/api/progress", json={"user_id": uid, "tutorial_id": tid, "step_index": 0, "completed": True})
    levels = client.get("/api/levels", params={"user_id": uid}).json()
    assert not levels[1]["locked"]
    p = client.get("/api/progress", params={"user_id": uid}).json()
    assert p["xp"] > 30 and len(p["completed"]) == len(levels[0]["tutorial_ids"])
    bad = client.post("/api/progress", json={"user_id": "nobody", "tutorial_id": "cup", "step_index": 0})
    assert bad.status_code == 404


def test_seed_is_idempotent(client):
    from app import db
    from app.seed import seed
    n = len(client.get("/api/tutorials").json())
    seed(db.get_engine())
    assert len(client.get("/api/tutorials").json()) == n
