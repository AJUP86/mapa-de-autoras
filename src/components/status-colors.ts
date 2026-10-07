// status-colors.ts — Stage 11. Solid book-status colors (cover blocks, chip
// dots) from the state aliases in tokens.css. Kept out of StatusPill.tsx so
// that module only exports a component (React Fast Refresh).

import type { BookStatus } from "~/lib/map-state";

export const STATUS_FILL: Record<BookStatus, string> = {
  read: "bg-[var(--c-state-read)]",
  reading: "bg-[var(--c-state-reading)]",
  to_read: "bg-[var(--c-state-to-read)]",
};
