"""Crease-pattern detection from an image (classical CV, no ML).

Pipeline: resize → find the CP square → warp → HSV colour masks → multi-scale
HoughLinesP → merge collinear pieces → snap angles → detect grid and snap
endpoints → extend near-misses → build_fold → validate.
"""
from __future__ import annotations

import base64
import math
from dataclasses import dataclass

import cv2
import numpy as np

from .fold_utils import build_fold
from .validate import validate

WORK = 1024
LONGEST = 1200
ANGLE_TOL = math.radians(2)
RHO_TOL = 6.0
GAP_PX = 28.0
MIN_LEN_PX = 30.0
SNAP_ANGLE_DEG = 3.0
GRID_TOL = 0.012
EXTEND = 0.03
DANGLE_EXTEND = 0.10
SPUR_LEN = 0.06
TOUCH = 0.004
T22 = math.tan(math.radians(22.5))
K22 = 1 / (1 + T22)
SPECIAL = sorted({T22, 1 - T22, K22, 1 - K22, T22 / 2, 1 - T22 / 2})

HOUGH_PASSES = [  # (threshold, minLineLength, maxLineGap)
    (80, 120, 10),
    (50, 60, 14),
    (30, 30, 18),
]


@dataclass
class Seg:
    p: np.ndarray  # unit coords, y up
    q: np.ndarray
    asg: str


# ---------------------------------------------------------------- 1-2. locate + warp

def _resize(img: np.ndarray) -> np.ndarray:
    h, w = img.shape[:2]
    s = LONGEST / max(h, w)
    interp = cv2.INTER_AREA if s < 1 else cv2.INTER_CUBIC
    return cv2.resize(img, (int(round(w * s)), int(round(h * s))), interpolation=interp)


def _ink_mask(img: np.ndarray) -> np.ndarray:
    hsv = cv2.cvtColor(img, cv2.COLOR_BGR2HSV)
    s, v = hsv[..., 1], hsv[..., 2]
    ink = ((v < 110) | ((s > 90) & (v > 60))).astype(np.uint8) * 255
    return cv2.morphologyEx(ink, cv2.MORPH_CLOSE, np.ones((5, 5), np.uint8))


def _order_quad(pts: np.ndarray) -> np.ndarray:
    pts = pts.reshape(4, 2).astype(np.float32)
    s = pts.sum(1)
    d = np.diff(pts, axis=1).ravel()
    return np.float32([pts[np.argmin(s)], pts[np.argmin(d)], pts[np.argmax(s)], pts[np.argmax(d)]])


def find_square(img: np.ndarray) -> tuple[np.ndarray, bool]:
    """Warp the crease-pattern square to WORK×WORK. Returns (warped, quad_found)."""
    ink = _ink_mask(img)
    contours, _ = cv2.findContours(ink, cv2.RETR_EXTERNAL, cv2.CHAIN_APPROX_SIMPLE)
    area_img = img.shape[0] * img.shape[1]
    dst = np.float32([[0, 0], [WORK - 1, 0], [WORK - 1, WORK - 1], [0, WORK - 1]])
    for c in sorted(contours, key=cv2.contourArea, reverse=True)[:3]:
        if cv2.contourArea(c) < 0.15 * area_img:
            break
        hull = cv2.convexHull(c)
        approx = cv2.approxPolyDP(hull, 0.02 * cv2.arcLength(hull, True), True)
        if len(approx) == 4:
            M = cv2.getPerspectiveTransform(_order_quad(approx), dst)
            return cv2.warpPerspective(img, M, (WORK, WORK), flags=cv2.INTER_LINEAR,
                                       borderValue=(255, 255, 255)), True
    ys, xs = np.nonzero(ink)
    if len(xs):
        x0, x1, y0, y1 = xs.min(), xs.max(), ys.min(), ys.max()
    else:
        x0, y0, x1, y1 = 0, 0, img.shape[1] - 1, img.shape[0] - 1
    src = np.float32([[x0, y0], [x1, y0], [x1, y1], [x0, y1]])
    M = cv2.getPerspectiveTransform(src, dst)
    return cv2.warpPerspective(img, M, (WORK, WORK), borderValue=(255, 255, 255)), False


# ---------------------------------------------------------------- 3. colour masks

def colour_masks(warped: np.ndarray) -> dict[str, np.ndarray]:
    hsv = cv2.cvtColor(warped, cv2.COLOR_BGR2HSV)
    h, s, v = hsv[..., 0], hsv[..., 1], hsv[..., 2]
    red = (((h <= 10) | (h >= 165)) & (s >= 80) & (v >= 70))
    blue = ((h >= 95) & (h <= 130) & (s >= 80) & (v >= 50))
    dark = (v <= 100) & ~red & ~blue
    grey = (s <= 35) & (v >= 140) & (v <= 215)
    near_ink = cv2.dilate((dark | red | blue).astype(np.uint8), np.ones((7, 7), np.uint8)) > 0
    grey &= ~near_ink

    def u8(m):
        return m.astype(np.uint8) * 255

    k3 = np.ones((3, 3), np.uint8)
    return {
        "M": cv2.morphologyEx(u8(red), cv2.MORPH_CLOSE, k3),
        "V": cv2.morphologyEx(u8(blue), cv2.MORPH_CLOSE,
                              cv2.getStructuringElement(cv2.MORPH_ELLIPSE, (15, 15))),
        "B": cv2.morphologyEx(u8(dark), cv2.MORPH_CLOSE, k3),
        "F": cv2.morphologyEx(cv2.morphologyEx(u8(grey), cv2.MORPH_OPEN, np.ones((2, 2), np.uint8)),
                              cv2.MORPH_CLOSE, k3),
    }


# ---------------------------------------------------------------- 4-5. Hough + merge

def hough_segments(mask: np.ndarray) -> list[tuple[float, float, float, float]]:
    out = []
    for thr, min_len, gap in HOUGH_PASSES:
        lines = cv2.HoughLinesP(mask, 1, np.pi / 360, thr, minLineLength=min_len, maxLineGap=gap)
        if lines is not None:
            out.extend(tuple(map(float, l[0])) for l in lines)
    return out


def snap_raw(seg: tuple[float, float, float, float]) -> tuple[float, float, float, float]:
    """Rotate a pixel segment about its midpoint onto the nearest 22.5° multiple (within 3°)."""
    x1, y1, x2, y2 = seg
    ang = math.degrees(math.atan2(y2 - y1, x2 - x1))
    target = round(ang / 22.5) * 22.5
    if abs(ang - target) > SNAP_ANGLE_DEG:
        return seg
    mx, my = (x1 + x2) / 2, (y1 + y2) / 2
    h = math.hypot(x2 - x1, y2 - y1) / 2
    r = math.radians(target)
    dx, dy = math.cos(r) * h, math.sin(r) * h
    return (mx - dx, my - dy, mx + dx, my + dy)


def _line_params(x1, y1, x2, y2) -> tuple[float, float]:
    a = math.atan2(y2 - y1, x2 - x1) % math.pi
    return a, -math.sin(a) * x1 + math.cos(a) * y1


def merge_segments(segs: list[tuple[float, float, float, float]]) -> list[tuple[float, float, float, float]]:
    """Cluster by (angle, offset) and merge overlapping/near pieces into maximal segments."""
    segs = sorted(segs, key=lambda s: -math.hypot(s[2] - s[0], s[3] - s[1]))
    clusters: list[dict] = []
    for s in segs:
        a, r = _line_params(*s)
        L = math.hypot(s[2] - s[0], s[3] - s[1])
        for c in clusters:
            da = a - c["a"]
            rr = r
            if da > math.pi / 2:
                da -= math.pi
                rr = -r
            elif da < -math.pi / 2:
                da += math.pi
                rr = -r
            if abs(da) < ANGLE_TOL and abs(rr - c["r"]) < RHO_TOL:
                c["members"].append(s)
                break
        else:
            clusters.append({"a": a, "r": r, "L": L, "members": [s]})

    out = []
    for c in clusters:
        a, r = c["a"], c["r"]
        d = np.array([math.cos(a), math.sin(a)])
        n = np.array([-math.sin(a), math.cos(a)])
        spans = []
        for x1, y1, x2, y2 in c["members"]:
            t1 = x1 * d[0] + y1 * d[1]
            t2 = x2 * d[0] + y2 * d[1]
            spans.append((min(t1, t2), max(t1, t2)))
        spans.sort()
        merged = [list(spans[0])]
        for lo, hi in spans[1:]:
            if lo <= merged[-1][1] + GAP_PX:
                merged[-1][1] = max(merged[-1][1], hi)
            else:
                merged.append([lo, hi])
        for lo, hi in merged:
            if hi - lo < MIN_LEN_PX:
                continue
            p = d * lo + n * r
            q = d * hi + n * r
            out.append((p[0], p[1], q[0], q[1]))
    return out


# ---------------------------------------------------------------- 6-8. snapping

def _to_unit(x: float, y: float) -> np.ndarray:
    return np.array([x / (WORK - 1), 1 - y / (WORK - 1)])


def snap_angle(seg: Seg) -> Seg:
    mid = (seg.p + seg.q) / 2
    v = seg.q - seg.p
    L = float(np.hypot(*v))
    ang = math.degrees(math.atan2(v[1], v[0]))
    target = round(ang / 22.5) * 22.5
    if abs(ang - target) <= SNAP_ANGLE_DEG:
        r = math.radians(target)
        u = np.array([math.cos(r), math.sin(r)]) * L / 2
        return Seg(mid - u, mid + u, seg.asg)
    return seg


def _ray_hits(p: np.ndarray, d: np.ndarray, segs: list[Seg], self_i: int) -> list[float]:
    """Parameters t along p + t·d where the ray meets the border or another segment."""
    ts = []
    for axis in (0, 1):
        if abs(d[axis]) > 1e-9:
            for edge in (0.0, 1.0):
                ts.append((edge - p[axis]) / d[axis])
    for j, o in enumerate(segs):
        if j == self_i:
            continue
        e = o.q - o.p
        den = d[0] * e[1] - d[1] * e[0]
        if abs(den) < 1e-9:
            continue
        w = o.p - p
        t = (w[0] * e[1] - w[1] * e[0]) / den
        u = (w[0] * d[1] - w[1] * d[0]) / den
        Le = float(np.hypot(*e))
        if -EXTEND / Le <= u <= 1 + EXTEND / Le:
            ts.append(t)
    return ts


def extend_segments(segs: list[Seg], reach: float = EXTEND) -> list[Seg]:
    """Move endpoints that stop just short of (or overshoot) a crossing line or the border."""
    out = []
    for i, s in enumerate(segs):
        v = s.q - s.p
        L = float(np.hypot(*v))
        if L < 1e-9:
            continue
        d = v / L
        p, q = s.p.copy(), s.q.copy()
        for end, direction in ((0, -d), (1, d)):
            origin = p if end == 0 else q
            ts = [t for t in _ray_hits(origin, direction, segs, i) if -reach <= t <= reach]
            if ts:
                t = min(ts, key=abs)
                moved = origin + direction * t
                if end == 0:
                    p = moved
                else:
                    q = moved
        out.append(Seg(p, q, s.asg))
    return out


def _dist_point_seg(p: np.ndarray, s: Seg) -> float:
    v = s.q - s.p
    L2 = float(v @ v)
    t = 0.0 if L2 < 1e-12 else max(0.0, min(1.0, float((p - s.p) @ v) / L2))
    return float(np.hypot(*(p - (s.p + t * v))))


def _dangling(p: np.ndarray, segs: list[Seg], self_i: int) -> bool:
    if min(p[0], p[1], 1 - p[0], 1 - p[1]) < TOUCH:
        return False
    return all(_dist_point_seg(p, o) > TOUCH for j, o in enumerate(segs) if j != self_i)


def fix_dangling(segs: list[Seg]) -> list[Seg]:
    """Interior crease endpoints must meet another crease: extend to the next hit, or drop short spurs."""
    for _ in range(2):
        out: list[Seg] = []
        for i, s in enumerate(segs):
            v = s.q - s.p
            L = float(np.hypot(*v))
            d = v / L
            p, q = s.p.copy(), s.q.copy()
            dangling = False
            for end, direction in ((0, -d), (1, d)):
                origin = p if end == 0 else q
                if not _dangling(origin, segs, i):
                    continue
                ts = [t for t in _ray_hits(origin, direction, segs, i) if 1e-6 < t <= DANGLE_EXTEND]
                if ts:
                    moved = origin + direction * min(ts)
                    if end == 0:
                        p = moved
                    else:
                        q = moved
                else:
                    dangling = True
            if dangling and L < SPUR_LEN:
                continue
            out.append(Seg(p, q, s.asg))
        segs = out
    return segs


def _nearest(val: float, cands: np.ndarray) -> tuple[float, float]:
    i = int(np.argmin(np.abs(cands - val)))
    return float(cands[i]), abs(float(cands[i]) - val)


def detect_grid(points: list[np.ndarray]) -> int:
    """Smallest N in {4,8,16,32} explaining ≥85% of endpoints, else 0."""
    if not points:
        return 0
    for n in (4, 8, 16, 32):
        cands = np.array(sorted(set([j / n for j in range(n + 1)] + SPECIAL)))
        ok = sum(1 for p in points if all(_nearest(c, cands)[1] <= GRID_TOL for c in p))
        if ok / len(points) >= 0.85:
            return n
    return 0


def snap_to_grid(segs: list[Seg], n: int) -> tuple[list[Seg], list[float]]:
    vals = [0.0, 1.0] + ([j / n for j in range(n + 1)] + SPECIAL if n else [])
    cands = np.array(sorted(set(vals)))
    scores = []
    out = []
    for s in segs:
        pts = []
        for p in (s.p, s.q):
            new = p.copy()
            res = 0.0
            for k in (0, 1):
                v, r = _nearest(float(p[k]), cands)
                if r <= GRID_TOL:
                    new[k] = v
                    res = max(res, r)
                else:
                    res = max(res, GRID_TOL)
            scores.append(max(0.0, 1 - res / GRID_TOL))
            pts.append(new)
        out.append(Seg(pts[0], pts[1], s.asg))
    return out, scores


def merge_unit(segs: list[Seg]) -> list[Seg]:
    """Merge near-duplicate collinear segments of the same assignment."""
    out = []
    for asg in sorted({s.asg for s in segs}):
        px = [(s.p[0] * (WORK - 1), (1 - s.p[1]) * (WORK - 1),
               s.q[0] * (WORK - 1), (1 - s.q[1]) * (WORK - 1)) for s in segs if s.asg == asg]
        for x1, y1, x2, y2 in merge_segments(px):
            out.append(Seg(_to_unit(x1, y1), _to_unit(x2, y2), asg))
    return out


def _on_border(s: Seg, tol: float = 0.02) -> bool:
    for k in (0, 1):
        for edge in (0.0, 1.0):
            if abs(s.p[k] - edge) < tol and abs(s.q[k] - edge) < tol:
                return True
    return False


# ---------------------------------------------------------------- overlay

_OVERLAY = {"M": (40, 40, 229), "V": (229, 136, 30), "F": (60, 160, 60)}


def make_overlay(warped: np.ndarray, segs: list[Seg]) -> str:
    base = cv2.addWeighted(warped, 0.45, np.full_like(warped, 255), 0.55, 0)
    for s in segs:
        p = (int(s.p[0] * (WORK - 1)), int((1 - s.p[1]) * (WORK - 1)))
        q = (int(s.q[0] * (WORK - 1)), int((1 - s.q[1]) * (WORK - 1)))
        cv2.line(base, p, q, _OVERLAY.get(s.asg, (0, 0, 0)), 5, cv2.LINE_AA)
        for pt in (p, q):
            cv2.circle(base, pt, 7, (30, 30, 30), -1, cv2.LINE_AA)
    small = cv2.resize(base, (512, 512), interpolation=cv2.INTER_AREA)
    ok, buf = cv2.imencode(".png", small)
    return base64.b64encode(buf.tobytes()).decode("ascii")


# ---------------------------------------------------------------- main entry

def detect(img: np.ndarray) -> dict:
    """Detect a crease pattern in a BGR image. Returns {fold, overlay_png_b64, confidence, grid}."""
    img = _resize(img)
    warped, _ = find_square(img)
    masks = colour_masks(warped)

    segs: list[Seg] = []
    for asg in ("M", "V", "F", "B"):
        raw = [snap_raw(r) for r in hough_segments(masks[asg])]
        for x1, y1, x2, y2 in merge_segments(merge_segments(raw)):
            s = snap_angle(Seg(_to_unit(x1, y1), _to_unit(x2, y2), "F" if asg == "B" else asg))
            if not _on_border(s):
                segs.append(s)

    segs = extend_segments(segs)
    grid = detect_grid([p for s in segs for p in (s.p, s.q)])
    segs, scores = snap_to_grid(segs, grid)
    segs = fix_dangling([s for s in segs if float(np.hypot(*(s.q - s.p))) > 1e-6])
    segs, _ = snap_to_grid(merge_unit(segs), grid)
    segs = [s for s in segs if float(np.hypot(*(s.q - s.p))) > 0.025 and not _on_border(s)]

    fold = build_fold([(tuple(s.p), tuple(s.q), s.asg) for s in segs])
    v = validate(fold)
    frac_ok = (sum(r["ok"] for r in v["vertices"]) / len(v["vertices"])) if v["vertices"] else 1.0
    snap_score = float(np.mean(scores)) if scores else 0.0
    return {
        "fold": fold,
        "overlay_png_b64": make_overlay(warped, segs),
        "confidence": round(snap_score * frac_ok, 3),
        "grid": grid,
    }


def detect_bytes(data: bytes) -> dict:
    arr = np.frombuffer(data, np.uint8)
    img = cv2.imdecode(arr, cv2.IMREAD_COLOR)
    if img is None:
        raise ValueError("could not decode image")
    return detect(img)
