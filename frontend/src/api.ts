import type {
  DetectResult,
  Fold,
  Guide,
  LibraryItem,
  Model,
  Narration,
  Pattern,
  PatternSummary,
  Step,
} from "./types";
import { useServer } from "./store";
import mockLibrary from "./mock/library.json";

const BASE = (import.meta.env.VITE_API_URL as string | undefined)?.replace(/\/$/, "") || "";

export const usingMocks = !BASE;

const mockModels = import.meta.glob("./mock/model-*.json", { import: "default" });

/** Fetch with a "waking up server…" signal for Render cold starts. */
async function request<T>(path: string, init?: RequestInit, timeoutMs = 90000): Promise<T> {
  const ctrl = new AbortController();
  const timer = setTimeout(() => ctrl.abort(), timeoutMs);
  const waking = setTimeout(() => useServer.getState().setStatus("waking"), 3000);
  try {
    const r = await fetch(`${BASE}${path}`, { ...init, signal: ctrl.signal });
    useServer.getState().setStatus("ok");
    if (!r.ok) {
      let detail = `${r.status}`;
      try {
        const j = await r.json();
        detail = typeof j.detail === "string" ? j.detail : JSON.stringify(j.detail ?? j);
      } catch {
        /* keep status code */
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

export class ApiError extends Error {
  constructor(message: string, public status: number) {
    super(message);
  }
}

const isNetworkError = (e: unknown) => !(e instanceof ApiError);

async function mockModel(id: string): Promise<Model> {
  const loader = mockModels[`./mock/model-${id}.json`];
  if (!loader) throw new ApiError(`unknown model '${id}'`, 404);
  return (await loader()) as Model;
}

export async function getHealth(): Promise<{ status: string; source: "api" | "mock" }> {
  if (usingMocks) return { status: "ok", source: "mock" };
  const j = await request<{ status: string }>("/health");
  return { status: j.status, source: "api" };
}

export async function getLibrary(): Promise<LibraryItem[]> {
  if (usingMocks) return mockLibrary as LibraryItem[];
  try {
    return await request<LibraryItem[]>("/api/library");
  } catch (e) {
    if (isNetworkError(e)) return mockLibrary as LibraryItem[];
    throw e;
  }
}

export async function getModel(id: string): Promise<Model> {
  if (usingMocks) return mockModel(id);
  try {
    return await request<Model>(`/api/library/${encodeURIComponent(id)}`);
  } catch (e) {
    if (isNetworkError(e)) return mockModel(id);
    throw e;
  }
}

function requireApi(what: string) {
  if (usingMocks) {
    throw new ApiError(`${what} needs the backend (set VITE_API_URL).`, 0);
  }
}

export async function detect(image: Blob): Promise<DetectResult> {
  requireApi("Detection");
  const body = new FormData();
  body.append("image", image, "upload.png");
  return request<DetectResult>("/api/detect", { method: "POST", body });
}

export async function makeGuide(fold: Fold): Promise<Guide & { fold?: Fold }> {
  requireApi("Guide generation");
  return request("/api/guide", {
    method: "POST",
    headers: { "Content-Type": "application/json" },
    body: JSON.stringify({ fold }),
  });
}

export async function narrate(step: Step, mode: "normal" | "simpler"): Promise<Narration> {
  const fallback = (): Narration => ({
    text:
      mode === "simpler"
        ? `${step.text} Take it slowly: line the edges up exactly before you press the crease flat.`
        : step.text,
    source: "template",
  });
  if (usingMocks) return fallback();
  try {
    return await request<Narration>("/api/narrate", {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({ step, mode }),
    });
  } catch {
    return fallback();
  }
}

export async function savePattern(title: string, fold: Fold): Promise<{ id: number }> {
  requireApi("Saving");
  return request("/api/patterns", {
    method: "POST",
    headers: { "Content-Type": "application/json" },
    body: JSON.stringify({ title, fold }),
  });
}

export async function listPatterns(): Promise<PatternSummary[]> {
  if (usingMocks) return [];
  return request<PatternSummary[]>("/api/patterns");
}

export async function getPattern(id: number | string): Promise<Pattern> {
  requireApi("Loading patterns");
  return request<Pattern>(`/api/patterns/${id}`);
}
