import type {
  Answer,
  Category,
  CheckResult,
  Exceptions,
  Fold,
  Level,
  PatternSummary,
  PreviewResult,
  Progress,
  Rule,
  Tutorial,
  TutorialSummary,
} from "./types";
import { useServer } from "./store";
import mockCategories from "./mock/categories.json";
import mockTutorials from "./mock/tutorials.json";
import mockLevels from "./mock/levels.json";
import mockRules from "./mock/rules.json";

// VITE_API_URL: unset → built-in mocks; "/" → same origin (Vercel, Vite proxy); otherwise a full URL.
const RAW = (import.meta.env.VITE_API_URL as string | undefined)?.trim() ?? "";
const BASE = RAW.replace(/\/$/, "");
export const usingMocks = RAW === "";

const mockTutorialFiles = import.meta.glob("./mock/tutorial-*.json", { import: "default" });

export class ApiError extends Error {
  constructor(message: string, public status: number) {
    super(message);
  }
}

/** fetch with a "waking server…" signal for cold starts; marks the server down on network errors. */
async function request<T>(path: string, init?: RequestInit, timeoutMs = 60000): Promise<T> {
  const ctrl = new AbortController();
  const timer = setTimeout(() => ctrl.abort(), timeoutMs);
  const waking = setTimeout(() => useServer.getState().setStatus("waking"), 2500);
  try {
    const r = await fetch(`${BASE}${path}`, { ...init, signal: ctrl.signal });
    useServer.getState().setStatus("ok");
    if (!r.ok) {
      let detail = `${r.status}`;
      try {
        const j = await r.json();
        detail = typeof j.detail === "string" ? j.detail : JSON.stringify(j.detail ?? j);
      } catch {
        /* keep the status code */
      }
      throw new ApiError(detail, r.status);
    }
    return (await r.json()) as T;
  } catch (e) {
    if (!(e instanceof ApiError)) useServer.getState().setStatus("down");
    throw e;
  } finally {
    clearTimeout(timer);
    clearTimeout(waking);
  }
}

const json = (body: unknown): RequestInit => ({
  method: "POST",
  headers: { "Content-Type": "application/json" },
  body: JSON.stringify(body),
});

const offline = (e: unknown) => !(e instanceof ApiError);

/** Use the API, falling back to bundled mock data when it is unset or unreachable. */
async function withMock<T>(path: string, mock: () => T | Promise<T>): Promise<T> {
  if (usingMocks) return mock();
  try {
    return await request<T>(path);
  } catch (e) {
    if (offline(e)) return mock();
    throw e;
  }
}

function filterMock(category?: string, level?: number, q?: string): TutorialSummary[] {
  const ql = q?.toLowerCase();
  return (mockTutorials as TutorialSummary[]).filter(
    (t) =>
      (!category || t.category === category) &&
      (!level || t.level === level) &&
      (!ql || t.title.toLowerCase().includes(ql) || t.tags.some((g) => g.includes(ql)) || t.category.includes(ql)),
  );
}

async function mockTutorial(id: string): Promise<Tutorial> {
  const loader = mockTutorialFiles[`./mock/tutorial-${id}.json`];
  if (!loader) throw new ApiError(`unknown tutorial '${id}'`, 404);
  return (await loader()) as Tutorial;
}

export const api = {
  categories: () => withMock<Category[]>("/api/categories", () => mockCategories as Category[]),

  tutorials: (category?: string, level?: number, q?: string) => {
    const params = new URLSearchParams();
    if (category) params.set("category", category);
    if (level) params.set("level", String(level));
    if (q) params.set("q", q);
    const qs = params.toString();
    return withMock<TutorialSummary[]>(`/api/tutorials${qs ? `?${qs}` : ""}`, () => filterMock(category, level, q));
  },

  tutorial: (id: string) => withMock<Tutorial>(`/api/tutorials/${encodeURIComponent(id)}`, () => mockTutorial(id)),

  levels: (userId?: string | null) =>
    withMock<Level[]>(`/api/levels${userId ? `?user_id=${encodeURIComponent(userId)}` : ""}`, () =>
      (mockLevels as Level[]).map((l) => ({ ...l, locked: false })),
    ),

  rules: () => withMock<Rule[]>("/api/rules", () => mockRules as unknown as Rule[]),

  createUser: (name: string) => request<{ user_id: string; name: string }>("/api/users", json({ name })),

  progress: (userId: string) => request<Progress>(`/api/progress?user_id=${encodeURIComponent(userId)}`),

  saveProgress: (userId: string, tutorialId: string, stepIndex: number, completed: boolean) =>
    request<Progress>(
      "/api/progress",
      json({ user_id: userId, tutorial_id: tutorialId, step_index: stepIndex, completed }),
    ),

  check: (fold: Fold, exceptions: Exceptions) => request<CheckResult>("/api/studio/check", json({ fold, exceptions })),

  preview: (fold: Fold) => request<PreviewResult>("/api/studio/preview", json({ fold })),

  savePattern: (title: string, fold: Fold, userId?: string | null) =>
    request<{ id: number }>("/api/patterns", json({ title, fold, user_id: userId ?? null })),

  patterns: (userId: string) => request<PatternSummary[]>(`/api/patterns?user_id=${encodeURIComponent(userId)}`),

  pattern: (id: number | string) =>
    request<{ id: number; title: string; fold: Fold }>(`/api/patterns/${encodeURIComponent(String(id))}`),

  ask: async (tutorial: Tutorial, stepIndex: number, question?: string): Promise<Answer> => {
    const step = tutorial.steps[stepIndex];
    const fallback = (): Answer => ({
      text: [
        step.instruction,
        step.tips[0] && `Tip: ${step.tips[0]}`,
        step.mistakes[0] && `Watch out for this: ${step.mistakes[0]}`,
      ]
        .filter(Boolean)
        .join(" "),
      source: "template",
    });
    if (usingMocks) return fallback();
    try {
      return await request<Answer>("/api/ask", json({ tutorial_id: tutorial.id, step_index: stepIndex, question }));
    } catch {
      return fallback();
    }
  },
};
