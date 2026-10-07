// icons.tsx — Stage 11. Stroke icons for the /map controls, drawn with the
// shared Icon base (24 × 24 grid, currentColor, hidden from assistive tech:
// the buttons carry labels).

import { Icon } from "../icons";

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
