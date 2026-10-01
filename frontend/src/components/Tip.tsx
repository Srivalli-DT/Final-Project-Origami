import type { ReactNode } from "react";

/** Icon button with an accessible name and a hover/focus tooltip. */
export function IconButton({
  label,
  onClick,
  children,
  pressed,
  disabled,
  className,
  shortcut,
}: {
  label: string;
  onClick?: () => void;
  children: ReactNode;
  pressed?: boolean;
  disabled?: boolean;
  className?: string;
  shortcut?: string;
}) {
  return (
    <button
      type="button"
      aria-label={label}
      aria-pressed={pressed}
      disabled={disabled}
      onClick={onClick}
      className={`group relative icon-btn ${className ?? ""}`}
    >
      {children}
      <span
        role="tooltip"
        className="pointer-events-none absolute bottom-full left-1/2 z-50 mb-1.5 hidden -translate-x-1/2 whitespace-nowrap rounded-md border border-line bg-panel2 px-2 py-1 text-xs text-text group-hover:block group-focus-visible:block"
      >
        {label}
        {shortcut && <kbd className="mono ml-1.5 text-muted">{shortcut}</kbd>}
      </span>
    </button>
  );
}
