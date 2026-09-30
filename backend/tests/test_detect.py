import cv2
import numpy as np
from fastapi.testclient import TestClient

from app.catalog import get
from app.detect import detect
from app.eval import crease_segments, match
from app.fold_utils import build_fold
from app.main import app
from app.synth import augment, render_fold


def _recall(fold):
    res = detect(render_fold(fold))
    m = match(crease_segments(res["fold"]), crease_segments(fold))
    return m["tp"] / m["n_gt"], res


def test_clean_synthetic_recovers_creases():
    total_tp = total_gt = 0
    for mid in ("preliminary-base", "pleat-8", "fish-base"):
        fold = get(mid)["fold"]
        res = detect(render_fold(fold))
        m = match(crease_segments(res["fold"]), crease_segments(fold))
        total_tp += m["tp"]
        total_gt += m["n_gt"]
    assert total_tp / total_gt >= 0.95


def test_clean_detection_validates_and_reports_grid():
    recall, res = _recall(get("preliminary-base")["fold"])
    assert recall == 1.0
    assert res["grid"] > 0
    assert 0 < res["confidence"] <= 1
    assert res["overlay_png_b64"]


def test_mild_augmentation_still_works():
    fold = build_fold([((0, 0.5), (1, 0.5), "M"), ((0.5, 0), (0.5, 1), "V")])
    img = augment(render_fold(fold), "mild", np.random.default_rng(1))
    res = detect(img)
    m = match(crease_segments(res["fold"]), crease_segments(fold))
    assert m["tp"] == 2


def test_detect_endpoint():
    ok, buf = cv2.imencode(".png", render_fold(get("pleat-8")["fold"]))
    client = TestClient(app)
    r = client.post("/api/detect", files={"image": ("cp.png", buf.tobytes(), "image/png")})
    assert r.status_code == 200
    body = r.json()
    assert set(body) == {"fold", "overlay_png_b64", "confidence", "grid"}
    assert client.post("/api/detect", files={"image": ("x.png", b"nope", "image/png")}).status_code == 400
