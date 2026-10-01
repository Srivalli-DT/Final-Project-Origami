import { useEffect, useState } from "react";
import { Link, useNavigate, useParams } from "react-router-dom";
import { ChevronLeft, PenTool, ShieldCheck } from "lucide-react";
import { api } from "../api";
import { useStudioInbox } from "../store";
import type { Fold, Rule } from "../types";

function useRules() {
  const [rules, setRules] = useState<Rule[] | null>(null);
  useEffect(() => {
    api.rules().then(setRules).catch(() => setRules([]));
  }, []);
  return rules;
}

/** Small static picture of a demo crease pattern. */
export function MiniCP({ fold, size = 96 }: { fold: Fold; size?: number }) {
  const c = fold.vertices_coords;
  return (
    <svg viewBox="-0.04 -0.04 1.08 1.08" width={size} height={size} aria-hidden>
      <rect width={1} height={1} fill="#f3e6cc" />
      {fold.edges_vertices.map(([a, b], i) => {
        const asg = fold.edges_assignment[i];
        if (asg === "B") return null;
        const col = asg === "M" ? "#ff5d5d" : asg === "V" ? "#4da3ff" : "#6b7280";
        const dash = asg === "M" ? "0.05 0.02 0.01 0.02" : asg === "V" ? "0.04 0.025" : undefined;
        return (
          <line key={i} x1={c[a][0]} y1={1 - c[a][1]} x2={c[b][0]} y2={1 - c[b][1]} stroke={col} strokeWidth={0.018} strokeDasharray={dash} />
        );
      })}
    </svg>
  );
}

export function RulesList() {
  const rules = useRules();
  return (
    <div className="mx-auto max-w-4xl px-4 py-6">
      <h1 className="text-2xl font-semibold">Rules</h1>
      {!rules && <p className="mt-6 text-muted">Loading…</p>}
      <ul className="mt-5 grid gap-3 sm:grid-cols-2">
        {rules?.map((r) => (
          <li key={r.id}>
            <Link to={`/rules/${r.id}`} className="panel flex h-full gap-3 p-3 transition-colors hover:border-muted">
              {r.demo_fold ? (
                <MiniCP fold={r.demo_fold} size={64} />
              ) : (
                <span className="flex h-16 w-16 shrink-0 items-center justify-center rounded-md bg-panel2">
                  <ShieldCheck className="h-6 w-6 text-muted" aria-hidden />
                </span>
              )}
              <span className="min-w-0">
                <span className="block font-medium">{r.title}</span>
                <span className="block text-sm text-muted">{r.statement}</span>
                {r.checkable && <span className="mt-1 inline-block text-xs text-success">Checked in Studio</span>}
              </span>
            </Link>
          </li>
        ))}
      </ul>
    </div>
  );
}

export function RuleDetail() {
  const { id = "" } = useParams();
  const rules = useRules();
  const navigate = useNavigate();
  const send = useStudioInbox((s) => s.send);
  const rule = rules?.find((r) => r.id === id);
  if (!rules) return <p className="p-6 text-muted">Loading…</p>;
  if (!rule)
    return (
      <div className="p-6">
        <p className="text-error">Unknown rule.</p>
        <Link to="/rules" className="chip mt-3">
          Rules
        </Link>
      </div>
    );
  return (
    <div className="mx-auto max-w-3xl px-4 py-6">
      <Link to="/rules" className="icon-btn" aria-label="All rules">
        <ChevronLeft className="h-4 w-4" aria-hidden />
      </Link>
      <h1 className="mt-3 text-2xl font-semibold">{rule.title}</h1>
      <p className="mt-1 text-lg">{rule.statement}</p>
      <div className="mt-4 grid gap-4 sm:grid-cols-[1fr_auto]">
        <div className="space-y-2">
          <details className="panel p-3" open>
            <summary className="cursor-pointer font-medium">Why</summary>
            <p className="mt-2 text-sm text-text">{rule.why}</p>
          </details>
          <details className="panel p-3" open>
            <summary className="cursor-pointer font-medium">Example</summary>
            <p className="mt-2 text-sm text-text">{rule.example}</p>
          </details>
          {rule.details.length > 0 && (
            <details className="panel p-3">
              <summary className="cursor-pointer font-medium">Details</summary>
              <ul className="mt-2 list-disc space-y-1 pl-5 text-sm">
                {rule.details.map((d) => (
                  <li key={d}>{d}</li>
                ))}
              </ul>
            </details>
          )}
          {rule.exceptions.length > 0 && (
            <details className="panel p-3" open>
              <summary className="cursor-pointer font-medium">Exceptions</summary>
              <ul className="mt-2 space-y-2 text-sm">
                {rule.exceptions.map((x) => (
                  <li key={x.title}>
                    <span className="font-medium text-accent">{x.title}</span>
                    <span className="text-text"> — {x.text}</span>
                  </li>
                ))}
              </ul>
            </details>
          )}
        </div>
        {rule.demo_fold && (
          <div className="panel flex flex-col items-center gap-2 p-3">
            <MiniCP fold={rule.demo_fold} size={160} />
            <button
              type="button"
              className="btn-accent w-full"
              onClick={() => {
                send(rule.demo_fold!, `${rule.title} demo`);
                navigate("/studio");
              }}
            >
              <PenTool className="h-4 w-4" aria-hidden />
              Open in Studio
            </button>
          </div>
        )}
      </div>
    </div>
  );
}
