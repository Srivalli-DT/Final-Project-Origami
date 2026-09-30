"""Write frontend/src/mock/*.json from real API output: python -m scripts.export_mocks"""
import json
from pathlib import Path

from fastapi.testclient import TestClient

from app.main import app

OUT = Path(__file__).resolve().parents[2] / "frontend" / "src" / "mock"


def main() -> None:
    OUT.mkdir(parents=True, exist_ok=True)
    with TestClient(app) as client:
        items = client.get("/api/library").json()
        (OUT / "library.json").write_text(json.dumps(items), encoding="utf-8")
        for it in items:
            model = client.get(f"/api/library/{it['id']}").json()
            (OUT / f"model-{it['id']}.json").write_text(json.dumps(model), encoding="utf-8")
    print(f"wrote {len(items) + 1} files to {OUT}")


if __name__ == "__main__":
    main()
