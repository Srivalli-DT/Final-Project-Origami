import { useEffect, useState } from "react";
import { Link, useSearchParams } from "react-router-dom";
import { Check, Clock } from "lucide-react";
import { api } from "../api";
import { CategoryIcon } from "../components/Icon";
import { LevelDots } from "../components/LevelDots";
import { useUser } from "../store";
import type { Category, TutorialSummary } from "../types";

export default function Library() {
  const [params, setParams] = useSearchParams();
  const category = params.get("category") ?? "";
  const level = Number(params.get("level") ?? 0) || 0;
  const q = params.get("q") ?? "";
  const [cats, setCats] = useState<Category[]>([]);
  const [items, setItems] = useState<TutorialSummary[] | null>(null);
  const done = new Set(useUser((s) => s.progress?.completed ?? []));

  useEffect(() => {
    api.categories().then(setCats).catch(() => setCats([]));
  }, []);
  useEffect(() => {
    setItems(null);
    api
      .tutorials(category || undefined, level || undefined, q || undefined)
      .then(setItems)
      .catch(() => setItems([]));
  }, [category, level, q]);

  const set = (k: string, v: string) => {
    const next = new URLSearchParams(params);
    if (v) next.set(k, v);
    else next.delete(k);
    setParams(next, { replace: true });
  };

  return (
    <div className="px-4 py-6">
      <div className="flex flex-wrap items-baseline gap-3">
        <h1 className="text-2xl font-semibold">Library</h1>
        {q && (
          <button type="button" className="chip" onClick={() => set("q", "")} aria-label={`Clear search ${q}`}>
            “{q}” ×
          </button>
        )}
      </div>
      <div className="mt-4 flex flex-wrap gap-2" role="group" aria-label="Category">
        <button type="button" className="chip" aria-pressed={!category} onClick={() => set("category", "")}>
          All
        </button>
        {cats
          .filter((c) => c.count > 0)
          .map((c) => (
            <button
              key={c.id}
              type="button"
              className="chip"
              aria-pressed={category === c.id}
              onClick={() => set("category", category === c.id ? "" : c.id)}
              title={c.description}
            >
              <CategoryIcon name={c.icon} />
              {c.title}
              <span className="mono text-xs text-muted">{c.count}</span>
            </button>
          ))}
      </div>
      <div className="mt-2 flex flex-wrap items-center gap-2" role="group" aria-label="Level">
        <span className="text-sm text-muted">Level</span>
        {[1, 2, 3, 4, 5].map((l) => (
          <button
            key={l}
            type="button"
            className="chip mono w-9 justify-center px-0"
            aria-pressed={level === l}
            aria-label={`Level ${l}`}
            onClick={() => set("level", level === l ? "" : String(l))}
          >
            {l}
          </button>
        ))}
      </div>

      {items === null && <p className="mt-6 text-muted">Loading…</p>}
      {items && items.length === 0 && <p className="mt-6 text-muted">No tutorials match.</p>}
      <ul className="mt-5 grid grid-cols-2 gap-3 sm:grid-cols-3 lg:grid-cols-4 xl:grid-cols-6">
        {items?.map((t) => (
          <li key={t.id}>
            <Link to={`/t/${t.id}`} className="panel group block overflow-hidden transition-colors hover:border-muted">
              <div
                className="aspect-square bg-panel2 p-3 [&>svg]:h-full [&>svg]:w-full"
                aria-hidden
                dangerouslySetInnerHTML={{ __html: t.thumbnail_svg }}
              />
              <div className="p-2.5">
                <div className="flex items-center gap-1 truncate text-sm font-medium">
                  {done.has(t.id) && <Check className="h-3.5 w-3.5 shrink-0 text-success" aria-label="done" />}
                  <span className="truncate">{t.title}</span>
                </div>
                <div className="mt-1 flex items-center justify-between text-xs text-muted">
                  <LevelDots level={t.level} />
                  <span className="mono inline-flex items-center gap-1">
                    <Clock className="h-3 w-3" aria-hidden />
                    {t.minutes}m
                  </span>
                </div>
              </div>
            </Link>
          </li>
        ))}
      </ul>
    </div>
  );
}
