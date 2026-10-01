import { useEffect, useState } from "react";
import { NavLink, Outlet, useNavigate, useSearchParams } from "react-router-dom";
import { BookOpenCheck, GraduationCap, Keyboard, LibraryBig, PenTool, Search, Sparkles, User, X } from "lucide-react";
import { api, usingMocks } from "../api";
import { useServer, useToasts, useUser, xpLevel } from "../store";
import { useKeys } from "../hooks/useKeys";

const NAV = [
  { to: "/", label: "School", icon: GraduationCap, end: true },
  { to: "/library", label: "Library", icon: LibraryBig },
  { to: "/studio", label: "Studio", icon: PenTool },
  { to: "/rules", label: "Rules", icon: BookOpenCheck },
  { to: "/me", label: "Profile", icon: User },
];

export const SHORTCUTS: [string, string][] = [
  ["← / →", "Previous / next step"],
  ["Space", "Play / pause"],
  ["[ / ]", "Fold % −5 / +5"],
  ["1 – 6", "Studio tools"],
  ["Ctrl+Z / Ctrl+Y", "Studio undo / redo"],
  ["?", "Show shortcuts"],
];

function Rail() {
  return (
    <nav aria-label="Main" className="flex shrink-0 flex-col items-center gap-1 border-r border-line bg-panel py-3 max-sm:fixed max-sm:inset-x-0 max-sm:bottom-0 max-sm:z-40 max-sm:flex-row max-sm:justify-around max-sm:border-r-0 max-sm:border-t max-sm:py-1.5 sm:w-16">
      <NavLink to="/" className="mb-3 hidden sm:block" aria-label="CreaseLens home">
        <img src="/favicon.svg" alt="" className="h-8 w-8" />
      </NavLink>
      {NAV.map(({ to, label, icon: I, end }) => (
        <NavLink
          key={to}
          to={to}
          end={end}
          aria-label={label}
          className={({ isActive }) =>
            `group relative flex h-11 w-11 items-center justify-center rounded-lg transition-colors ${
              isActive ? "bg-panel2 text-accent" : "text-muted hover:bg-panel2 hover:text-text"
            }`
          }
        >
          <I className="h-5 w-5" aria-hidden />
          <span
            role="tooltip"
            className="pointer-events-none absolute left-full z-50 ml-2 hidden whitespace-nowrap rounded-md border border-line bg-panel2 px-2 py-1 text-xs text-text sm:group-hover:block sm:group-focus-visible:block"
          >
            {label}
          </span>
        </NavLink>
      ))}
    </nav>
  );
}

function TopBar({ onShortcuts }: { onShortcuts: () => void }) {
  const navigate = useNavigate();
  const [params] = useSearchParams();
  const [q, setQ] = useState(params.get("q") ?? "");
  const { progress, name } = useUser();
  const xp = progress?.xp ?? 0;
  return (
    <header className="flex h-14 shrink-0 items-center gap-3 border-b border-line bg-panel px-3 sm:px-4">
      <form
        role="search"
        className="relative flex-1 sm:max-w-sm"
        onSubmit={(e) => {
          e.preventDefault();
          navigate(`/library${q.trim() ? `?q=${encodeURIComponent(q.trim())}` : ""}`);
        }}
      >
        <Search className="pointer-events-none absolute left-2.5 top-1/2 h-4 w-4 -translate-y-1/2 text-muted" aria-hidden />
        <input
          value={q}
          onChange={(e) => setQ(e.target.value)}
          placeholder="Search tutorials"
          aria-label="Search tutorials"
          className="h-9 w-full rounded-lg border border-line bg-panel2 pl-8 pr-3 text-sm placeholder:text-muted focus:border-accent"
        />
      </form>
      <div className="ml-auto flex items-center gap-2">
        <span
          className="mono inline-flex h-9 items-center gap-1.5 rounded-lg border border-line bg-panel2 px-2.5 text-sm"
          title={name ? `${name}: level ${xpLevel(xp)}` : "Level"}
          aria-label={`Level ${xpLevel(xp)}`}
        >
          <span className="text-muted">Lv</span>
          <span className="text-accent">{xpLevel(xp)}</span>
        </span>
        <span
          className="mono inline-flex h-9 items-center gap-1.5 rounded-lg border border-line bg-panel2 px-2.5 text-sm"
          aria-label={`${xp} XP`}
        >
          <Sparkles className="h-4 w-4 text-accent" aria-hidden />
          {xp}
        </span>
        <button type="button" className="icon-btn hidden sm:inline-flex" aria-label="Keyboard shortcuts" onClick={onShortcuts}>
          <Keyboard className="h-4 w-4" aria-hidden />
        </button>
      </div>
    </header>
  );
}

function ShortcutsOverlay({ onClose }: { onClose: () => void }) {
  useKeys({ Escape: onClose, "?": onClose });
  return (
    <div className="fixed inset-0 z-[90] flex items-center justify-center bg-black/60 p-4" onClick={onClose}>
      <div
        role="dialog"
        aria-modal="true"
        aria-labelledby="shortcuts-title"
        className="panel w-full max-w-sm p-4"
        onClick={(e) => e.stopPropagation()}
      >
        <div className="flex items-center">
          <h2 id="shortcuts-title" className="text-lg font-semibold">
            Shortcuts
          </h2>
          <button type="button" className="icon-btn ml-auto" aria-label="Close" onClick={onClose} autoFocus>
            <X className="h-4 w-4" aria-hidden />
          </button>
        </div>
        <dl className="mt-3 grid grid-cols-[auto_1fr] gap-x-4 gap-y-2 text-sm">
          {SHORTCUTS.map(([k, v]) => (
            <div key={k} className="contents">
              <dt>
                <kbd className="mono rounded border border-line bg-panel2 px-1.5 py-0.5 text-accent">{k}</kbd>
              </dt>
              <dd className="text-muted">{v}</dd>
            </div>
          ))}
        </dl>
      </div>
    </div>
  );
}

function WelcomeDialog() {
  const setUser = useUser((s) => s.setUser);
  const toast = useToasts((s) => s.push);
  const [name, setName] = useState("");
  const [busy, setBusy] = useState(false);
  const [dismissed, setDismissed] = useState(false);
  if (dismissed) return null;
  const submit = async () => {
    const n = name.trim();
    if (!n) return;
    setBusy(true);
    try {
      const u = await api.createUser(n);
      setUser(u.user_id, u.name);
    } catch {
      toast("Could not reach the server; progress will not be saved.");
      setDismissed(true);
    } finally {
      setBusy(false);
    }
  };
  return (
    <div className="fixed inset-0 z-[80] flex items-center justify-center bg-black/60 p-4">
      <form
        role="dialog"
        aria-modal="true"
        aria-labelledby="welcome-title"
        className="panel w-full max-w-sm p-5"
        onSubmit={(e) => {
          e.preventDefault();
          submit();
        }}
      >
        <h2 id="welcome-title" className="text-lg font-semibold">
          Welcome
        </h2>
        <label htmlFor="welcome-name" className="mt-2 block text-sm text-muted">
          Your name (for progress)
        </label>
        <input
          id="welcome-name"
          autoFocus
          maxLength={40}
          value={name}
          onChange={(e) => setName(e.target.value)}
          className="mt-1 h-10 w-full rounded-lg border border-line bg-panel2 px-3 focus:border-accent"
        />
        <div className="mt-4 flex gap-2">
          <button type="submit" className="btn-accent flex-1" disabled={!name.trim() || busy}>
            Start
          </button>
          <button type="button" className="icon-btn px-3 text-sm" onClick={() => setDismissed(true)}>
            Skip
          </button>
        </div>
      </form>
    </div>
  );
}

export default function Layout() {
  const status = useServer((s) => s.status);
  const toasts = useToasts((s) => s.toasts);
  const dismiss = useToasts((s) => s.dismiss);
  const { userId, setProgress } = useUser();
  const [shortcuts, setShortcuts] = useState(false);
  useKeys({ "?": () => setShortcuts((v) => !v) });

  useEffect(() => {
    if (!userId || usingMocks) return;
    api.progress(userId).then(setProgress).catch(() => undefined);
  }, [userId, setProgress]);

  return (
    <div className="flex h-dvh overflow-hidden">
      <a href="#main" className="skip-link">
        Skip to content
      </a>
      <Rail />
      <div className="flex min-w-0 flex-1 flex-col">
        <TopBar onShortcuts={() => setShortcuts(true)} />
        {status === "waking" && (
          <div role="status" className="border-b border-line bg-panel2 px-4 py-1.5 text-center text-sm text-warning">
            Waking server…
          </div>
        )}
        {status === "down" && (
          <div role="status" className="border-b border-line bg-panel2 px-4 py-1.5 text-center text-sm text-muted">
            Offline: built-in content only
          </div>
        )}
        <main id="main" tabIndex={-1} className="min-h-0 flex-1 overflow-y-auto overflow-x-hidden pb-16 focus:outline-none sm:pb-0">
          <Outlet />
        </main>
      </div>
      {shortcuts && <ShortcutsOverlay onClose={() => setShortcuts(false)} />}
      {!userId && !usingMocks && <WelcomeDialog />}
      <div aria-live="assertive" className="fixed bottom-20 right-4 z-[95] flex flex-col gap-2 sm:bottom-4">
        {toasts.map((t) => (
          <button
            key={t.id}
            type="button"
            onClick={() => dismiss(t.id)}
            className={`max-w-xs rounded-lg border px-3 py-2 text-left text-sm shadow-lg ${
              t.kind === "error" ? "border-error/50 bg-panel2 text-error" : "border-line bg-panel2 text-text"
            }`}
          >
            {t.text}
          </button>
        ))}
      </div>
    </div>
  );
}
