"""Synthetic crease-pattern images for testing and evaluating detection."""
from __future__ import annotations

import json
import math
from pathlib import Path

import cv2
import numpy as np

from .fold_utils import build_fold
from .library import library_models

COLOURS_BGR = {"M": (0, 0, 220), "V": (220, 80, 0), "B": (0, 0, 0), "F": (185, 185, 185)}
MARGIN = 0.03  # fraction of the image left blank around the square
LEVELS = ("clean", "mild", "hard")
DATA_DIR = Path(__file__).resolve().parents[1] / "data" / "synth"
T22 = math.tan(math.radians(22.5))


def to_px(p, size: int) -> tuple[int, int]:
    m = MARGIN * size
    s = size - 2 * m
    return int(round(m + p[0] * s)), int(round(m + (1 - p[1]) * s))


def _dashed_line(img, p, q, colour, thickness, dash=14, gap=9):
    L = math.dist(p, q)
    if L < 1:
        return
    ux, uy = (q[0] - p[0]) / L, (q[1] - p[1]) / L
    s = 0.0
    while s < L:
        e = min(L, s + dash)
        a = (int(round(p[0] + ux * s)), int(round(p[1] + uy * s)))
        b = (int(round(p[0] + ux * e)), int(round(p[1] + uy * e)))
        cv2.line(img, a, b, colour, thickness, cv2.LINE_AA)
        s += dash + gap


def render_fold(fold: dict, size: int = 800, line_px: int = 3) -> np.ndarray:
    """Draw a FOLD as a BGR image: white paper, M red, V blue dashed, B black, F grey."""
    img = np.full((size, size, 3), 255, np.uint8)
    coords = fold["vertices_coords"]
    order = sorted(range(len(fold["edges_vertices"])),
                   key=lambda e: {"F": 0, "M": 1, "V": 1, "B": 2}[fold["edges_assignment"][e]])
    for ei in order:
        a, b = fold["edges_vertices"][ei]
        asg = fold["edges_assignment"][ei]
        p, q = to_px(coords[a], size), to_px(coords[b], size)
        if asg == "V":
            _dashed_line(img, p, q, COLOURS_BGR[asg], line_px)
        else:
            cv2.line(img, p, q, COLOURS_BGR[asg], line_px, cv2.LINE_AA)
    return img


# ---------------------------------------------------------------- augmentation

def augment(img: np.ndarray, level: str, rng: np.random.Generator) -> np.ndarray:
    """clean: unchanged. mild: noise, blur, JPEG 60. hard: mild + rotation, warp, desk padding."""
    if level == "clean":
        return img
    out = img.copy()
    if level == "hard":
        h, w = out.shape[:2]
        pad = int(0.12 * w)
        desk = np.full((h + 2 * pad, w + 2 * pad, 3), (120, 128, 135), np.uint8)
        desk[pad:pad + h, pad:pad + w] = out
        out = desk
        H, W = out.shape[:2]
        ang = rng.uniform(-5, 5)
        M = cv2.getRotationMatrix2D((W / 2, H / 2), ang, 1.0)
        out = cv2.warpAffine(out, M, (W, H), borderValue=(120, 128, 135))
        j = 0.025 * W
        src = np.float32([[0, 0], [W, 0], [W, H], [0, H]])
        dst = src + rng.uniform(-j, j, size=(4, 2)).astype(np.float32)
        P = cv2.getPerspectiveTransform(src, dst)
        out = cv2.warpPerspective(out, P, (W, H), borderValue=(120, 128, 135))
    noise = rng.normal(0, 8, out.shape)
    out = np.clip(out.astype(np.float32) + noise, 0, 255).astype(np.uint8)
    out = cv2.GaussianBlur(out, (3, 3), 0.8)
    ok, buf = cv2.imencode(".jpg", out, [cv2.IMWRITE_JPEG_QUALITY, 60])
    return cv2.imdecode(buf, cv2.IMREAD_COLOR)


# ---------------------------------------------------------------- random CPs

def random_grid_segments(rng: np.random.Generator) -> list:
    n = int(rng.choice([8, 16]))
    candidates = []
    for j in range(1, n):
        candidates.append(((j / n, 0), (j / n, 1)))
        candidates.append(((0, j / n), (1, j / n)))
    candidates += [((0, 0), (1, 1)), ((1, 0), (0, 1))]
    for c in (0.25, 0.5):
        candidates += [((c, 0), (1, 1 - c)), ((0, c), (1 - c, 1))]
    candidates += [((0, 0), (1, T22)), ((0, 0), (T22, 1)), ((1, 1), (0, 1 - T22)), ((1, 1), (1 - T22, 0))]
    k = int(rng.integers(3, 9))
    picks = rng.choice(len(candidates), size=k, replace=False)
    return [(*candidates[i], str(rng.choice(["M", "V"]))) for i in picks]


def make_dataset(n: int = 40, seed: int = 0, out_dir: Path | None = None) -> list[dict]:
    """Render library models + random grid CPs with augmentations to out_dir."""
    rng = np.random.default_rng(seed)
    out_dir = Path(out_dir or DATA_DIR)
    out_dir.mkdir(parents=True, exist_ok=True)
    specs = [(m["id"], m["segments"]) for m in library_models()]
    i = 0
    while len(specs) < n:
        specs.append((f"random-{i:02d}", random_grid_segments(rng)))
        i += 1
    items = []
    for k, (name, segs) in enumerate(specs[:n]):
        level = LEVELS[k % len(LEVELS)]
        fold = build_fold(segs)
        img = augment(render_fold(fold), level, rng)
        stem = f"{k:03d}-{name}-{level}"
        cv2.imwrite(str(out_dir / f"{stem}.png"), img)
        (out_dir / f"{stem}.fold").write_text(json.dumps(fold))
        items.append({"name": stem, "level": level, "png": out_dir / f"{stem}.png",
                      "fold": fold})
    return items
