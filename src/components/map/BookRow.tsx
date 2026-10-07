// BookRow.tsx — Stage 11. One book as a tappable row: a color-block cover
// with the title's letter, the title, a secondary line and the status pill.
// Shared by the country panel and the list view of /map.

import type { Book } from "~/lib/map-state";
import BookCover from "../BookCover";
import StatusPill from "../StatusPill";

interface Props {
  book: Book;
  /** Under the title: the year in the panel, "author · year" in the list. */
  meta: string | null;
  statusLabel: string;
  /** Row color, set off from what it sits on: parchment in the bone panel, bone on the parchment list. */
  surface: "parchment" | "bone";
  /** CountrySheet focuses this row (instead of ✕) when the panel content changes: Back from its book. */
  autofocus?: boolean;
  onOpen: (bookId: string) => void;
}

export default function BookRow({ book, meta, statusLabel, surface, autofocus, onOpen }: Props) {
  return (
    <button
      type="button"
      data-autofocus={autofocus ? "" : undefined}
      onClick={() => onOpen(book.id)}
      className={`flex min-h-11 w-full items-center gap-3 rounded-xl px-2 py-2.5 text-left hover:brightness-[0.97] ${
        surface === "bone" ? "bg-bone" : "bg-parchment"
      }`}
    >
      <BookCover title={book.title} status={book.status} size="sm" />
      <span className="grid min-w-0 flex-1">
        <span className="leading-[1.3] font-semibold text-ink">{book.title}</span>
        {meta && <span className="text-[0.8rem] text-ink/60 tabular-nums">{meta}</span>}
      </span>
      <StatusPill status={book.status} label={statusLabel} />
    </button>
  );
}
