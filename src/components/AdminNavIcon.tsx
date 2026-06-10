// AdminNavIcon.tsx — Stage 7b-i
//
// Icon-only button with a hover/focus tooltip. Used by AdminAwareNav for
// the inbox / + / logout actions. Inline SVG children keep us free of
// external icon dependencies.

import type { ReactNode } from "react";

interface Props {
  label: string;
  href?: string;
  onClick?: () => void;
  badge?: number;
  children: ReactNode;
}

export default function AdminNavIcon({
  label,
  href,
  onClick,
  badge,
  children,
}: Props) {
  const inner = (
    <>
      <span className="sr-only">{label}</span>
      <span aria-hidden className="block h-5 w-5 text-ink">
        {children}
      </span>
      {badge && badge > 0 ? (
        <span
          aria-hidden
          className="absolute -top-1 -right-1 min-w-[18px] h-[18px] rounded-full bg-oxblood px-1 text-[10px] font-medium text-parchment leading-[18px] text-center"
        >
          {badge > 99 ? "99+" : badge}
        </span>
      ) : null}
      <span
        role="tooltip"
        className="
          pointer-events-none absolute top-full left-1/2 mt-1 -translate-x-1/2
          whitespace-nowrap rounded bg-ink px-2 py-1 text-xs text-parchment
          opacity-0 transition-opacity group-hover:opacity-100 group-focus-within:opacity-100
        "
      >
        {label}
        {badge && badge > 0 ? ` (${badge})` : ""}
      </span>
    </>
  );

  const className =
    "group relative inline-flex items-center justify-center w-10 h-10 rounded-full hover:bg-ink/5 focus:outline-none focus:ring-2 focus:ring-oxblood/40";

  if (href) {
    return (
      <a href={href} className={className} aria-label={label}>
        {inner}
      </a>
    );
  }
  return (
    <button type="button" onClick={onClick} className={className} aria-label={label}>
      {inner}
    </button>
  );
}
