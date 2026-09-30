import type { Fold, VertexCheck } from "../types";

const COLOURS: Record<string, string> = { M: "#e53935", V: "#1e88e5", F: "#9e9e9e", B: "#2b2622" };

interface Props {
  fold: Fold;
  /** Edges made in earlier steps (drawn light grey). */
  doneEdges?: number[];
  /** Edges of the current step (drawn bold in colour). */
  currentEdges?: number[];
  /** When false, every edge is drawn in full colour (no step sequencing). */
  sequenced?: boolean;
  vertexChecks?: VertexCheck[];
  selectedVertex?: number | null;
  onEdgeClick?: (edge: number) => void;
  onVertexClick?: (vertex: number) => void;
  onPaperClick?: (x: number, y: number) => void;
  extra?: React.ReactNode;
  className?: string;
}

/** SVG crease pattern. CP coordinates are y-up; SVG y is flipped. */
export default function CPView({
  fold,
  doneEdges = [],
  currentEdges = [],
  sequenced = true,
  vertexChecks,
  selectedVertex,
  onEdgeClick,
  onVertexClick,
  onPaperClick,
  extra,
  className,
}: Props) {
  const done = new Set(doneEdges);
  const cur = new Set(currentEdges);
  const c = fold.vertices_coords;

  const handlePaper = (e: React.MouseEvent<SVGSVGElement>) => {
    if (!onPaperClick) return;
    const svg = e.currentTarget;
    const pt = svg.createSVGPoint();
    pt.x = e.clientX;
    pt.y = e.clientY;
    const p = pt.matrixTransform(svg.getScreenCTM()!.inverse());
    onPaperClick(p.x, 1 - p.y);
  };

  const order = fold.edges_vertices
    .map((_, i) => i)
    .sort((a, b) => rank(a) - rank(b));
  function rank(i: number) {
    if (fold.edges_assignment[i] === "B") return 3;
    if (cur.has(i)) return 2;
    if (done.has(i)) return 1;
    return 0;
  }

  return (
    <svg
      viewBox="-0.03 -0.03 1.06 1.06"
      className={className ?? "w-full h-auto"}
      onClick={handlePaper}
      role="img"
      aria-label="crease pattern"
    >
      <rect x={0} y={0} width={1} height={1} fill="#fffdf8" />
      {order.map((i) => {
        const [a, b] = fold.edges_vertices[i];
        const asg = fold.edges_assignment[i];
        const [x1, y1] = c[a];
        const [x2, y2] = c[b];
        let stroke = COLOURS[asg];
        let width = 0.006;
        let dash: string | undefined = asg === "V" ? "0.025 0.015" : undefined;
        let opacity = 1;
        if (sequenced && asg !== "B") {
          if (cur.has(i)) {
            width = 0.014;
          } else if (done.has(i)) {
            stroke = "#b8b2a7";
            width = 0.006;
          } else {
            stroke = "#cfc9bd";
            width = 0.004;
            dash = "0.006 0.012";
            opacity = 0.7;
          }
        }
        return (
          <g key={i}>
            <line
              x1={x1}
              y1={1 - y1}
              x2={x2}
              y2={1 - y2}
              stroke={stroke}
              strokeWidth={width}
              strokeDasharray={dash}
              strokeLinecap="round"
              opacity={opacity}
            />
            {onEdgeClick && asg !== "B" && (
              <line
                x1={x1}
                y1={1 - y1}
                x2={x2}
                y2={1 - y2}
                stroke="transparent"
                strokeWidth={0.03}
                className="cursor-pointer"
                onClick={(e) => {
                  e.stopPropagation();
                  onEdgeClick(i);
                }}
              >
                <title>Click to change: M → V → F → delete</title>
              </line>
            )}
          </g>
        );
      })}
      {vertexChecks?.map((v) => {
        const [x, y] = c[v.vertex] ?? [0, 0];
        return (
          <circle
            key={v.vertex}
            cx={x}
            cy={1 - y}
            r={selectedVertex === v.vertex ? 0.022 : 0.013}
            fill={v.ok ? "#2e7d32" : "#d32f2f"}
            stroke="#fff"
            strokeWidth={0.004}
            className={onVertexClick ? "cursor-pointer" : undefined}
            onClick={(e) => {
              e.stopPropagation();
              onVertexClick?.(v.vertex);
            }}
          >
            <title>{v.ok ? "OK" : v.reasons.join("; ")}</title>
          </circle>
        );
      })}
      {extra}
    </svg>
  );
}
