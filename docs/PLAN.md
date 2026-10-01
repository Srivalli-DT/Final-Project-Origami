# CreaseLens v2: build plan (≈23:45 → 05:00)

Put this file at `docs/PLAN.md`. Claude Code: do only the phase you are asked for, run its checks, commit, stop, and give a summary of 5 lines or fewer.

## Timeline

| Phase | Time | Terminal A (backend) | Terminal B (frontend) |
|---|---|---|---|
| 0 | 23:45–00:00 | Pivot: clean up v1, keep reusable modules | — |
| 1 | 00:00–01:10 | Fold engine + tests | UI shell, design system, accessibility, routes on mocks |
| 2 | 01:10–02:10 | Tutorial language + compiler + 12 tutorials + database + API | Tutorial player (dual viewport) |
| 3 | 02:10–03:10 | Rules content + 10 more tutorials + levels/progress API | Studio: editor + rule checks + physics solver |
| 4 | 03:10–03:40 | Integration, progress, "Ask" (Gemini) | (with A) |
| 5 | 03:40–04:15 | Production deploy + live test | |
| 6 | 04:15–04:40 | README + demo script | |
| — | 04:40–05:00 | Buffer. No new features | |

**Cut order if late:** Gemini "Ask" → grab-and-pull → strain heatmap → tutorials beyond 15 → levels lock (keep levels as filters).

**Never cut:** the fold engine, the tutorial player, the Rules page, the Studio editor with fold % slider, and the dual viewport.

---

## Phase 0: pivot (terminal A)
- Read the v1 code. Keep `fold_utils.py`, `validate.py`, `guide.py`, and `frontend/src/fold/animate.ts`.
- Delete the old Hub/Player/Upload pages and the `/api/library`, `/api/guide` and `/api/detect` routes.
- Move any detection code to `backend/app/_archive/` (not imported).
- Update `requirements.txt` (add shapely, pyyaml, sqlmodel, google-genai).
- Check: `pytest -q` passes. Commit.

---

## Phase 1A: fold engine (`backend/app/engine/`)

### State
- `Paper(width=1, height=1 | 1.414 | ...)`.
- `Piece{id, paper_poly: list[(x,y)] in paper coords, M: 3×3 affine (may include reflection), layer: int}`.
- `folded_poly = M · paper_poly`. `face_up = det(M[:2,:2]) > 0`. Front = the coloured side.
- Initial state: one piece, identity, layer 0. Option `start: "colour_up" | "white_up"`.
- `creases: list[{a, b (paper coords), assignment "M"|"V"}]`. Track this across steps to produce the sequenced crease pattern.

### Operations (`ops.py`, all pure: `state → (state, keyframe)`)
- **`fold(line, kind="valley"|"mountain", move=point|None, layers="all"|"flap", flap_count=1)`**
  1. Choose the moving side: the side containing `move`; by default, the side with the smaller selected area.
  2. Select pieces: all pieces, or for "flap", the top `flap_count` pieces under the `move` point.
  3. Split each selected piece by the line in folded coordinates (shapely), mapping the halves back to paper coords with M⁻¹. Drop slivers with area < 1e-9.
  4. Moving halves get `M' = Reflect(line) · M`.
  5. Layers:
     - valley: `new = global_max + (sel_max − old) + 1`
     - mountain: `new = global_min − (old − sel_min) − 1`
     - then re-rank to 0..n.
  6. Record creases: the line ∩ piece (in paper coords). Assignment = kind if the piece is face_up, otherwise flipped. Merge collinear duplicates.
- **`crease(line, kind)`**: fold and unfold. Records creases; the state doesn't change. Animation goes out and back.
- **`turn_over(axis="vertical"|"horizontal")`**: reflect everything about the bounding-box centre line and reverse the layers.
- **`rotate(deg)`**: in-plane rotation about the bounding-box centre.
- **`unfold(to_step)`**: restore that step's state, keeping all creases made since.
- **`collapse()`**: precondition is that the paper is flat and unfolded. Build a crease pattern from `creases` → `guide.py` face tree + `folded_coords` → pieces = faces with layer = tree depth. The keyframe uses hinge animation. Mark it `approx_layers: true`.
- **`shape(note)`**: a 3D/non-flat final shaping step, such as opening a box or puffing a balloon. No simulation; `is_shaping: true`.

### Lines (`lines.py`): Huzita–Justin axioms, all in current folded coords
- `through(p, q)` = axiom 1
- `point_to_point(p, q)` = axiom 2
- `line_to_line(l1, l2, which)` = axiom 3
- `perp_through(l, p)` = axiom 4
- `point_to_line_through(p, l, q)` = axiom 5 (stretch)

### Point references (so tutorials are easy to write)
- `"P(x,y)"`: where paper point (x,y) currently lies (the top-most piece containing it).
- `"F(x,y)"`: a raw folded coordinate.
- `"corner:tl|tr|bl|br"`, `"mid:top|bottom|left|right"`, `"center"`: relative to the current folded bounding box.

### Rendering (`render.py`, dev only)
`render_state_png(state, path)` and `render_cp_svg(creases, paper)`.

### Tests
- valley fold in half → 2 pieces, the moving piece face_down, bounding box halved
- turn_over flips face_up for every piece
- `crease` leaves the state unchanged and adds 1 crease
- `collapse` on preliminary-base creases → folded bounding-box area ≈ 1/4
- the creases after the kite-base fold sequence pass `validate.py`

## Phase 1B: frontend shell (terminal B, parallel)
- Apply the CLAUDE.md design system as Tailwind theme tokens and CSS variables. Fonts: Inter and JetBrains Mono.
- **Layout:**
  - Left icon rail: School, Library, Studio, Rules, Profile. Icons with tooltips and aria-labels.
  - Top bar: search, level badge, XP.
  - Main canvas area.
  - Skip link.
- **Routes:**
  - `/` Folding School: a vertical path of Level 1–5 nodes, each expanding to its tutorial chips. Completed ✓, current one highlighted.
  - `/library`: category chips, a level filter (1–5), and a grid of compact cards (thumbnail, title, level dots, minutes).
  - `/t/:id`: Player (Phase 2B).
  - `/studio`: Studio (Phase 3B).
  - `/rules` and `/rules/:id`.
  - `/me`: profile and progress.
- Mocks in `src/mock/` that follow the API contract: categories, 3 tutorials (one with compiled steps), levels and rules.
- Keyboard shortcuts overlay (`?`). A `prefers-reduced-motion` hook.
- Check: `npm run build` passes; the axe-core dev check (`@axe-core/react` in dev only) reports no serious issues. Commit.

---

## Phase 2A: tutorial language, compiler, content, database (terminal A)

### YAML schema (`backend/content/tutorials/<id>.yaml`)
```yaml
id: crane
title: Crane
category: animals          # see categories below
level: 3                   # 1–5
minutes: 15
paper: {width: 1, height: 1, start: colour_up}
tags: [traditional, bird-base]
steps:
  - op: crease
    line: {through: ["P(0,0)", "P(1,1)"]}
    kind: valley
    title: Diagonal crease
    instruction: Fold corner to corner, unfold.     # ≤12 words
    tips: ["Align corners first, then press from the centre out."]
    mistakes: ["Creasing before corners meet."]
    symbol: fold-unfold     # valley|mountain|fold-unfold|turn-over|rotate|squash|reverse|petal|sink|inflate|repeat
  - op: collapse
    ...
```

### Categories (`content/categories.yaml`)
foundations, bases, animals, birds, flowers, boxes, planes, action, masks, modular, tessellations, geometric.

### Compiler (`app/tutorials/compile.py`)
- Parse YAML → validate with pydantic → run the engine → list of CompiledStep.
- `final_svg`: the final-state silhouette.
- `thumbnail_svg`: the same, small.
- Errors name the step index and the reason (for example "line misses paper", "flap point not on any piece").
- CLI: `python -m app.tutorials.compile [id|--all] --render` writes PNGs per step to `backend/.renders/<id>/`.
- **When authoring, open the final PNG and check it resembles the model. Fix it if not.**

### Content: write 12 now (more in Phase 3A)
- **Level 1 foundations:**
  - Valley fold
  - Mountain fold
  - Fold & unfold
  - Turn over & rotate
  - Inside reverse (explained via crease + collapse)
  - Squash (same approach)
- **Bases:** kite, triangle (waterbomb), square (preliminary).
- **Models:** dog face (L1), cup (L2), dart plane (L2, paper 1×1.414).
- Every step has an instruction, at least 1 tip, and at least 1 mistake.
- Language: simple and imperative, in reference-finding terms ("edge to centre line").

### Database (SQLModel)
- Tables: `Category`, `Tutorial` (meta + compiled JSON), `Rule`, `User(id, name)`, `Progress(user_id, tutorial_id, step_index, completed, updated_at)`, `Pattern(id, user_id, title, fold_json, created_at)`.
- Seed on startup by upserting by id from `content/`. Compile once and cache the JSON in the DB.

### API
Follow the contract in CLAUDE.md for categories, tutorials, levels (derived from tutorial levels and `content/levels.yaml` titles), users, and progress.

### Tests
- every tutorial compiles
- every non-shaping step has a non-null axis or op ∈ {turn_over, rotate, collapse}
- level and category values are valid

Then write the real mock JSON for terminal B into `frontend/src/mock/`. Commit and push.

## Phase 2B: tutorial player (terminal B)
**Dual viewport:**
- **Left (40%):** SVG crease pattern of the paper, unfolded, using `creases_so_far`.
  - The current step's crease is bold with an animated dash.
  - Earlier creases are dimmed.
  - M is red dash-dot; V is blue dashed.
- **Right (60%):** 3D view (react-three-fiber, OrbitControls, grid floor, soft key light).
  - Pieces are extruded flat polygons with z = layer × 0.003.
  - Front and back materials use the paper colours.

**Step animation:**
- **fold/crease:** pieces with `moving: true` rotate about `axis` from 0 to π × direction (valley toward the camera, mountain away), over 1.6s with ease-in-out. `crease` goes 0 → 0.92π → 0. At the end, switch to `state_after`.
- **turn_over / rotate:** the whole group rotates.
- **collapse:** use `animate.ts` hinge mode.
- **shape:** a static `final_svg` plus a 3D tilt and a "3D shaping" badge.
- **Hover sync:** hovering a crease in the SVG highlights the same fold line in 3D, and vice versa.

**Controls (bottom bar, icons only):** prev, play/pause, next, step dots, fold-progress scrub (0–100% of the current step), speed (0.5×/1×/2×), replay.

**Step card (right overlay, compact):**
- step number, title, instruction (one line), and the symbol icon
- an "i" toggle revealing tips (💡) and common mistakes (⚠)
- a "✓ Done" button that saves progress

**Keyboard and accessibility:** per CLAUDE.md, including the aria-live instruction and a reduced-motion jump-cut.

**Check:** the build passes, and the mock crane/cup tutorials play end to end. Commit.

---

## Phase 3A: rules, more content, levels (terminal A)

### `content/rules.yaml`
Each rule has: title (≤3 words), statement (1 line), why (≤2 lines), example `demo_fold` (a small crease pattern the Studio can open), and exceptions.

- **Maekawa:** |M−V| = 2 at a flat vertex.
- **Kawasaki:** alternate angles sum to 180°.
- **Even degree:** interior vertices have an even number of creases.
- **Big-little-big:** the smallest angle's neighbouring creases must have opposite types.
- **Two-colourable:** a flat-foldable crease pattern's faces can be 2-coloured.
- **No self-intersection:** layers can't pass through each other (layer ordering; global flat-foldability is NP-hard).
- **Huzita–Justin axioms:** the 7 single-fold constructions (one line each).
- **Diagram symbols:** the Yoshizawa–Randlett conventions.
- **Paper rules:** one square sheet, no cuts, no glue.

**Exceptions** (each linked to the rules it relaxes):
- kirigami (cuts)
- modular (many sheets, sometimes glue)
- wet-folding and curved creases (not straight-line flat-foldable)
- 3D shaping and non-flat models (masu box, balloon)
- rectangles (planes, dollar-bill folding)
- tessellations (twists; rigid-foldable vs not)
- action models (moving parts)

### `/api/studio/check`
Runs Maekawa, Kawasaki, even degree, big-little-big and two-colourability. Returns per-rule results with vertex lists. The `exceptions` flags skip or relax checks (`allow_cuts`, `non_flat`, `curved`). Uses `validate.py` and adds the new checks plus tests.

### `/api/studio/preview`
Reuses `guide.py`.

### 10 more tutorials (stretch to 20)
- **Bases:** fish base.
- **Birds:** swan (kite base), crane (L3, square base → petal folds as crease + collapse).
- **Masks:** cat face, fox face.
- **Flowers:** tulip blossom.
- **Boxes:** masu box (final step `shape`).
- **Planes:** glider.
- **Action:** fortune teller.
- **Modular:** Sonobe unit (+ an assembly `shape` step).
- **Tessellations:** pleat strip, Miura-ori (crease steps + collapse).

### `content/levels.yaml`
1. Basics
2. First models
3. Bases & reverse folds
4. Intermediate
5. Advanced

A level unlocks when 60% of the previous level is complete. Return a `locked` flag per user.

Check: `pytest -q` passes. Commit and push.

## Phase 3B: Studio (terminal B)

### Layout
- **Left:** crease pattern editor (SVG). **Right:** 3D simulator (dual viewport, hover-synced).
- **Tools (number keys):**
  1. select
  2. valley line
  3. mountain line
  4. flat/reference line
  5. eraser
  6. axiom tools (point→point, line→line)
- **Grid:** 4/8/16/32 with snapping to grid points, intersections and 22.5° angles.
- Undo/redo; templates (blank, kite, square base, waterbomb, Miura); import/export `.fold` and `.svg`.

### Rules panel (right side)
- A row per rule with a ✓/✗ icon; clicking it highlights the failing vertices on both views.
- Exceptions toggles: cuts, non-flat, curved.
- Calls `/api/studio/check`, debounced 300ms.

### Physics solver (`src/sim/solver.ts`, our own implementation of the bar-and-hinge method from Ghassaei, Demaine & Gershenfeld, 7OSME)
- **Model:**
  - Triangulate faces; the triangulation edges are facet hinges (target 0, stiff).
  - Particles = vertices.
  - Axial bars on every edge (stiff springs).
  - Crease hinges on M/V edges: target angle = ±fold% × π (V+, M−).
  - Dihedral forces use the standard 4-vertex hinge gradient.
- **Integration:**
  - Explicit/Verlet with damping, 20–40 substeps per frame.
  - Unit-scale geometry; cap at ~3000 vertices.
  - Pause when the tab is hidden.
- **Fold % slider (0–100%):** all creases fold simultaneously. Keyboard `[` `]`.
- **Strain heatmap toggle:**
  - Per-vertex mean |L−L₀|/L₀ of the incident bars, mapped to vertex colours.
  - Two ramps: green→red, and viridis (colour-blind-safe).
  - A legend shows the max %.
- **Grab & pull:**
  - Raycast to the nearest vertex and pin it to the pointer on a camera-facing plane while dragging; release to unpin.
  - The rest of the model reacts through the solver.
  - Keyboard alternative: select a vertex with Tab, then nudge it with arrow keys.
- **Fallback:** if the solver is unstable, show hinge-animation mode (`animate.ts`) with the same slider.
- **Tests (vitest):** a single valley crease reaches ≈ fold% × π within 500 steps; bar strain is under 1% at rest.

### Save
Save the pattern to the database (`/api/patterns`) and list it under "My patterns" in `/me`.

Check: the build passes; Miura-ori folds smoothly with the slider on the laptop (≥ 30 fps). Commit.

---

## Phase 4: integration (A+B)
- Point everything at the real API. A "waking server…" toast covers Render cold starts.
- User: first visit asks for a name only (no password), stores `user_id` locally, and calls `POST /api/users`.
- Progress and XP:
  - +10 per step completed, +50 per tutorial completed.
  - Level lock state on School and Library.
- **"Ask" (Gemini) in the step card:**
  - A small input box.
  - The prompt includes the tutorial title, the step instruction, tips, and the user's question.
  - Answer in ≤3 short sentences. Template fallback when there's no key.
  - Cache answers.
- "Open in Studio" button on any tutorial, which loads its final `creases_so_far` crease pattern into the Studio. This links learning with experimenting.
- Check: the full flow works locally. Commit and push.

## Phase 5: production deploy + live test
- Render env vars: `GEMINI_API_KEY`, `GEMINI_MODEL`, `FRONTEND_URL`, `DATABASE_URL` (Neon).
- Vercel env var: `VITE_API_URL`.
- Live test:
  - School → a Level 1 tutorial → complete it → XP updates
  - Library filters
  - crane player
  - Rules → open a demo in the Studio
  - Studio: draw an invalid vertex → ✗ shown → fix → fold slider, strain, grab
  - keyboard-only pass
  - phone check
- Fix deploy and environment issues only.

## Phase 6: docs + demo
- `README.md`:
  - gap and sources (Akitaya et al. 2013; Kosmulski origami-AI roadmap; Origami Simulator; FOLD)
  - features
  - architecture (Mermaid)
  - algorithms: fold engine (split/reflect/layer), Huzita–Justin line construction, collapse via face tree, bar-and-hinge solver, rule checks
  - accessibility statement
  - limitations: layer order is approximate in collapse; shaping steps aren't simulated; the solver is CPU-based
  - future work: Flat-Folder layer solver, crease-pattern detection from images, camera fold checking
- `docs/demo_script.md`, 3 minutes:
  1. School path
  2. Crane player with dual viewport and tips
  3. Rules → exception
  4. Studio: break Maekawa, then fix it; strain heatmap; grab and pull
  5. Progress
- Open the Render URL 2 minutes before demoing.
