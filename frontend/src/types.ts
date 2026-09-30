export type Assignment = "M" | "V" | "B" | "F";
export type Category = "bases" | "tessellations" | "modular";

export interface Fold {
  vertices_coords: [number, number][];
  edges_vertices: [number, number][];
  edges_assignment: Assignment[];
  faces_vertices: number[][];
}

export interface Difficulty {
  score: number;
  label: "Beginner" | "Intermediate" | "Advanced";
}

export interface VertexCheck {
  vertex: number;
  ok: boolean;
  maekawa_ok: boolean;
  kawasaki_ok: boolean;
  reasons: string[];
}

export interface Step {
  index: number;
  title: string;
  kind: "reference" | "precrease" | "collapse" | "assembly";
  line: [[number, number], [number, number]] | null;
  assignment: "M" | "V" | null;
  edges: number[];
  cumulative_edges: number[];
  text: string;
}

export interface FaceNode {
  face: number;
  parent: number;
  hinge_edge: number;
  sign: number;
}

export interface Guide {
  validation: { ok: boolean; vertices: VertexCheck[] };
  difficulty: Difficulty;
  faces: number[][];
  face_tree: { root: number; nodes: FaceNode[] };
  folded_coords: [number, number][];
  steps: Step[];
}

export interface LibraryItem {
  id: string;
  title: string;
  category: Category;
  difficulty: Difficulty;
  thumbnail_svg: string;
}

export interface Model {
  id: string;
  title: string;
  category: Category;
  description: string;
  fold: Fold;
  guide: Guide;
}

export interface DetectResult {
  fold: Fold;
  overlay_png_b64: string;
  confidence: number;
  grid: number;
}

export interface Narration {
  text: string;
  source: "gemini" | "template";
}

export interface PatternSummary {
  id: number;
  title: string;
  created_at: string;
}

export interface Pattern {
  id: number;
  title: string;
  fold: Fold;
  guide: Guide;
}
