import { create } from "zustand";
import type { Fold, Progress } from "./types";

type ServerStatus = "ok" | "waking" | "down";

export const useServer = create<{ status: ServerStatus; setStatus: (s: ServerStatus) => void }>((set) => ({
  status: "ok",
  setStatus: (status) => set({ status }),
}));

interface Toast {
  id: number;
  text: string;
  kind: "error" | "info";
}

let toastId = 0;
export const useToasts = create<{
  toasts: Toast[];
  push: (text: string, kind?: Toast["kind"]) => void;
  dismiss: (id: number) => void;
}>((set) => ({
  toasts: [],
  push: (text, kind = "error") => {
    const id = ++toastId;
    set((s) => ({ toasts: [...s.toasts, { id, text, kind }] }));
    setTimeout(() => set((s) => ({ toasts: s.toasts.filter((t) => t.id !== id) })), 5000);
  },
  dismiss: (id) => set((s) => ({ toasts: s.toasts.filter((t) => t.id !== id) })),
}));

// ------------------------------------------------------------------ user + progress

const LS_USER = "creaselens.user";

function readUser(): { id: string; name: string } | null {
  try {
    const raw = localStorage.getItem(LS_USER);
    return raw ? JSON.parse(raw) : null;
  } catch {
    return null;
  }
}

interface UserState {
  userId: string | null;
  name: string | null;
  progress: Progress | null;
  setUser: (id: string, name: string) => void;
  setProgress: (p: Progress) => void;
  signOut: () => void;
}

const initial = readUser();

export const useUser = create<UserState>((set) => ({
  userId: initial?.id ?? null,
  name: initial?.name ?? null,
  progress: null,
  setUser: (id, name) => {
    try {
      localStorage.setItem(LS_USER, JSON.stringify({ id, name }));
    } catch {
      /* storage unavailable: keep it in memory */
    }
    set({ userId: id, name });
  },
  setProgress: (progress) => set({ progress }),
  signOut: () => {
    try {
      localStorage.removeItem(LS_USER);
    } catch {
      /* ignore */
    }
    set({ userId: null, name: null, progress: null });
  },
}));

/** Level number from XP: every 200 XP is one level (1-based). */
export const xpLevel = (xp: number) => 1 + Math.floor(xp / 200);

// ------------------------------------------------------------------ studio hand-off

/** A crease pattern queued to open in the Studio (from a tutorial, rule demo or saved pattern). */
export const useStudioInbox = create<{ fold: Fold | null; title: string; send: (fold: Fold, title: string) => void; take: () => { fold: Fold; title: string } | null }>(
  (set, get) => ({
    fold: null,
    title: "",
    send: (fold, title) => set({ fold, title }),
    take: () => {
      const { fold, title } = get();
      if (!fold) return null;
      set({ fold: null, title: "" });
      return { fold, title };
    },
  }),
);
