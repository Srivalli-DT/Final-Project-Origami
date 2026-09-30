import type { Fold, Guide } from "../types";
import { downloadBlob } from "./export";

/** A FOLD file that opens in Origami Simulator and ORIPA-compatible tools. */
export function foldFile(title: string, fold: Fold): string {
  return JSON.stringify(
    {
      file_spec: 1.1,
      file_creator: "CreaseLens",
      file_title: title,
      frame_classes: ["creasePattern"],
      frame_attributes: ["2D"],
      vertices_coords: fold.vertices_coords,
      edges_vertices: fold.edges_vertices,
      edges_assignment: fold.edges_assignment,
      faces_vertices: fold.faces_vertices,
    },
    null,
    1,
  );
}

export function downloadFold(title: string, slug: string, fold: Fold) {
  downloadBlob(new Blob([foldFile(title, fold)], { type: "application/json" }), `${slug}.fold`);
}

const COLOURS: Record<string, string> = { M: "#e53935", V: "#1e88e5", F: "#9e9e9e", B: "#2b2622" };

const esc = (s: string) =>
  s.replace(/&/g, "&amp;").replace(/</g, "&lt;").replace(/>/g, "&gt;").replace(/"/g, "&quot;");

function wrapText(text: string, maxChars: number, maxLines: number): string[] {
  const words = text.split(/\s+/);
  const lines: string[] = [];
  let line = "";
  for (const w of words) {
    if ((line + " " + w).trim().length > maxChars && line) {
      lines.push(line);
      line = w;
    } else line = (line + " " + w).trim();
  }
  if (line) lines.push(line);
  if (lines.length > maxLines) {
    lines.length = maxLines;
    lines[maxLines - 1] += "…";
  }
  return lines;
}

/** The sequenced crease pattern as one SVG: one panel per step. */
export function sequencedSvg(title: string, fold: Fold, guide: Guide): string {
  const cols = 4;
  const cell = 220;
  const pad = 20;
  const textH = 70;
  const rows = Math.ceil(guide.steps.length / cols);
  const W = cols * (cell + pad) + pad;
  const H = 60 + rows * (cell + textH + pad) + pad;
  const c = fold.vertices_coords;
  const parts: string[] = [
    `<svg xmlns="http://www.w3.org/2000/svg" width="${W}" height="${H}" viewBox="0 0 ${W} ${H}" font-family="Georgia, serif">`,
    `<rect width="${W}" height="${H}" fill="#faf7f0"/>`,
    `<text x="${pad}" y="40" font-size="26" fill="#2b2622">${esc(title)} — sequenced crease pattern</text>`,
  ];
  guide.steps.forEach((step, i) => {
    const x0 = pad + (i % cols) * (cell + pad);
    const y0 = 60 + Math.floor(i / cols) * (cell + textH + pad);
    const done = new Set(i > 0 ? guide.steps[i - 1].cumulative_edges : []);
    const cur = new Set(step.edges);
    parts.push(`<g transform="translate(${x0},${y0})">`);
    parts.push(`<rect width="${cell}" height="${cell}" fill="#fffdf8" stroke="#ddd"/>`);
    const m = 10;
    const s = cell - 2 * m;
    const lines: [number, string][] = [];
    fold.edges_vertices.forEach(([a, b], e) => {
      const asg = fold.edges_assignment[e];
      const [x1, y1] = c[a];
      const [x2, y2] = c[b];
      let stroke = COLOURS[asg];
      let width = 1.2;
      let dash = asg === "V" ? ` stroke-dasharray="5 3"` : "";
      let rank = 3;
      if (asg !== "B") {
        if (cur.has(e)) {
          width = 3;
          rank = 2;
        } else if (done.has(e)) {
          stroke = "#b8b2a7";
          rank = 1;
        } else {
          stroke = "#d8d2c6";
          width = 0.8;
          dash = ` stroke-dasharray="1.5 3"`;
          rank = 0;
        }
      }
      lines.push([
        rank,
        `<line x1="${(m + x1 * s).toFixed(2)}" y1="${(m + (1 - y1) * s).toFixed(2)}" x2="${(m + x2 * s).toFixed(2)}" y2="${(m + (1 - y2) * s).toFixed(2)}" stroke="${stroke}" stroke-width="${width}" stroke-linecap="round"${dash}/>`,
      ]);
    });
    lines.sort((p, q) => p[0] - q[0]).forEach(([, l]) => parts.push(l));
    parts.push(`<text x="0" y="${cell + 20}" font-size="14" font-weight="bold" fill="#2b2622">${i + 1}.</text>`);
    wrapText(step.title, 30, 3).forEach((line, k) =>
      parts.push(`<text x="20" y="${cell + 20 + k * 17}" font-size="13" fill="#2b2622">${esc(line)}</text>`),
    );
    parts.push(`</g>`);
  });
  parts.push(`</svg>`);
  return parts.join("\n");
}

export function downloadSequencedSvg(title: string, slug: string, fold: Fold, guide: Guide) {
  downloadBlob(new Blob([sequencedSvg(title, fold, guide)], { type: "image/svg+xml" }), `${slug}-steps.svg`);
}
