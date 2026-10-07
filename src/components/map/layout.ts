// layout.ts — Stage 11. Layout numbers the /map island needs in JS (map
// insets, desktop zoom). The same values appear as Tailwind literals in
// CountrySheet (sheet/panel size), MapControls + MapTopBar (shift left of the
// panel) and Toast (`md:`): change them together.

/** Phones are narrower than this (global constraint) — Tailwind's `md:` breakpoint. */
export const DESKTOP_MIN_WIDTH = 768;

/** Desktop side panel width — CountrySheet `md:w-[400px]`. */
export const PANEL_WIDTH = 400;

/** Margin around the side panel — CountrySheet `md:top-4 md:right-4 md:bottom-4`. */
export const PANEL_GAP = 16;

/** Screen width the open side panel covers: 432 — MapControls `md:right-[432px]`, MapTopBar `md:mr-[416px]` (+ its 16 px padding). */
export const PANEL_INSET = PANEL_WIDTH + 2 * PANEL_GAP;

/** Phone sheet height = min(56% of the height, 540 px) — CountrySheet `h-[min(56%,540px)]`. */
export const SHEET_HEIGHT_RATIO = 0.56;
export const SHEET_MAX_HEIGHT = 540;

/** Kept free at the bottom for the Map | List switch and the suggest button. */
export const BOTTOM_UI_HEIGHT = 84;

export const isDesktopWidth = (width: number) => width >= DESKTOP_MIN_WIDTH;
