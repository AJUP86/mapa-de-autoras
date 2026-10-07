// BookRow.tsx — Stage 11. One book as a tappable row: a color-block cover
// with the title's letter, the title, a secondary line and the status pill.
// Shared by the country panel and the list view of /map.

import type { Book } from "~/lib/map-state";
import { coverLetter } from "~/lib/panel-format";
import StatusPill from "../StatusPill";
import { STATUS_FILL } from "../status-colors";

interface Props {
  book: Book;
  /** Under the title: the year in the panel, "author · year" in the list. */
  meta: string | null;
  statusLabel: string;
  /** Row color, set off from what it sits on: parchment in the bone panel, bone on the parchment list. */
  surface: "parchment" | "bone";
  onOpen: (bookId: string) => void;
}

export default function BookRow({ book, meta, statusLabel, surface, onOpen }: Props) {
  return (
    <button
      type="button"
      onClick={() => onOpen(book.id)}
      className={`flex min-h-11 w-full items-center gap-3 rounded-xl px-2 py-2.5 text-left hover:brightness-[0.97] ${
        surface === "bone" ? "bg-bone" : "bg-parchment"
      }`}
    >
      <span
        aria-hidden="true"
        className={`grid h-[42px] w-[30px] flex-none place-items-center rounded-[2px_6px_6px_2px] font-display text-[0.95rem] font-semibold text-bone shadow-[inset_4px_0_0_var(--c-shadow)] ${STATUS_FILL[book.status]}`}
      >
        {coverLetter(book.title)}
      </span>
      <span className="grid min-w-0 flex-1">
        <span className="leading-[1.3] font-semibold text-ink">{book.title}</span>
        {meta && <span className="text-[0.8rem] text-ink/60 tabular-nums">{meta}</span>}
      </span>
      <StatusPill status={book.status} label={statusLabel} />
    </button>
  );
}
