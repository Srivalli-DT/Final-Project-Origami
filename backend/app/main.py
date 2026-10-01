import os
from contextlib import asynccontextmanager

from fastapi import FastAPI, HTTPException
from fastapi.middleware.cors import CORSMiddleware

from . import db
from .fold_utils import normalize_fold
from .models import PatternCreate


@asynccontextmanager
async def lifespan(_app: FastAPI):
    db.get_engine()  # create tables
    yield


app = FastAPI(title="CreaseLens API", lifespan=lifespan)

_origins = ["http://localhost:5173"]
if os.getenv("FRONTEND_URL"):
    _origins += [o.strip().rstrip("/") for o in os.environ["FRONTEND_URL"].split(",") if o.strip()]

app.add_middleware(
    CORSMiddleware,
    allow_origins=_origins,
    allow_methods=["*"],
    allow_headers=["*"],
)


@app.get("/health")
def health():
    return {"status": "ok"}


@app.post("/api/patterns")
def post_pattern(req: PatternCreate):
    fold = normalize_fold(req.fold.model_dump())
    return {"id": db.create_pattern(req.title.strip(), fold)}


@app.get("/api/patterns")
def get_patterns():
    return db.list_patterns()


@app.get("/api/patterns/{pattern_id}")
def get_pattern(pattern_id: int):
    p = db.get_pattern(pattern_id)
    if p is None:
        raise HTTPException(404, "pattern not found")
    return p
