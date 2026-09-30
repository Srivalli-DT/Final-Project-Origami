import os
from contextlib import asynccontextmanager

from fastapi import FastAPI, File, HTTPException, UploadFile
from fastapi.middleware.cors import CORSMiddleware

from . import catalog, db
from .detect import detect_bytes
from .guide import make_guide
from .models import GuideRequest, NarrateRequest, PatternCreate
from .narrate import narrate



@asynccontextmanager
async def lifespan(_app: FastAPI):
    catalog.warm()  # precompute library guides
    db.get_engine()  # create tables
    yield


app = FastAPI(title="CreaseLens API", lifespan=lifespan)

MAX_UPLOAD = 5 * 1024 * 1024

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


@app.get("/api/library")
def list_library():
    return catalog.summaries()


@app.get("/api/library/{model_id}")
def get_library_model(model_id: str):
    model = catalog.get(model_id)
    if model is None:
        raise HTTPException(404, f"unknown model '{model_id}'")
    return model


@app.post("/api/guide")
def post_guide(req: GuideRequest):
    fold = catalog.normalize_fold(req.fold.model_dump())
    guide = make_guide(fold)
    guide["fold"] = fold
    return guide


@app.post("/api/detect")
async def post_detect(image: UploadFile = File(...)):
    data = await image.read(MAX_UPLOAD + 1)
    if len(data) > MAX_UPLOAD:
        raise HTTPException(413, "image is larger than 5MB")
    try:
        return detect_bytes(data)
    except ValueError as e:
        raise HTTPException(400, str(e)) from e


@app.post("/api/narrate")
def post_narrate(req: NarrateRequest):
    return narrate(req.step, req.mode)


@app.post("/api/patterns")
def post_pattern(req: PatternCreate):
    fold = catalog.normalize_fold(req.fold.model_dump())
    return {"id": db.create_pattern(req.title.strip(), fold)}


@app.get("/api/patterns")
def get_patterns():
    return db.list_patterns()


@app.get("/api/patterns/{pattern_id}")
def get_pattern(pattern_id: int):
    p = db.get_pattern(pattern_id)
    if p is None:
        raise HTTPException(404, "pattern not found")
    return {**p, "guide": make_guide(p["fold"])}
