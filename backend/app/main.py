import os
from contextlib import asynccontextmanager

from fastapi import FastAPI, File, HTTPException, UploadFile
from fastapi.middleware.cors import CORSMiddleware

from . import catalog
from .detect import detect_bytes
from .guide import make_guide
from .models import GuideRequest



@asynccontextmanager
async def lifespan(_app: FastAPI):
    catalog.warm()  # precompute library guides
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
