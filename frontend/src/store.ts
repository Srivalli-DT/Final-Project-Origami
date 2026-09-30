import { create } from "zustand";
import type { Fold, Guide } from "./types";

interface UploadState {
  title: string;
  fold: Fold | null;
  guide: Guide | null;
  setGuide: (title: string, fold: Fold, guide: Guide) => void;
}

export const useUpload = create<UploadState>((set) => ({
  title: "My crease pattern",
  fold: null,
  guide: null,
  setGuide: (title, fold, guide) => set({ title, fold, guide }),
}));

type ServerStatus = "ok" | "waking" | "down";

interface ServerState {
  status: ServerStatus;
  setStatus: (s: ServerStatus) => void;
}

export const useServer = create<ServerState>((set) => ({
  status: "ok",
  setStatus: (status) => set({ status }),
}));

interface Toast {
  id: number;
  text: string;
  kind: "error" | "info";
}

interface ToastState {
  toasts: Toast[];
  push: (text: string, kind?: Toast["kind"]) => void;
  dismiss: (id: number) => void;
}

let toastId = 0;
export const useToasts = create<ToastState>((set) => ({
  toasts: [],
  push: (text, kind = "error") => {
    const id = ++toastId;
    set((s) => ({ toasts: [...s.toasts, { id, text, kind }] }));
    setTimeout(() => set((s) => ({ toasts: s.toasts.filter((t) => t.id !== id) })), 5000);
  },
  dismiss: (id) => set((s) => ({ toasts: s.toasts.filter((t) => t.id !== id) })),
}));
