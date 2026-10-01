import { useEffect, useRef } from "react";

/** Global keyboard shortcuts, ignored while typing in inputs. */
export function useKeys(map: Record<string, (e: KeyboardEvent) => void>, enabled = true) {
  const ref = useRef(map);
  ref.current = map;
  useEffect(() => {
    if (!enabled) return;
    const on = (e: KeyboardEvent) => {
      const t = e.target as HTMLElement | null;
      if (t && (t.tagName === "INPUT" || t.tagName === "TEXTAREA" || t.tagName === "SELECT" || t.isContentEditable)) return;
      if (e.ctrlKey || e.metaKey || e.altKey) return;
      const key = e.key === " " ? "Space" : e.key;
      const fn = ref.current[key];
      if (fn) {
        e.preventDefault();
        fn(e);
      }
    };
    window.addEventListener("keydown", on);
    return () => window.removeEventListener("keydown", on);
  }, [enabled]);
}
