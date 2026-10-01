export type Assignment = "M" | "V" | "B" | "F" | "C" | "U";
export type P2 = [number, number];

export interface Fold {
  vertices_coords: P2[];
  edges_vertices: [number, number][];
  edges_assignment: Assignment[];
  faces_vertices: number[][];
}

export interface Category {
  id: string;
  title: string;
  description: string;
  icon: string;
  count: number;
}

export interface PaperSpec {
  width: number;
  height: number;
  start: "colour_up" | "white_up";
}

export interface TutorialSummary {
  id: string;
  title: string;
  category: string;
  level: number;
  minutes: number;
  paper: PaperSpec;
  thumbnail_svg: string;
  tags: string[];
  steps?: number;
}

export interface PieceState {
  id: number;
  poly: P2[];
  layer: number;
  face_up: boolean;
  moving?: boolean;
}

export interface Crease {
  a: P2;
  b: P2;
  assignment: "M" | "V";
}

export interface FaceNode {
  face: number;
  parent: number;
  hinge_edge: number;
  sign: number;
}

export interface FaceTree {
  root: number;
  nodes: FaceNode[];
}

export type StepOp = "fold" | "crease" | "turn_over" | "rotate" | "unfold" | "collapse" | "shape";

export interface CompiledStep {
  index: number;
  title: string;
  op: StepOp;
  instruction: string;
  tips: string[];
  mistakes: string[];
  symbol: string;
  check: string | null;
  axis: { p: P2; d: P2 } | null;
  direction: 1 | -1 | 0;
  pieces_before: PieceState[];
  state_after: PieceState[];
  creases_so_far: Crease[];
  is_shaping: boolean;
  rotate_deg?: number;
  center?: P2;
  approx_layers?: boolean;
  collapse?: { fold: Fold; face_tree: FaceTree };
  note?: string;
}

export interface Tutorial extends Omit<TutorialSummary, "steps"> {
  description: string;
  steps: CompiledStep[];
  final_svg: string;
}

export interface Level {
  level: number;
  title: string;
  description: string;
  tutorial_ids: string[];
  locked: boolean;
}

export interface Rule {
  id: string;
  title: string;
  statement: string;
  why: string;
  example: string;
  details: string[];
  exceptions: { title: string; text: string }[];
  checkable: boolean;
  demo_fold?: Fold;
}

export interface RuleCheck {
  rule_id: string;
  ok: boolean;
  skipped: boolean;
  vertices: number[];
  points: P2[];
  message: string;
}

export interface CheckResult {
  ok: boolean;
  checks: RuleCheck[];
  fold: Fold;
  interior_vertices: number;
}

export interface PreviewResult {
  face_tree: FaceTree;
  folded_coords: P2[];
  faces: number[][];
  difficulty: { score: number; label: string };
  fold: Fold;
}

export interface ProgressItem {
  tutorial_id: string;
  step_index: number;
  completed: boolean;
  updated_at: string;
}

export interface Progress {
  user_id: string;
  items: ProgressItem[];
  xp: number;
  completed: string[];
}

export interface PatternSummary {
  id: number;
  title: string;
  created_at: string;
}

export interface Answer {
  text: string;
  source: "gemini" | "template";
}

export interface Exceptions {
  allow_cuts: boolean;
  non_flat: boolean;
  curved: boolean;
}
