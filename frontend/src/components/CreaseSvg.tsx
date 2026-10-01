import { useState } from "react";
import type { Crease, P2 } from "../types";

export const DASH = { V: "0.025 0.016", M: "0.03 0.012 0.006 0.012" } as const;
export const STROKE = { M: "#ff5d5d", V: "#4da3ff" } as const;

export const creaseKey = (c: Crease) => `${c.a[0].toFixed(4)},${c.a[1].toFixed(4)}-${c.b[0].toFixed(4)},${c.b[1].toFixed(4)}-${c.assignment}`;

interface Props {
  width: number;
  height: number;
  creases: Crease[];
  current: Set<string>;
  highlight?: boolean;
  onHoverCurrent?: (on: boolean) => void;
  label: string;
}

/** The unfolded sheet with the creases made so far (paper coordinates, y up). */
export default function CreaseSvg({ width, height, creases, current, highlight, onHoverCurrent, label }: Props) {
  const [hover, setHover] = useState<{ p: P2; asg: "M" | "V" } | null>(null);
  const pad = 0.04 * Math.max(width, height);
  const sw = 0.006 * Math.max(width, height);
  const ordered = [...creases].sort((a, b) => Number(current.has(creaseKey(a))) - Number(current.has(creaseKey(b))));
  return (
    <svg
      viewBox={`${-pad} ${-pad} ${width + 2 * pad} ${height + 2 * pad}`}
      className="h-full w-full"
      role="img"
      aria-label={label}
    >
      <rect x={0} y={0} width={width} height={height} fill="#f3e6cc" stroke="#2a2f3a" strokeWidth={sw} rx={0.004} />
      {ordered.map((c, i) => {
        const isCur = current.has(creaseKey(c));
        const [ax, ay] = c.a;
        const [bx, by] = c.b;
        const mid: P2 = [(ax + bx) / 2, (ay + by) / 2];
        return (
          <g
            key={`${creaseKey(c)}-${i}`}
            onPointerEnter={() => {
              setHover({ p: mid, asg: c.assignment });
              if (isCur) onHoverCurrent?.(true);
            }}
            onPointerLeave={() => {
              setHover(null);
              if (isCur) onHoverCurrent?.(false);
            }}
            onFocus={() => {
              setHover({ p: mid, asg: c.assignment });
              if (isCur) onHoverCurrent?.(true);
            }}
            onBlur={() => {
              setHover(null);
              if (isCur) onHoverCurrent?.(false);
            }}
            tabIndex={isCur ? 0 : undefined}
            role={isCur ? "img" : undefined}
            aria-label={isCur ? `Current crease: ${c.assignment === "M" ? "mountain" : "valley"}` : undefined}
          >
            <line x1={ax} y1={height - ay} x2={bx} y2={height - by} stroke="transparent" strokeWidth={sw * 5} />
            <line
              x1={ax}
              y1={height - ay}
              x2={bx}
              y2={height - by}
              stroke={STROKE[c.assignment]}
              strokeWidth={isCur ? sw * (highlight ? 2.6 : 2) : sw}
              strokeDasharray={DASH[c.assignment]}
              strokeLinecap="round"
              opacity={isCur ? 1 : 0.4}
              className={isCur ? "crease-current" : undefined}
            />
          </g>
        );
      })}
      {hover && (
        <g pointerEvents="none">
          <rect x={hover.p[0] - 0.035} y={height - hover.p[1] - 0.035} width={0.07} height={0.07} rx={0.012} fill="#0e1014" />
          <text
            x={hover.p[0]}
            y={height - hover.p[1] + 0.017}
            fontSize={0.05}
            textAnchor="middle"
            fontFamily="JetBrains Mono"
            fill={STROKE[hover.asg]}
          >
            {hover.asg}
          </text>
        </g>
      )}
    </svg>
  );
}
