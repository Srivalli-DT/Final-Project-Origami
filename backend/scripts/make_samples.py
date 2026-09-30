"""Render the sample CP images bundled with the frontend: python -m scripts.make_samples"""
from pathlib import Path

import cv2
import numpy as np

from app.fold_utils import build_fold
from app.library import library_models
from app.synth import augment, render_fold

OUT = Path(__file__).resolve().parents[2] / "frontend" / "public" / "samples"


def main() -> None:
    OUT.mkdir(parents=True, exist_ok=True)
    specs = {m["id"]: m for m in library_models()}
    rng = np.random.default_rng(7)

    cv2.imwrite(str(OUT / "waterbomb.png"), render_fold(build_fold(specs["waterbomb-base"]["segments"])))
    cv2.imwrite(str(OUT / "square-twist.png"),
                augment(render_fold(build_fold(specs["square-twist"]["segments"])), "mild", rng))
    # preliminary base with one deliberately flipped crease (fails Maekawa at the centre)
    segs = list(specs["preliminary-base"]["segments"])
    p1, p2, _ = segs[-1]
    segs[-1] = (p1, p2, "M")
    cv2.imwrite(str(OUT / "preliminary-error.png"), render_fold(build_fold(segs)))
    print(f"wrote samples to {OUT}")


if __name__ == "__main__":
    main()
