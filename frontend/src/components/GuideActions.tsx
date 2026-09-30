import type { Fold, Guide } from "../types";

interface Props {
  title: string;
  slug: string;
  fold: Fold;
  guide: Guide;
  canSave?: boolean;
}

/** Download / save / export buttons shown above the player (filled in later phases). */
export default function GuideActions(_props: Props) {
  return null;
}
