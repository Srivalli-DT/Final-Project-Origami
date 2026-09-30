import type { Difficulty } from "../types";

const STYLE: Record<Difficulty["label"], string> = {
  Beginner: "bg-emerald-100 text-emerald-800",
  Intermediate: "bg-amber-100 text-amber-800",
  Advanced: "bg-rose-100 text-rose-800",
};

export default function DifficultyBadge({ d }: { d: Difficulty }) {
  return (
    <span className={`inline-block rounded-full px-2.5 py-0.5 text-xs font-medium ${STYLE[d.label]}`}>
      {d.label} · {d.score}
    </span>
  );
}
