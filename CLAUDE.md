# CreaseLens: project rules for Claude Code (v2, tutorial-first)

CreaseLens is an origami learning platform with a dark "studio" UI. It has five areas:
1. **Folding School**: a levelled learning path (Levels 1–5), from basic folds up to advanced models.
2. **Library**: a database of step-by-step tutorials across many categories. Each step is simulated by a real fold engine and animated in 3D, with tips, common mistakes and diagram symbols.
3. **Rules**: the fundamental rules of origami (Maekawa, Kawasaki, big-little-big, two-colourability, Huzita–Justin axioms, diagram conventions) and their exceptions (kirigami, modular, wet-folding/curved, 3D shaping, rectangles, tessellations).
4. **Studio**: draw your own crease pattern with live rule checks (exceptions toggles) and a 3D fold preview.
5. **Progress**: per-user completed steps and tutorials, XP, and level unlocks.

The build plan is in `docs/PLAN.md` (v2). Only do the phase you are asked for, run its checks, commit, then stop and summarise.

## Machine constraints
- i5, 8GB RAM, basic GPU. No Docker. No ML training.
- Use `opencv-python-headless` only if needed.
- At most one backend and one frontend dev server. Prefer tests over servers. Leave no long-running processes behind.

## Stack
- `/backend`:
  - Python 3.11, FastAPI, numpy, pydantic v2, sqlmodel, pyyaml, shapely (polygon clipping), networkx, google-genai, pytest
  - Matplotlib only for dev renders.
- `/frontend`:
  - React 18, Vite, TS, Tailwind, react-router-dom, zustand, three, @react-three/fiber, @react-three/drei, lucide-react
- Database:
  - SQLModel with SQLite locally, Neon Postgres in production (`DATABASE_URL`).
  - Seeded from `backend/content/` YAML at startup (idempotent upsert).
- Hosting: one free Vercel project (chosen over Render). The frontend is a static build of `frontend/`; the
  backend runs as a Python function (`api/index.py`, deps in the root `requirements.txt`). `/api/*` and
  `/health` are same-origin, so the frontend uses `VITE_API_URL=/`. Use Neon Postgres for `DATABASE_URL`.

## Reuse from v1 (do not rewrite unless broken)
- `app/fold_utils.py`: building a planar graph and faces, `fold_to_svg`.
- `app/validate.py`: Maekawa and Kawasaki.
- `app/guide.py`: face tree, `folded_coords` and difficulty. Used by the Studio.
- `frontend/src/fold/animate.ts`: hinge animation. Used by the Studio preview.
- Old Hub and Player pages: replace them.

## Design system (dark studio)
- **Colours:**
  - bg `#0e1014`, panel `#161920`, panel-2 `#1d212b`, border `#2a2f3a`
  - text `#e7e9ee`, muted `#8a92a6`
  - accent (paper amber) `#f5b14c`
  - mountain `#ff5d5d`, valley `#4da3ff`, flat/reference `#6b7280`
  - success `#3ccf91`, warning `#f5b14c`, error `#ff5d5d`
- **3D paper:** front (coloured side) `#e2553f`, back `#f3e6cc`. Grid background in the 3D view.
- **Fonts:** Inter (UI) and JetBrains Mono (numbers, code, coordinates).
- **Layout:** a canvas-first, tool-like layout with a left nav rail, a central canvas and right inspector panels (Figma/Blender feel). Rounded-lg corners, 1px borders, no heavy shadows. Fully usable at 1280px; acceptable on mobile.
- **Diagram line convention (Yoshizawa–Randlett):** valley = dashed; mountain = dash-dot.

## Minimal wording (strict)
- Icons with tooltips instead of labels wherever the meaning is clear (lucide icons).
- Step instructions: one line, at most 12 words. Tips and mistakes are hidden behind one "i" toggle.
- No marketing copy and no paragraphs in the UI. Headings at most 3 words.
- Longer explanations live only on Rules pages, inside collapsible sections.

## Accessibility (required, WCAG 2.2 AA)
- Text contrast ≥ 4.5:1 and UI contrast ≥ 3:1 (the palette above passes; don't add lower-contrast greys).
- Never use colour alone:
  - mountain/valley also differ by line dash and by an "M"/"V" label on hover/focus
  - strain heatmap has a legend and a colour-blind-safe ramp option (viridis)
- Every icon button has `aria-label` and a visible focus ring (2px accent outline).
- Full keyboard use:
  - ←/→ = previous/next step
  - Space = play/pause
  - [ / ] = fold % −/+ 5
  - Studio tools on number keys
  - a "?" overlay lists the shortcuts
- `aria-live="polite"` region announces the current step's instruction.
- Respect `prefers-reduced-motion`: no auto-play, instant step transitions, sliders still work.
- Base font size 15px, hit targets ≥ 36px, semantic landmarks (nav/main/aside), skip-to-content link.
- 3D canvases have an `aria-label` describing the current state ("Step 4 of 12: valley fold, paper is a triangle").

## Data formats
- Crease patterns: FOLD JSON (`vertices_coords`, `edges_vertices`, `edges_assignment` M/V/F/B, `faces_vertices`). Paper coordinates are the unit square, or 1×h for rectangles.
- Tutorials: YAML in `backend/content/tutorials/*.yaml` (schema in PLAN Phase 2), compiled by the fold engine into keyframes.
- Rules: YAML in `backend/content/rules.yaml`.

## API contract (both sides code against this)
```
GET  /health
GET  /api/categories                    -> [{id,title,description,icon,count}]
GET  /api/tutorials?category=&level=&q= -> [{id,title,category,level,minutes,paper,thumbnail_svg,tags}]
GET  /api/tutorials/{id}                -> {meta..., steps:[CompiledStep], final_svg}
GET  /api/levels                        -> [{level,title,description,tutorial_ids}]
GET  /api/rules                         -> [{id,title,statement,why,example,exceptions:[{title,text}],demo_fold?}]
POST /api/studio/check  {fold, exceptions:{...}}  -> {ok, checks:[{rule_id,ok,vertices:[...],message}]}
POST /api/studio/preview {fold}         -> {face_tree, folded_coords, faces, difficulty}
POST /api/patterns {title,fold,user_id} -> {id};  GET /api/patterns?user_id=
POST /api/users {name} -> {user_id};  GET/POST /api/progress (user_id, tutorial_id, step_index, completed)
POST /api/ask {tutorial_id, step_index, question?} -> {text, source:"gemini"|"template"}
```

CompiledStep:
```
{index, title, op, instruction, tips:[str], mistakes:[str], symbol, check,
 axis:{p:[x,y], d:[x,y]} | null, direction: 1 | -1 | 0,
 pieces_before:[{id, poly:[[x,y]], layer, face_up, moving}],   // folded coords, split, before motion
 state_after:[{id, poly, layer, face_up}],
 creases_so_far:[{a:[x,y], b:[x,y], assignment}],              // paper coords: the sequenced crease pattern
 is_shaping: bool}   // 3D/non-flat final shaping: illustrated and explained, not simulated
```

## Rules for code
- Pure functions for geometry and the engine. API routes stay thin.
- pytest for every backend module. `pytest -q` must pass before a phase is done.
- **Every tutorial YAML must compile without errors in tests.** The compiler also renders PNG previews to `backend/.renders/` (gitignored). When authoring tutorials, **look at the rendered final-state PNG and fix the tutorial if it doesn't resemble the model.**
- Env vars: `GEMINI_API_KEY`, `GEMINI_MODEL` (default `gemini-2.5-flash`), `FRONTEND_URL`, `DATABASE_URL`, `VITE_API_URL`.
- The frontend uses `frontend/src/mock/*.json` when the API is unreachable.
- Commit at the end of each phase: `v2 phase N: <summary>`.
