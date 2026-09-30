import { useState } from "react";
import { useNavigate } from "react-router-dom";
import { savePattern, usingMocks } from "../api";
import { downloadFold, downloadSequencedSvg } from "../fold/download";
import { useToasts } from "../store";
import type { Fold, Guide } from "../types";

interface Props {
  title: string;
  slug: string;
  fold: Fold;
  guide: Guide;
  canSave?: boolean;
}

/** Download / save buttons shown above the player. */
export default function GuideActions({ title, slug, fold, guide, canSave }: Props) {
  const toast = useToasts((s) => s.push);
  const navigate = useNavigate();
  const [saving, setSaving] = useState(false);
  const [savedId, setSavedId] = useState<number | null>(null);

  const save = async () => {
    setSaving(true);
    try {
      const { id } = await savePattern(title, fold);
      setSavedId(id);
      toast("Saved to My patterns", "info");
    } catch (e) {
      toast(`Could not save: ${(e as Error).message}`);
    } finally {
      setSaving(false);
    }
  };

  return (
    <>
      <button className="btn" onClick={() => downloadFold(title, slug, fold)} title="Opens in Origami Simulator / ORIPA">
        .fold
      </button>
      <button className="btn" onClick={() => downloadSequencedSvg(title, slug, fold, guide)}>
        Steps SVG
      </button>
      {canSave && !usingMocks && (
        savedId ? (
          <button className="btn" onClick={() => navigate(`/patterns/${savedId}`)}>
            Saved ✓
          </button>
        ) : (
          <button className="btn btn-primary" onClick={save} disabled={saving}>
            {saving ? "Saving…" : "Save"}
          </button>
        )
      )}
    </>
  );
}
