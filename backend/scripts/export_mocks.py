"""Write frontend/src/mock/*.json from real API output: python -m scripts.export_mocks"""
import json
import os
import tempfile
from pathlib import Path

OUT = Path(__file__).resolve().parents[2] / "frontend" / "src" / "mock"


def main() -> None:
    os.environ["DATABASE_URL"] = f"sqlite:///{Path(tempfile.mkdtemp()) / 'mocks.db'}"
    from fastapi.testclient import TestClient

    from app.main import app

    OUT.mkdir(parents=True, exist_ok=True)
    for old in OUT.glob("*.json"):
        old.unlink()
    with TestClient(app) as client:
        def dump(name, data):
            (OUT / name).write_text(json.dumps(data, separators=(",", ":")), encoding="utf-8")

        dump("categories.json", client.get("/api/categories").json())
        items = client.get("/api/tutorials").json()
        dump("tutorials.json", items)
        dump("levels.json", client.get("/api/levels").json())
        dump("rules.json", client.get("/api/rules").json())
        for it in items:
            dump(f"tutorial-{it['id']}.json", client.get(f"/api/tutorials/{it['id']}").json())
    print(f"wrote mocks for {len(items)} tutorials to {OUT}")


if __name__ == "__main__":
    main()
