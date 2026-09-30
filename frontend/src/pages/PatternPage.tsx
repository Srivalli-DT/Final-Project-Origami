import { useEffect, useState } from "react";
import { Link, useParams } from "react-router-dom";
import { getPattern } from "../api";
import GuideActions from "../components/GuideActions";
import Player from "../components/Player";
import type { Pattern } from "../types";

export default function PatternPage() {
  const { id = "" } = useParams();
  const [pattern, setPattern] = useState<Pattern | null>(null);
  const [error, setError] = useState<string | null>(null);

  useEffect(() => {
    setPattern(null);
    setError(null);
    getPattern(id)
      .then(setPattern)
      .catch((e) => setError(String(e.message ?? e)));
  }, [id]);

  if (error)
    return (
      <main className="mx-auto max-w-3xl p-8">
        <p className="text-rose-700">Could not load this pattern: {error}</p>
        <Link to="/" className="btn mt-4">
          ← Back
        </Link>
      </main>
    );
  if (!pattern) return <main className="mx-auto max-w-6xl p-8 text-stone-500">Loading…</main>;
  const slug = `pattern-${pattern.id}`;
  return (
    <Player
      title={pattern.title}
      slug={slug}
      fold={pattern.fold}
      guide={pattern.guide}
      actions={<GuideActions title={pattern.title} slug={slug} fold={pattern.fold} guide={pattern.guide} />}
    />
  );
}
