// icons.tsx — Stage 11. Stroke icons for the /map controls (24 × 24 grid,
// drawn in currentColor, hidden from assistive tech: the buttons carry labels).

import type { ReactNode } from "react";

function Icon({ children, strokeWidth = 2 }: { children: ReactNode; strokeWidth?: number }) {
  return (
    <svg
      viewBox="0 0 24 24"
      width="18"
      height="18"
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

export function IconPlus() {
  return (
    <Icon strokeWidth={2.2}>
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
