// icons.tsx — Stage 11. Stroke icons for the /map controls (24 × 24 grid,
// drawn in currentColor, hidden from assistive tech: the buttons carry labels).

import type { ReactNode } from "react";

function Icon({
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

export function IconClose() {
  return (
    <Icon>
      <path d="M18 6L6 18M6 6l12 12" />
    </Icon>
  );
}

export function IconPlus({ size }: { size?: number }) {
  return (
    <Icon strokeWidth={2.2} size={size}>
      <path d="M12 5v14M5 12h14" />
    </Icon>
  );
}

export function IconMinus() {
  return (
    <Icon strokeWidth={2.2}>
      <path d="M5 12h14" />
    </Icon>
  );
}

/** Re-center: a circle with four ticks (crosshair). */
export function IconLocate() {
  return (
    <Icon>
      <circle cx="12" cy="12" r="7" />
      <path d="M2 12h3M19 12h3M12 2v3M12 19v3" />
    </Icon>
  );
}

export function IconSearch() {
  return (
    <Icon>
      <circle cx="11" cy="11" r="7" />
      <path d="M20 20l-3.5-3.5" />
    </Icon>
  );
}

/** Folded map (Map | List switch). */
export function IconMap() {
  return (
    <Icon>
      <path d="M3 6.5l6-3 6 3 6-3v14l-6 3-6-3-6 3z" />
      <path d="M9 3.5v14M15 6.5v14" />
    </Icon>
  );
}

/** Bulleted list (Map | List switch). */
export function IconList() {
  return (
    <Icon>
      <path d="M9 6h12M9 12h12M9 18h12M4 6h.01M4 12h.01M4 18h.01" />
    </Icon>
  );
}

/** Chevron left (Back to the country). */
export function IconBack() {
  return (
    <Icon strokeWidth={2.2}>
      <path d="M15 18l-6-6 6-6" />
    </Icon>
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
