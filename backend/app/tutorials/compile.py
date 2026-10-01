"""Compile tutorial YAML into engine keyframes.

CLI:  python -m app.tutorials.compile [id | --all] [--render]
"""
from __future__ import annotations

import argparse
import hashlib
import json
import sys
from pathlib import Path
from typing import Literal

import yaml
from pydantic import BaseModel, ConfigDict, Field, ValidationError, field_validator

from ..engine import EngineError, Paper, initial_state, run_step
from ..engine.state import State

CONTENT = Path(__file__).resolve().parents[2] / "content"
TUTORIALS = CONTENT / "tutorials"
RENDERS = Path(__file__).resolve().parents[2] / ".renders"

CATEGORIES = ("foundations", "bases", "animals", "birds", "flowers", "boxes", "planes", "action",
              "masks", "modular", "tessellations", "geometric")
SYMBOLS = ("valley", "mountain", "fold-unfold", "turn-over", "rotate", "squash", "reverse", "petal",
           "sink", "inflate", "repeat")
OPS = ("fold", "crease", "turn_over", "rotate", "unfold", "collapse", "shape")
FRONT = "#e2553f"
BACK = "#f3e6cc"


class CompileError(ValueError):
    pass


class PaperSpec(BaseModel):
    width: float = 1.0
    height: float = 1.0
    start: Literal["colour_up", "white_up"] = "colour_up"


class StepSpec(BaseModel):
    model_config = ConfigDict(extra="allow")
    op: Literal[OPS]  # type: ignore[valid-type]
    title: str
    instruction: str
    tips: list[str] = Field(min_length=1)
    mistakes: list[str] = Field(min_length=1)
    symbol: Literal[SYMBOLS]  # type: ignore[valid-type]
    check: str | None = None

    @field_validator("instruction")
    @classmethod
    def short(cls, v: str) -> str:
        if len(v.split()) > 12:
            raise ValueError(f"instruction has {len(v.split())} words (max 12): {v!r}")
        return v


class TutorialSpec(BaseModel):
    id: str
    title: str
    category: Literal[CATEGORIES]  # type: ignore[valid-type]
    level: int = Field(ge=1, le=5)
    minutes: int = Field(ge=1, le=120)
    paper: PaperSpec = PaperSpec()
    tags: list[str] = []
    description: str = ""
    steps: list[StepSpec] = Field(min_length=1)


# ---------------------------------------------------------------- SVG helpers

def state_svg(state: State, size: int = 240, pad: float = 0.06) -> str:
    """Silhouette of the folded state (pieces drawn bottom to top)."""
    x0, y0, x1, y1 = state.bbox()
    span = max(x1 - x0, y1 - y0, 1e-6)
    k = size * (1 - 2 * pad) / span
    ox = size / 2 - (x0 + x1) / 2 * k
    oy = size / 2 + (y0 + y1) / 2 * k
    parts = [f'<svg xmlns="http://www.w3.org/2000/svg" viewBox="0 0 {size} {size}">']
    for piece in sorted(state.pieces, key=lambda q: q.layer):
        pts = " ".join(f"{ox + x * k:.1f},{oy - y * k:.1f}" for x, y in piece.folded_poly)
        fill = FRONT if piece.face_up(state.paper) else BACK
        parts.append(f'<polygon points="{pts}" fill="{fill}" stroke="#0e1014" stroke-width="1" '
                     f'stroke-linejoin="round"/>')
    parts.append("</svg>")
    return "".join(parts)


# ---------------------------------------------------------------- compile

def load_spec(path: Path) -> TutorialSpec:
    try:
        data = yaml.safe_load(path.read_text(encoding="utf-8"))
        return TutorialSpec.model_validate(data)
    except ValidationError as e:
        raise CompileError(f"{path.stem}: {e}") from e


_STEP_KEYS = set(StepSpec.model_fields)


def compile_spec(spec: TutorialSpec, render_dir: Path | None = None) -> dict:
    paper = Paper(spec.paper.width, spec.paper.height, spec.paper.start)
    state = initial_state(paper)
    steps = []
    if render_dir:
        from ..engine.render import render_state_png
        render_state_png(state, render_dir / "00-start.png", "start")
    for i, st in enumerate(spec.steps):
        raw = st.model_dump()
        try:
            state, kf = run_step(state, raw)
        except (EngineError, KeyError, TypeError, ValueError) as e:
            raise CompileError(f"{spec.id} step {i + 1} ({st.title}): {e}") from e
        step = {
            "index": i,
            "title": st.title,
            "op": st.op,
            "instruction": st.instruction,
            "tips": st.tips,
            "mistakes": st.mistakes,
            "symbol": st.symbol,
            "check": st.check,
            **{k: v for k, v in kf.items() if k != "op"},
        }
        steps.append(step)
        if render_dir:
            from ..engine.render import render_state_png
            render_state_png(state, render_dir / f"{i + 1:02d}-{st.op}.png", f"{i + 1}. {st.title}")
    return {
        "id": spec.id,
        "title": spec.title,
        "category": spec.category,
        "level": spec.level,
        "minutes": spec.minutes,
        "paper": spec.paper.model_dump(),
        "tags": spec.tags,
        "description": spec.description,
        "steps": steps,
        "final_svg": state_svg(state),
        "thumbnail_svg": state_svg(state, size=96, pad=0.08),
    }


def tutorial_paths() -> list[Path]:
    return sorted(TUTORIALS.glob("*.yaml"))


def content_hash(path: Path) -> str:
    from .. import engine
    src = path.read_bytes() + Path(engine.__file__).with_name("ops.py").read_bytes()
    return hashlib.sha1(src).hexdigest()[:16]


def compile_file(path: Path, render: bool = False) -> dict:
    spec = load_spec(path)
    if spec.id != path.stem:
        raise CompileError(f"{path.name}: id {spec.id!r} must match the file name")
    return compile_spec(spec, RENDERS / spec.id if render else None)


def main(argv=None) -> int:
    ap = argparse.ArgumentParser()
    ap.add_argument("id", nargs="?")
    ap.add_argument("--all", action="store_true")
    ap.add_argument("--render", action="store_true")
    ap.add_argument("--json", action="store_true", help="print the compiled JSON")
    args = ap.parse_args(argv)
    paths = tutorial_paths() if args.all or not args.id else [TUTORIALS / f"{args.id}.yaml"]
    failed = 0
    for p in paths:
        try:
            out = compile_file(p, args.render)
            if args.json:
                print(json.dumps(out)[:2000])
            print(f"ok   {p.stem}: {len(out['steps'])} steps")
        except CompileError as e:
            failed += 1
            print(f"FAIL {e}")
    return 1 if failed else 0


if __name__ == "__main__":
    sys.exit(main())
