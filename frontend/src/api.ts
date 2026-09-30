const BASE = (import.meta.env.VITE_API_URL as string | undefined)?.replace(/\/$/, "") || "";

export const usingMocks = !BASE;

export async function getHealth(): Promise<{ status: string; source: "api" | "mock" }> {
  if (usingMocks) return { status: "ok", source: "mock" };
  const r = await fetch(`${BASE}/health`);
  if (!r.ok) throw new Error(`health ${r.status}`);
  const j = await r.json();
  return { status: j.status, source: "api" };
}
