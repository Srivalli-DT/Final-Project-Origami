import { useEffect, useState } from "react";
import { Link, useParams } from "react-router-dom";
import { getModel } from "../api";
import Player from "../components/Player";
import GuideActions from "../components/GuideActions";
import type { Model } from "../types";

export default function Learn() {
  const { id = "" } = useParams();
  const [model, setModel] = useState<Model | null>(null);
  const [error, setError] = useState<string | null>(null);

  useEffect(() => {
    setModel(null);
    setError(null);
    getModel(id)
      .then(setModel)
      .catch((e) => setError(String(e.message ?? e)));
  }, [id]);

  if (error)
    return (
      <main className="mx-auto max-w-3xl p-8">
        <p className="text-rose-700">Could not load this model: {error}</p>
        <Link to="/" className="btn mt-4">
          ← Back to the library
        </Link>
      </main>
    );
  if (!model) return <main className="mx-auto max-w-6xl p-8 text-stone-500">Loading…</main>;
  return (
    <Player
      title={model.title}
      slug={model.id}
      description={model.description}
      fold={model.fold}
      guide={model.guide}
      actions={<GuideActions title={model.title} slug={model.id} fold={model.fold} guide={model.guide} />}
    />
  );
}
