"""Seed the database from backend/content/ (idempotent upsert by id)."""
from __future__ import annotations

import json
import logging

import yaml
from sqlmodel import Session, select

from .tutorials.compile import CONTENT, CompileError, compile_file, content_hash, tutorial_paths

log = logging.getLogger(__name__)


def _load(name: str):
    path = CONTENT / name
    return yaml.safe_load(path.read_text(encoding="utf-8")) if path.exists() else []


def levels() -> list[dict]:
    return _load("levels.yaml")


def seed(engine) -> None:
    from .db import Category, Rule, Tutorial
    from .rules import build_rule

    with Session(engine) as s:
        for i, c in enumerate(_load("categories.yaml")):
            row = s.get(Category, c["id"]) or Category(id=c["id"], title=c["title"])
            row.title, row.description, row.icon, row.position = c["title"], c.get("description", ""), \
                c.get("icon", ""), i
            s.add(row)

        seen = set()
        for path in tutorial_paths():
            seen.add(path.stem)
            h = content_hash(path)
            row = s.get(Tutorial, path.stem)
            if row is not None and row.content_hash == h:
                continue
            try:
                out = compile_file(path)
            except CompileError as e:  # keep serving the rest
                log.error("tutorial %s failed to compile: %s", path.stem, e)
                continue
            meta = {"paper": out["paper"], "tags": out["tags"], "description": out["description"],
                    "thumbnail_svg": out["thumbnail_svg"], "step_count": len(out["steps"])}
            row = row or Tutorial(id=out["id"], title="", category="", level=1, minutes=1, meta_json="",
                                  compiled_json="", content_hash="")
            row.title, row.category, row.level, row.minutes = out["title"], out["category"], out["level"], \
                out["minutes"]
            row.meta_json, row.compiled_json, row.content_hash = json.dumps(meta), json.dumps(out), h
            s.add(row)
        for row in s.exec(select(Tutorial)).all():
            if row.id not in seen:
                s.delete(row)

        rule_ids = set()
        for i, r in enumerate(_load("rules.yaml")):
            rule_ids.add(r["id"])
            row = s.get(Rule, r["id"]) or Rule(id=r["id"], data_json="")
            row.position, row.data_json = i, json.dumps(build_rule(r))
            s.add(row)
        for row in s.exec(select(Rule)).all():
            if row.id not in rule_ids:
                s.delete(row)
        s.commit()
