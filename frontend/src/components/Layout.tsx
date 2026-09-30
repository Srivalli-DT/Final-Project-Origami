import { NavLink, Outlet } from "react-router-dom";
import { useServer, useToasts } from "../store";
import { usingMocks } from "../api";

const link = ({ isActive }: { isActive: boolean }) =>
  `px-2 py-1 rounded ${isActive ? "text-accent font-medium" : "text-stone-600 hover:text-stone-900"}`;

export default function Layout() {
  const status = useServer((s) => s.status);
  const toasts = useToasts((s) => s.toasts);
  const dismiss = useToasts((s) => s.dismiss);
  return (
    <div className="min-h-screen">
      <header className="border-b border-stone-200 bg-paper/90 backdrop-blur">
        <nav className="mx-auto flex max-w-6xl flex-wrap items-center gap-2 px-4 py-3">
          <NavLink to="/" className="mr-4 flex items-center gap-2 font-serif text-xl">
            <img src="/favicon.svg" alt="" className="h-6 w-6" />
            CreaseLens
          </NavLink>
          <NavLink to="/" end className={link}>
            Learn
          </NavLink>
          <NavLink to="/upload" className={link}>
            Upload
          </NavLink>
          <NavLink to="/about" className={link}>
            How it works
          </NavLink>
          {usingMocks && (
            <span className="ml-auto rounded bg-stone-200 px-2 py-0.5 text-xs text-stone-600">demo data</span>
          )}
        </nav>
      </header>
      {status === "waking" && (
        <div className="bg-amber-100 px-4 py-2 text-center text-sm text-amber-900">
          Waking up the server… the first request after a quiet spell takes a few seconds.
        </div>
      )}
      {status === "down" && (
        <div className="bg-stone-200 px-4 py-2 text-center text-sm text-stone-700">
          The server is unreachable — showing the built-in library only.
        </div>
      )}
      <Outlet />
      <div className="fixed bottom-4 right-4 z-50 flex flex-col gap-2">
        {toasts.map((t) => (
          <button
            key={t.id}
            onClick={() => dismiss(t.id)}
            className={`max-w-sm rounded-lg px-4 py-2 text-left text-sm shadow-lg ${
              t.kind === "error" ? "bg-rose-700 text-white" : "bg-stone-800 text-white"
            }`}
          >
            {t.text}
          </button>
        ))}
      </div>
    </div>
  );
}
