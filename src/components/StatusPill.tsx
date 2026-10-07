// StatusPill.tsx — Stage 11. The book-status badge, shared by the map panel
// and (later) the list and book views. Same encoding as the map: read =
// penguin, reading = sage, to_read = oxblood. Text uses the darker line
// colors so it stays ≥ 4.5:1 on the light tints.

import type { BookStatus } from "~/lib/map-state";

const TINT: Record<BookStatus, string> = {
  read: "bg-penguin/15 text-penguin-line",
  reading: "bg-sage/15 text-sage-line",
  to_read: "bg-oxblood/10 text-oxblood",
};

export default function StatusPill({ status, label }: { status: BookStatus; label: string }) {
  return (
    <span
      className={`inline-flex shrink-0 items-center whitespace-nowrap rounded-full px-2 py-0.5 font-body text-[10px] font-medium uppercase tracking-wider ${TINT[status]}`}
    >
      {label}
    </span>
  );
}
