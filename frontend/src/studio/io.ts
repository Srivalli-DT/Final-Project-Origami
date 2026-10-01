import type { Fold } from "../types";
import type { Seg } from "./geometry";
import { segsToFold } from "./geometry";

export function download(name: string, text: string, type: string) {
  const url = URL.createObjectURL(new Blob([text], { type }));
  const a = document.createElement("a");
  a.href = url;
  a.download = name;
  document.body.appendChild(a);
  a.click();
  a.remove();
  setTimeout(() => URL.revokeObjectURL(url), 4000);
}

export function foldFileText(title: string, fold: Fold): string {
  return JSON.stringify(
    {
      file_spec: 1.1,
      file_creator: "CreaseLens",
      file_title: title,
      frame_classes: ["creasePattern"],
      vertices_coords: fold.vertices_coords,
      edges_vertices: fold.edges_vertices,
      edges_assignment: fold.edges_assignment,
      faces_vertices: fold.faces_vertices,
    },
    null,
    1,
  );
}

export function exportFold(title: string, segs: Seg[], normalized?: Fold | null) {
  download(`${slug(title)}.fold`, foldFileText(title, normalized ?? segsToFold(segs)), "application/json");
}

export function exportSvg(title: string, segs: Seg[]) {
  const S = 400;
  const col = { M: "#ff5d5d", V: "#4da3ff", F: "#6b7280" };
  const dash = { M: "12 5 3 5", V: "10 6", F: "" };
  const lines = segs
    .map(
      (s) =>
        `<line x1="${(s.a[0] * S).toFixed(2)}" y1="${((1 - s.a[1]) * S).toFixed(2)}" x2="${(s.b[0] * S).toFixed(2)}" y2="${((1 - s.b[1]) * S).toFixed(2)}" stroke="${col[s.asg]}" stroke-width="2.5"${dash[s.asg] ? ` stroke-dasharray="${dash[s.asg]}"` : ""}/>`,
    )
    .join("\n");
  const svg = `<svg xmlns="http://www.w3.org/2000/svg" viewBox="-10 -10 ${S + 20} ${S + 20}" width="${S + 20}" height="${S + 20}">
<title>${title.replace(/</g, "&lt;")}</title>
<rect width="${S}" height="${S}" fill="#f3e6cc" stroke="#0e1014" stroke-width="2"/>
${lines}
</svg>`;
  download(`${slug(title)}.svg`, svg, "image/svg+xml");
}

export async function readFoldFile(file: File): Promise<Fold> {
  const j = JSON.parse(await file.text());
  if (!Array.isArray(j.vertices_coords) || !Array.isArray(j.edges_vertices)) throw new Error("not a FOLD file");
  return {
    vertices_coords: j.vertices_coords.map((p: number[]) => [p[0], p[1]]),
    edges_vertices: j.edges_vertices,
    edges_assignment: j.edges_assignment ?? j.edges_vertices.map(() => "F"),
    faces_vertices: j.faces_vertices ?? [],
  };
}

const slug = (s: string) =>
  s
    .toLowerCase()
    .replace(/[^a-z0-9]+/g, "-")
    .replace(/^-|-$/g, "") || "pattern";
