"""Saved user patterns (SQLite locally, Postgres when DATABASE_URL points at one)."""
from __future__ import annotations

import json
import os
from datetime import datetime, timezone

from sqlmodel import Field, Session, SQLModel, create_engine, select

_engine = None


class Pattern(SQLModel, table=True):
    id: int | None = Field(default=None, primary_key=True)
    title: str
    fold_json: str
    created_at: datetime = Field(default_factory=lambda: datetime.now(timezone.utc))


def _url() -> str:
    url = os.getenv("DATABASE_URL") or os.getenv("POSTGRES_URL")
    if not url:
        # Vercel's filesystem is read-only except /tmp (and /tmp does not persist)
        url = "sqlite:////tmp/creaselens.db" if os.getenv("VERCEL") else "sqlite:///./creaselens.db"
    if url.startswith("postgres://"):  # Neon/Heroku style
        url = "postgresql://" + url[len("postgres://"):]
    return url


def get_engine():
    global _engine
    if _engine is None:
        url = _url()
        args = {"check_same_thread": False} if url.startswith("sqlite") else {}
        _engine = create_engine(url, connect_args=args, pool_pre_ping=True)
        SQLModel.metadata.create_all(_engine)
    return _engine


def reset_engine() -> None:
    """Forget the cached engine (tests switch DATABASE_URL)."""
    global _engine
    if _engine is not None:
        _engine.dispose()
    _engine = None


def create_pattern(title: str, fold: dict) -> int:
    with Session(get_engine()) as s:
        p = Pattern(title=title, fold_json=json.dumps(fold))
        s.add(p)
        s.commit()
        s.refresh(p)
        return p.id


def list_patterns() -> list[dict]:
    with Session(get_engine()) as s:
        rows = s.exec(select(Pattern).order_by(Pattern.created_at.desc(), Pattern.id.desc())).all()
        return [{"id": r.id, "title": r.title, "created_at": r.created_at.isoformat()} for r in rows]


def get_pattern(pattern_id: int) -> dict | None:
    with Session(get_engine()) as s:
        r = s.get(Pattern, pattern_id)
        if r is None:
            return None
        return {"id": r.id, "title": r.title, "fold": json.loads(r.fold_json)}
