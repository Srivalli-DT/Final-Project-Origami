# CreaseLens — project rules for Claude Code

CreaseLens teaches people to fold origami from crease patterns (CPs).
- A Learn Hub has categories (Bases, Tessellations, Modular) with built-in guided models.
- Users can upload a screenshot of a CP. It is detected, validated and turned into a step-by-step guided fold: a sequenced crease pattern, a 3D animation and narration.

The full build plan is in `docs/PLAN.md`. Only do the phase you are asked to do, then stop and report.

## Machine constraints (important)
- The laptop has an i5, 8GB RAM and basic graphics. No Docker. No local ML training. No heavy deps.
- Use `opencv-python-headless`, never `opencv-python`.
- Keep at most one backend dev server and one frontend dev server running. Prefer running tests over starting servers.
- Do not leave long-running processes running when a phase ends.

## Stack
- `/backend`:
  - Python 3.11, FastAPI, uvicorn, numpy, opencv-python-headless, networkx, pydantic v2, sqlmodel, google-genai, pytest
  - Layout: `backend/app/` (modules) and `backend/tests/`
  - venv in `backend/.venv`
- `/frontend`:
  - React 18, Vite, TypeScript, Tailwind, react-router-dom, zustand, three, @react-three/fiber, @react-three/drei
- Hosting (free, one Vercel project):
  - Frontend: static build of `frontend/` (`vercel.json` at the repo root)
  - Backend: FastAPI as a Python serverless function, `api/index.py`, deps in root `requirements.txt`
  - `/api/*` and `/health` are same-origin; the frontend uses `VITE_API_URL=/`

## Data format
Use FOLD JSON with coordinates in the unit square [0,1]².
- Keys: `vertices_coords`, `edges_vertices`, `edges_assignment` ("M" mountain, "V" valley, "B" boundary, "F" flat/reference), `faces_vertices`.
- Conventions:
  - Valley = the paper rotates toward the viewer (+z).
  - Mountain = the paper rotates away from the viewer (−z).
- Geometric tolerance: `EPS = 1e-6` for math; `SNAP = 1e-3` for merging detected vertices.

## API contract (frontend and backend both code against this; do not change without updating both)
```
GET  /health                     -> {"status":"ok"}
GET  /api/library                -> [{id,title,category,difficulty:{score,label},thumbnail_svg}]
GET  /api/library/{id}           -> {id,title,category,description,fold,guide}
POST /api/detect  (multipart "image") -> {fold, overlay_png_b64, confidence, grid}
POST /api/guide   {fold}         -> guide + {fold}   (the normalised FOLD the guide's indices refer to)
POST /api/narrate {step, mode:"normal"|"simpler"} -> {text, source:"gemini"|"template"}
POST /api/patterns {title, fold} -> {id}      (saved user uploads)
GET  /api/patterns               -> [{id,title,created_at}]
GET  /api/patterns/{id}          -> {id,title,fold,guide}
```
`category` is one of "bases" | "tessellations" | "modular".

The `guide` object:
```
{
  validation: {ok: bool, vertices: [{vertex, ok, maekawa_ok, kawasaki_ok, reasons: [str]}]},
  difficulty: {score: 0-100, label: "Beginner"|"Intermediate"|"Advanced"},
  faces: [[vertex indices]],          // same as fold.faces_vertices
  face_tree: {root: int, nodes: [{face, parent, hinge_edge, sign}]},   // sign: +1 valley, -1 mountain; root has parent -1
  folded_coords: [[x,y]],            // flat-folded 2D position of every vertex (fallback animation)
  steps: [{index, title, kind: "reference"|"precrease"|"collapse"|"assembly",
           line: [[x1,y1],[x2,y2]] | null,   // for single-line steps
           assignment: "M"|"V"|null,
           edges: [int], cumulative_edges: [int], text}]
}
```

## Code rules
- Geometry and algorithms are pure functions in their own modules. API routes stay thin.
- Every backend module gets pytest tests. Run `pytest -q` before saying a phase is done.
- Every library model must pass validation in tests.
- No secrets in git. Use env vars: `GEMINI_API_KEY`, `GEMINI_MODEL` (default `gemini-2.5-flash`), `FRONTEND_URL`, `DATABASE_URL` (default `sqlite:///./creaselens.db`), `VITE_API_URL`.
- The frontend must work against `frontend/src/mock/*.json` when `VITE_API_URL` is unset.
- Commit at the end of every phase with the message `phase N: <summary>`.
