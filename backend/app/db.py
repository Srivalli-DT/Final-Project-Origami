"""Database: SQLite locally, Postgres (Neon) when DATABASE_URL is set.

Content (categories, tutorials, rules) is seeded from backend/content/ at startup with an
idempotent upsert. Compiled tutorial JSON is cached in the database by content hash.
"""
from __future__ import annotations

import json
import os
import uuid
from datetime import datetime, timezone

from sqlmodel import Field, Session, SQLModel, create_engine, select

_engine = None


def _now() -> datetime:
    return datetime.now(timezone.utc)


class Category(SQLModel, table=True):
    id: str = Field(primary_key=True)
    title: str
    description: str = ""
    icon: str = ""
    position: int = 0


class Tutorial(SQLModel, table=True):
    id: str = Field(primary_key=True)
    title: str
    category: str = Field(index=True)
    level: int = Field(index=True)
    minutes: int
    meta_json: str  # paper, tags, description, thumbnail_svg
    compiled_json: str
    content_hash: str


class Rule(SQLModel, table=True):
    id: str = Field(primary_key=True)
    position: int = 0
    data_json: str


class User(SQLModel, table=True):
    id: str = Field(primary_key=True)
    name: str
    created_at: datetime = Field(default_factory=_now)


class Progress(SQLModel, table=True):
    id: int | None = Field(default=None, primary_key=True)
    user_id: str = Field(index=True)
    tutorial_id: str = Field(index=True)
    step_index: int = -1  # highest step marked done
    completed: bool = False
    updated_at: datetime = Field(default_factory=_now)


class Pattern(SQLModel, table=True):
    id: int | None = Field(default=None, primary_key=True)
    user_id: str | None = Field(default=None, index=True)
    title: str
    fold_json: str
    created_at: datetime = Field(default_factory=_now)


# ---------------------------------------------------------------- engine

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
        from .seed import seed
        seed(_engine)
    return _engine


def reset_engine() -> None:
    """Forget the cached engine (tests switch DATABASE_URL)."""
    global _engine
    if _engine is not None:
        _engine.dispose()
    _engine = None


def session() -> Session:
    return Session(get_engine())


# ---------------------------------------------------------------- content queries

def categories() -> list[dict]:
    with session() as s:
        cats = s.exec(select(Category).order_by(Category.position)).all()
        tuts = s.exec(select(Tutorial.category)).all()
        counts: dict[str, int] = {}
        for c in tuts:
            counts[c] = counts.get(c, 0) + 1
        return [{"id": c.id, "title": c.title, "description": c.description, "icon": c.icon,
                 "count": counts.get(c.id, 0)} for c in cats]


def _summary(t: Tutorial) -> dict:
    meta = json.loads(t.meta_json)
    return {"id": t.id, "title": t.title, "category": t.category, "level": t.level, "minutes": t.minutes,
            "paper": meta["paper"], "thumbnail_svg": meta["thumbnail_svg"], "tags": meta["tags"],
            "steps": meta.get("step_count", 0)}


def tutorials(category: str | None = None, level: int | None = None, q: str | None = None) -> list[dict]:
    with session() as s:
        stmt = select(Tutorial)
        if category:
            stmt = stmt.where(Tutorial.category == category)
        if level:
            stmt = stmt.where(Tutorial.level == level)
        rows = s.exec(stmt.order_by(Tutorial.level, Tutorial.title)).all()
        out = [_summary(t) for t in rows]
    if q:
        ql = q.lower()
        out = [t for t in out if ql in t["title"].lower() or any(ql in g for g in t["tags"])
               or ql in t["category"]]
    return out


def tutorial(tid: str) -> dict | None:
    with session() as s:
        t = s.get(Tutorial, tid)
        return None if t is None else json.loads(t.compiled_json)


def rules() -> list[dict]:
    with session() as s:
        return [json.loads(r.data_json) for r in s.exec(select(Rule).order_by(Rule.position)).all()]


# ---------------------------------------------------------------- users, progress

def create_user(name: str) -> str:
    uid = uuid.uuid4().hex[:12]
    with session() as s:
        s.add(User(id=uid, name=name))
        s.commit()
    return uid


def get_user(uid: str) -> dict | None:
    with session() as s:
        u = s.get(User, uid)
        return None if u is None else {"user_id": u.id, "name": u.name}


def save_progress(uid: str, tid: str, step_index: int, completed: bool) -> dict:
    with session() as s:
        row = s.exec(select(Progress).where(Progress.user_id == uid, Progress.tutorial_id == tid)).first()
        if row is None:
            row = Progress(user_id=uid, tutorial_id=tid)
        row.step_index = max(row.step_index, step_index)
        row.completed = row.completed or completed
        row.updated_at = _now()
        s.add(row)
        s.commit()
    return progress(uid)


XP_STEP = 10
XP_TUTORIAL = 50


def progress(uid: str) -> dict:
    with session() as s:
        rows = s.exec(select(Progress).where(Progress.user_id == uid)).all()
        items = [{"tutorial_id": r.tutorial_id, "step_index": r.step_index, "completed": r.completed,
                  "updated_at": r.updated_at.isoformat()} for r in rows]
    xp = sum(XP_STEP * (i["step_index"] + 1) + (XP_TUTORIAL if i["completed"] else 0) for i in items)
    return {"user_id": uid, "items": items, "xp": xp,
            "completed": sorted(i["tutorial_id"] for i in items if i["completed"])}


# ---------------------------------------------------------------- patterns

def create_pattern(title: str, fold: dict, user_id: str | None = None) -> int:
    with session() as s:
        p = Pattern(title=title, fold_json=json.dumps(fold), user_id=user_id)
        s.add(p)
        s.commit()
        s.refresh(p)
        return p.id


def list_patterns(user_id: str | None = None) -> list[dict]:
    with session() as s:
        stmt = select(Pattern)
        if user_id:
            stmt = stmt.where(Pattern.user_id == user_id)
        rows = s.exec(stmt.order_by(Pattern.created_at.desc(), Pattern.id.desc())).all()
        return [{"id": r.id, "title": r.title, "created_at": r.created_at.isoformat()} for r in rows]


def get_pattern(pattern_id: int) -> dict | None:
    with session() as s:
        r = s.get(Pattern, pattern_id)
        if r is None:
            return None
        return {"id": r.id, "title": r.title, "fold": json.loads(r.fold_json), "user_id": r.user_id}
