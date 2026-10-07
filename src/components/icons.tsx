// icons.tsx — Stage 11. Shared stroke icons (24 × 24 grid, drawn in
// currentColor, hidden from assistive tech: the link or button carries the
// label). The /map controls build theirs on the same base (map/icons.tsx).

import type { ReactNode } from "react";

export function Icon({
  children,
  strokeWidth = 2,
  size = 18,
}: {
  children: ReactNode;
  strokeWidth?: number;
  size?: number;
}) {
  return (
    <svg
      viewBox="0 0 24 24"
      width={size}
      height={size}
      fill="none"
      stroke="currentColor"
      strokeWidth={strokeWidth}
      strokeLinecap="round"
      strokeLinejoin="round"
      aria-hidden="true"
      focusable="false"
      className="flex-none"
    >
      {children}
    </svg>
  );
}

/** Opens in a new tab (buy links). */
export function IconExternal() {
  return (
    <Icon>
      <path d="M14 4h6v6M10 14L20 4M19 14v5a1 1 0 0 1-1 1H5a1 1 0 0 1-1-1V6a1 1 0 0 1 1-1h5" />
    </Icon>
  );
}

/** Arrow right ("Abrir el mapa"). */
export function IconArrowRight() {
  return (
    <Icon>
      <path d="M5 12h14M13 6l6 6-6 6" />
    </Icon>
  );
}
