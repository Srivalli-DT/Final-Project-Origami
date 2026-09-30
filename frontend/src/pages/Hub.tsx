import { useEffect, useState } from "react";
import { Link } from "react-router-dom";
import { getLibrary, listPatterns, usingMocks } from "../api";
import DifficultyBadge from "../components/DifficultyBadge";
import type { Category, LibraryItem, PatternSummary } from "../types";

const CATEGORIES: { id: Category; label: string; blurb: string }[] = [
  {
    id: "bases",
    label: "Bases",
    blurb:
      "Bases are the standard starting shapes of traditional origami. Most classic models, like the crane, the frog and the fish, begin by collapsing a square into one of a handful of bases. Learn these and you can start almost any traditional design.",
  },
  {
    id: "tessellations",
    label: "Tessellations",
    blurb:
      "Tessellations fold a single sheet into a repeating pattern of pleats and twists. They are precreased on a grid and then collapsed all at once. They appear in engineering too: the Miura-ori folds solar panels for spacecraft.",
  },
  {
    id: "modular",
    label: "Modular",
    blurb:
      "Modular origami builds one shape from many identical units that lock together without glue. Each unit is simple; the challenge is folding them consistently and assembling them.",
  },
];

export default function Hub() {
  const [items, setItems] = useState<LibraryItem[] | null>(null);
  const [error, setError] = useState<string | null>(null);
  const [cat, setCat] = useState<Category>("bases");
  const [patterns, setPatterns] = useState<PatternSummary[] | null>(null);

  useEffect(() => {
    getLibrary()
      .then(setItems)
      .catch((e) => setError(String(e.message ?? e)));
    if (!usingMocks) listPatterns().then(setPatterns).catch(() => setPatterns([]));
  }, []);

  const current = CATEGORIES.find((c) => c.id === cat)!;
  const shown = (items ?? []).filter((i) => i.category === cat);

  return (
    <main className="mx-auto max-w-6xl px-4 py-8">
      <section className="grid items-center gap-6 md:grid-cols-[1.4fr_1fr]">
        <div>
          <h1 className="font-serif text-4xl leading-tight sm:text-5xl">Learn to fold from any crease pattern</h1>
          <p className="mt-3 max-w-xl text-stone-600">
            Pick a model from the library or upload a screenshot of a crease pattern. CreaseLens checks it,
            orders the creases into steps and animates each fold in 3D.
          </p>
        </div>
        <Link
          to="/upload"
          className="card group flex items-center gap-4 border-2 border-dashed border-accent/60 p-5 transition hover:border-accent hover:bg-rose-50"
        >
          <div className="flex h-14 w-14 shrink-0 items-center justify-center rounded-full bg-accent text-2xl text-white">
            ↑
          </div>
          <div>
            <div className="font-serif text-xl">Upload your crease pattern</div>
            <div className="text-sm text-stone-600">A screenshot or a .fold file becomes a step-by-step guide</div>
          </div>
        </Link>
      </section>

      <div className="mt-10 flex gap-1 border-b border-stone-200" role="tablist">
        {CATEGORIES.map((c) => (
          <button
            key={c.id}
            role="tab"
            aria-selected={cat === c.id}
            onClick={() => setCat(c.id)}
            className={`-mb-px border-b-2 px-4 py-2 text-sm font-medium ${
              cat === c.id ? "border-accent text-accent" : "border-transparent text-stone-500 hover:text-stone-800"
            }`}
          >
            {c.label}
          </button>
        ))}
      </div>
      <p className="mt-4 max-w-3xl text-stone-700">{current.blurb}</p>

      {error && <p className="mt-6 text-rose-700">Could not load the library: {error}</p>}
      {!items && !error && (
        <div className="mt-6 grid gap-4 sm:grid-cols-2 lg:grid-cols-4">
          {Array.from({ length: 4 }, (_, i) => (
            <div key={i} className="card h-64 animate-pulse bg-stone-100" />
          ))}
        </div>
      )}
      {items && shown.length === 0 && <p className="mt-6 text-stone-500">No models in this category yet.</p>}
      <div className="mt-6 grid gap-4 sm:grid-cols-2 lg:grid-cols-4">
        {shown.map((m) => (
          <Link
            key={m.id}
            to={`/learn/${m.id}`}
            className="card overflow-hidden transition hover:-translate-y-0.5 hover:shadow-md"
          >
            <div
              className="aspect-square bg-[#fffdf8] p-4 [&>svg]:h-full [&>svg]:w-full"
              dangerouslySetInnerHTML={{ __html: m.thumbnail_svg }}
            />
            <div className="flex items-center justify-between gap-2 border-t border-stone-100 p-3">
              <span className="font-medium">{m.title}</span>
              <DifficultyBadge d={m.difficulty} />
            </div>
          </Link>
        ))}
      </div>

      {!usingMocks && (
        <section className="mt-12">
          <h2 className="font-serif text-2xl">My patterns</h2>
          {patterns === null ? (
            <p className="mt-2 text-sm text-stone-500">Loading…</p>
          ) : patterns.length === 0 ? (
            <p className="mt-2 text-sm text-stone-500">
              Nothing saved yet. Upload a crease pattern and press “Save” on its guide.
            </p>
          ) : (
            <ul className="mt-3 grid gap-2 sm:grid-cols-2 lg:grid-cols-3">
              {patterns.map((p) => (
                <li key={p.id}>
                  <Link to={`/patterns/${p.id}`} className="card block px-4 py-3 hover:border-stone-400">
                    <div className="font-medium">{p.title}</div>
                    <div className="text-xs text-stone-500">{new Date(p.created_at).toLocaleString()}</div>
                  </Link>
                </li>
              ))}
            </ul>
          )}
        </section>
      )}
    </main>
  );
}
