# CreaseLens — 3-minute demo script

**Before you start (2 minutes early):** open the Render API URL (`/health`) so the free server wakes up.
Then open the Vercel site. Have `frontend/public/samples/preliminary-error.png` ready, and Origami
Simulator (https://origamisimulator.org) open in another tab.

## 1. The Hub (0:00–0:25)
- "Crease patterns are how modern origami is published, but they don't tell you the order to fold."
- Show the hero line and the three tabs: **Bases**, **Tessellations**, **Modular**. Read one explainer.
- Point out the difficulty badges and the "Upload your crease pattern" card.

## 2. A guided model: Waterbomb base (0:25–1:00)
- Open **Waterbomb Base**.
- Left: the sequenced crease pattern — the current crease is bold, finished ones grey, future ones faint.
- Press **Play**: the book folds and diagonals fold and unfold in 3D, then the collapse.
- Drag the scrub slider on the collapse step to show the hinge animation ("simplified preview").

## 3. Upload with a deliberate error (1:00–1:50)
- Go to **Upload** → **Try a sample: "Preliminary base with an error"**.
- Show the detected-lines overlay next to the editable CP, and the confidence and grid.
- Validation shows a **red dot** at the centre: "Maekawa: 4 mountain vs 4 valley".
- Click the wrong crease (the right half of the horizontal line) once: M → V. The dot turns
  **green**: "Every vertex passes Maekawa and Kawasaki".
- Press **Generate guide** → the player opens with the fixed pattern.

## 4. "I'm stuck" (1:50–2:15)
- On a reference step press **I'm stuck**: a simpler explanation appears, with what the paper should
  look like and a common mistake. Mention it comes from Gemini, with a template fallback.
- Toggle **Read aloud**.

## 5. Export video (2:15–2:40)
- Press **Export video**; the progress runs while the guide plays, then `…-guide.webm` downloads.
  (It records in real time: keep the tab visible. If time is short, show a pre-recorded file.)

## 6. Download .fold → Origami Simulator (2:40–3:00)
- Press **.fold**, drag the file into Origami Simulator and fold it with the slider.
- Close: "From a screenshot to a checked, sequenced, animated lesson."
