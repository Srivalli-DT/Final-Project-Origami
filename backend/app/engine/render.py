"""Dev-only renders of engine states (PNG via OpenCV) and crease patterns (SVG)."""
from __future__ import annotations

from pathlib import Path

from .state import Paper, State

FRONT = (63, 85, 226)   # BGR of #e2553f (coloured side)
BACK = (204, 230, 243)  # BGR of #f3e6cc
EDGE = (40, 40, 40)


def render_state_png(state: State, path, title: str = "", size: int = 480) -> None:
    import cv2
    import numpy as np

    img = np.full((size, size, 3), (20, 16, 14), np.uint8)
    x0, y0, x1, y1 = state.bbox()
    span = max(x1 - x0, y1 - y0, 1e-6)
    pad = 0.08 * size
    s = (size - 2 * pad) / span
    cx, cy = (x0 + x1) / 2, (y0 + y1) / 2

    def px(p):
        return int(size / 2 + (p[0] - cx) * s), int(size / 2 - (p[1] - cy) * s)

    for piece in sorted(state.pieces, key=lambda q: q.layer):
        pts = np.array([px(p) for p in piece.folded_poly], np.int32)
        cv2.fillPoly(img, [pts], FRONT if piece.face_up(state.paper) else BACK, cv2.LINE_AA)
        cv2.polylines(img, [pts], True, EDGE, 1, cv2.LINE_AA)
    if title:
        cv2.putText(img, title[:60], (8, 20), cv2.FONT_HERSHEY_SIMPLEX, 0.5, (230, 230, 230), 1, cv2.LINE_AA)
    Path(path).parent.mkdir(parents=True, exist_ok=True)
    cv2.imwrite(str(path), img)


def render_cp_svg(creases: list[dict], paper: Paper, size: int = 200) -> str:
    """Crease pattern in paper coordinates (y up). Valley dashed, mountain dash-dot."""
    w, h = paper.width, paper.height
    k = size / max(w, h)
    parts = [f'<svg xmlns="http://www.w3.org/2000/svg" viewBox="0 0 {w * k:.1f} {h * k:.1f}" '
             f'width="{w * k:.0f}" height="{h * k:.0f}">',
             f'<rect width="{w * k:.1f}" height="{h * k:.1f}" fill="#f3e6cc" stroke="#2a2f3a"/>']
    for c in creases:
        (ax, ay), (bx, by) = c["a"], c["b"]
        dash = "6 4" if c["assignment"] == "V" else "8 3 2 3"
        col = "#4da3ff" if c["assignment"] == "V" else "#ff5d5d"
        parts.append(f'<line x1="{ax * k:.1f}" y1="{(h - ay) * k:.1f}" x2="{bx * k:.1f}" y2="{(h - by) * k:.1f}" '
                     f'stroke="{col}" stroke-width="2" stroke-dasharray="{dash}"/>')
    parts.append("</svg>")
    return "".join(parts)
