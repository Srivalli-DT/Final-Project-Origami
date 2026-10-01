import { useEffect, useMemo, useState } from "react";
import { Link } from "react-router-dom";
import { Check, ChevronDown, Lock } from "lucide-react";
import { api } from "../api";
import { useUser } from "../store";
import type { Level, TutorialSummary } from "../types";

export default function School() {
  const userId = useUser((s) => s.userId);
  const progress = useUser((s) => s.progress);
  const [levels, setLevels] = useState<Level[] | null>(null);
  const [tuts, setTuts] = useState<Record<string, TutorialSummary>>({});
  const [open, setOpen] = useState<number | null>(null);

  useEffect(() => {
    api.levels(userId).then(setLevels).catch(() => setLevels([]));
    api
      .tutorials()
      .then((list) => setTuts(Object.fromEntries(list.map((t) => [t.id, t]))))
      .catch(() => undefined);
  }, [userId, progress?.xp]);

  const done = useMemo(() => new Set(progress?.completed ?? []), [progress]);
  // the current level: the first unlocked level that is not finished
  const current = useMemo(() => {
    if (!levels) return null;
    const lv = levels.find((l) => !l.locked && l.tutorial_ids.some((id) => !done.has(id)));
    return lv?.level ?? null;
  }, [levels, done]);

  useEffect(() => {
    if (open === null && current !== null) setOpen(current);
  }, [current, open]);

  return (
    <div className="mx-auto max-w-2xl px-4 py-6">
      <h1 className="text-2xl font-semibold">Folding School</h1>
      {!levels && <p className="mt-6 text-muted">Loading…</p>}
      <ol className="relative mt-6 space-y-3 before:absolute before:bottom-6 before:left-[1.35rem] before:top-6 before:w-px before:bg-line">
        {levels?.map((lv) => {
          const ids = lv.tutorial_ids;
          const n = ids.filter((id) => done.has(id)).length;
          const isOpen = open === lv.level;
          const isCurrent = current === lv.level;
          return (
            <li key={lv.level} className="relative">
              <button
                type="button"
                aria-expanded={isOpen}
                aria-controls={`level-${lv.level}`}
                onClick={() => setOpen(isOpen ? null : lv.level)}
                className={`flex w-full items-center gap-3 rounded-lg border p-2 text-left transition-colors ${
                  isCurrent ? "border-accent bg-panel2" : "border-line bg-panel hover:border-muted"
                }`}
              >
                <span
                  className={`mono relative z-10 flex h-9 w-9 shrink-0 items-center justify-center rounded-full border text-sm ${
                    n === ids.length && ids.length
                      ? "border-success bg-success text-bg"
                      : isCurrent
                        ? "border-accent text-accent"
                        : "border-line bg-panel2 text-muted"
                  }`}
                >
                  {lv.locked ? <Lock className="h-4 w-4" aria-label="locked" /> : n === ids.length && ids.length ? <Check className="h-4 w-4" aria-label="complete" /> : lv.level}
                </span>
                <span className="min-w-0 flex-1">
                  <span className="block font-medium">{lv.title}</span>
                  <span className="mono text-xs text-muted">
                    {n}/{ids.length}
                  </span>
                </span>
                <ChevronDown className={`h-4 w-4 text-muted transition-transform ${isOpen ? "rotate-180" : ""}`} aria-hidden />
              </button>
              {isOpen && (
                <div id={`level-${lv.level}`} className="ml-12 mt-2 flex flex-wrap gap-2">
                  {lv.locked && <p className="w-full text-sm text-muted">Finish 60% of the previous level to unlock.</p>}
                  {ids.map((id) => {
                    const t = tuts[id];
                    const ok = done.has(id);
                    return lv.locked ? (
                      <span key={id} className="chip cursor-not-allowed opacity-50">
                        <Lock className="h-3.5 w-3.5" aria-hidden />
                        {t?.title ?? id}
                      </span>
                    ) : (
                      <Link key={id} to={`/t/${id}`} className={`chip ${ok ? "border-success/60" : ""}`}>
                        {ok && <Check className="h-3.5 w-3.5 text-success" aria-label="done" />}
                        {t?.title ?? id}
                      </Link>
                    );
                  })}
                </div>
              )}
            </li>
          );
        })}
      </ol>
    </div>
  );
}
