import { useEffect, useState } from "react";
import { Link, useNavigate } from "react-router-dom";
import { Check, LogOut, PenTool, Sparkles } from "lucide-react";
import { api, usingMocks } from "../api";
import { useStudioInbox, useToasts, useUser, xpLevel } from "../store";
import type { PatternSummary, TutorialSummary } from "../types";

export default function Profile() {
  const { userId, name, progress, signOut } = useUser();
  const navigate = useNavigate();
  const send = useStudioInbox((s) => s.send);
  const toast = useToasts((s) => s.push);
  const [tuts, setTuts] = useState<Record<string, TutorialSummary>>({});
  const [patterns, setPatterns] = useState<PatternSummary[] | null>(null);

  useEffect(() => {
    api
      .tutorials()
      .then((l) => setTuts(Object.fromEntries(l.map((t) => [t.id, t]))))
      .catch(() => undefined);
    if (userId && !usingMocks) api.patterns(userId).then(setPatterns).catch(() => setPatterns([]));
    else setPatterns([]);
  }, [userId]);

  const xp = progress?.xp ?? 0;
  const lv = xpLevel(xp);
  const into = xp % 200;
  const inProgress = (progress?.items ?? []).filter((i) => !i.completed);

  const openPattern = async (id: number) => {
    try {
      const p = await api.pattern(id);
      send(p.fold, p.title);
      navigate("/studio");
    } catch {
      toast("Could not open that pattern.");
    }
  };

  return (
    <div className="mx-auto max-w-3xl px-4 py-6">
      <div className="flex items-center gap-3">
        <h1 className="text-2xl font-semibold">{name ?? "Profile"}</h1>
        {userId && (
          <button type="button" className="icon-btn ml-auto" aria-label="Sign out" onClick={signOut}>
            <LogOut className="h-4 w-4" aria-hidden />
          </button>
        )}
      </div>
      {!userId && <p className="mt-2 text-muted">Add your name (reload the page) to track progress.</p>}

      <section className="panel mt-4 p-4" aria-label="Experience">
        <div className="flex items-center gap-3">
          <span className="mono text-3xl text-accent">Lv {lv}</span>
          <span className="mono inline-flex items-center gap-1 text-muted">
            <Sparkles className="h-4 w-4 text-accent" aria-hidden />
            {xp} XP
          </span>
        </div>
        <div className="mt-3 h-2 overflow-hidden rounded-full bg-panel2" role="progressbar" aria-valuemin={0} aria-valuemax={200} aria-valuenow={into} aria-label="Progress to next level">
          <div className="h-full bg-accent" style={{ width: `${(into / 200) * 100}%` }} />
        </div>
        <p className="mono mt-1 text-xs text-muted">{200 - into} XP to Lv {lv + 1}</p>
      </section>

      <section className="mt-5" aria-labelledby="done-h">
        <h2 id="done-h" className="font-medium">
          Completed
        </h2>
        {(progress?.completed.length ?? 0) === 0 ? (
          <p className="mt-1 text-sm text-muted">None yet.</p>
        ) : (
          <ul className="mt-2 flex flex-wrap gap-2">
            {progress!.completed.map((id) => (
              <li key={id}>
                <Link to={`/t/${id}`} className="chip">
                  <Check className="h-3.5 w-3.5 text-success" aria-hidden />
                  {tuts[id]?.title ?? id}
                </Link>
              </li>
            ))}
          </ul>
        )}
      </section>

      {inProgress.length > 0 && (
        <section className="mt-5" aria-labelledby="ip-h">
          <h2 id="ip-h" className="font-medium">
            In progress
          </h2>
          <ul className="mt-2 flex flex-wrap gap-2">
            {inProgress.map((i) => (
              <li key={i.tutorial_id}>
                <Link to={`/t/${i.tutorial_id}`} className="chip">
                  {tuts[i.tutorial_id]?.title ?? i.tutorial_id}
                  <span className="mono text-xs text-muted">
                    {i.step_index + 1}/{tuts[i.tutorial_id]?.steps ?? "?"}
                  </span>
                </Link>
              </li>
            ))}
          </ul>
        </section>
      )}

      <section className="mt-5" aria-labelledby="pat-h">
        <h2 id="pat-h" className="font-medium">
          My patterns
        </h2>
        {patterns === null && <p className="mt-1 text-sm text-muted">Loading…</p>}
        {patterns?.length === 0 && <p className="mt-1 text-sm text-muted">Save a pattern from the Studio.</p>}
        <ul className="mt-2 grid gap-2 sm:grid-cols-2">
          {patterns?.map((p) => (
            <li key={p.id}>
              <button type="button" className="panel flex w-full items-center gap-2 p-3 text-left hover:border-muted" onClick={() => openPattern(p.id)}>
                <PenTool className="h-4 w-4 text-accent" aria-hidden />
                <span className="min-w-0 flex-1 truncate">{p.title}</span>
                <span className="mono text-xs text-muted">{new Date(p.created_at).toLocaleDateString()}</span>
              </button>
            </li>
          ))}
        </ul>
      </section>
    </div>
  );
}
