// VITE_API_URL: unset → built-in mocks; "/" → same origin (Vercel, Vite proxy); otherwise a full URL.
const RAW = (import.meta.env.VITE_API_URL as string | undefined)?.trim() ?? "";
export const BASE = RAW.replace(/\/$/, "");
export const usingMocks = RAW === "";
