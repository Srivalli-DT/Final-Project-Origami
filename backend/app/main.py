import os
from contextlib import asynccontextmanager

from fastapi import FastAPI, HTTPException, Query
from fastapi.middleware.cors import CORSMiddleware

from . import ask as ask_mod
from . import db, studio
from .fold_utils import normalize_fold
from .models import AskRequest, PatternCreate, ProgressUpdate, StudioCheck, StudioPreview, UserCreate
from .seed import levels as level_defs


@asynccontextmanager
async def lifespan(_app: FastAPI):
    db.get_engine()  # create tables and seed content
    yield


app = FastAPI(title="CreaseLens API", lifespan=lifespan)

_origins = ["http://localhost:5173"]
if os.getenv("FRONTEND_URL"):
    _origins += [o.strip().rstrip("/") for o in os.environ["FRONTEND_URL"].split(",") if o.strip()]

app.add_middleware(CORSMiddleware, allow_origins=_origins, allow_methods=["*"], allow_headers=["*"])

UNLOCK_SHARE = 0.6


@app.get("/health")
def health():
    return {"status": "ok"}


# ---------------------------------------------------------------- content

@app.get("/api/categories")
def get_categories():
    return db.categories()


@app.get("/api/tutorials")
def get_tutorials(category: str | None = None, level: int | None = Query(None, ge=1, le=5),
                  q: str | None = None):
    return db.tutorials(category, level, q)


@app.get("/api/tutorials/{tid}")
def get_tutorial(tid: str):
    t = db.tutorial(tid)
    if t is None:
        raise HTTPException(404, f"unknown tutorial '{tid}'")
    return t


@app.get("/api/levels")
def get_levels(user_id: str | None = None):
    done = set(db.progress(user_id)["completed"]) if user_id else set()
    by_level: dict[int, list[str]] = {}
    for t in db.tutorials():
        by_level.setdefault(t["level"], []).append(t["id"])
    out = []
    unlocked = True
    for lv in level_defs():
        ids = by_level.get(lv["level"], [])
        out.append({**lv, "tutorial_ids": ids, "locked": not unlocked})
        share = (sum(1 for i in ids if i in done) / len(ids)) if ids else 1.0
        unlocked = unlocked and share >= UNLOCK_SHARE
    return out


@app.get("/api/rules")
def get_rules():
    return db.rules()


# ---------------------------------------------------------------- users and progress

@app.post("/api/users")
def post_user(req: UserCreate):
    return {"user_id": db.create_user(req.name.strip()), "name": req.name.strip()}


@app.get("/api/users/{user_id}")
def get_user(user_id: str):
    u = db.get_user(user_id)
    if u is None:
        raise HTTPException(404, "unknown user")
    return u


@app.get("/api/progress")
def get_progress(user_id: str):
    return db.progress(user_id)


@app.post("/api/progress")
def post_progress(req: ProgressUpdate):
    if db.get_user(req.user_id) is None:
        raise HTTPException(404, "unknown user")
    if db.tutorial(req.tutorial_id) is None:
        raise HTTPException(404, "unknown tutorial")
    return db.save_progress(req.user_id, req.tutorial_id, req.step_index, req.completed)


# ---------------------------------------------------------------- patterns

@app.post("/api/patterns")
def post_pattern(req: PatternCreate):
    fold = normalize_fold(req.fold.model_dump())
    return {"id": db.create_pattern(req.title.strip(), fold, req.user_id)}


@app.get("/api/patterns")
def get_patterns(user_id: str | None = None):
    return db.list_patterns(user_id)


@app.get("/api/patterns/{pattern_id}")
def get_pattern(pattern_id: int):
    p = db.get_pattern(pattern_id)
    if p is None:
        raise HTTPException(404, "pattern not found")
    return p


# ---------------------------------------------------------------- studio

@app.post("/api/studio/check")
def post_studio_check(req: StudioCheck):
    return studio.run_checks(req.fold.model_dump(), req.exceptions.model_dump())


@app.post("/api/studio/preview")
def post_studio_preview(req: StudioPreview):
    return studio.preview(req.fold.model_dump())


# ---------------------------------------------------------------- ask

@app.post("/api/ask")
def post_ask(req: AskRequest):
    t = db.tutorial(req.tutorial_id)
    if t is None:
        raise HTTPException(404, "unknown tutorial")
    if req.step_index >= len(t["steps"]):
        raise HTTPException(422, "step_index out of range")
    return ask_mod.ask(t, req.step_index, req.question)
