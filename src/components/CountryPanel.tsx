import { useEffect, useRef } from "react";
import type { MapLabels, Author } from "~/lib/map-state";

interface Props {
  countryName: string;
  authors: ReadonlyArray<Author>;
  labels: MapLabels;
  onClose: () => void;
}

export default function CountryPanel({
  countryName,
  authors,
  labels,
  onClose,
}: Props) {
  const closeButtonRef = useRef<HTMLButtonElement | null>(null);

  // Esc closes; focus the close button on open for keyboard accessibility.
  useEffect(() => {
    const handler = (e: KeyboardEvent) => {
      if (e.key === "Escape") onClose();
    };
    document.addEventListener("keydown", handler);
    closeButtonRef.current?.focus();
    return () => document.removeEventListener("keydown", handler);
  }, [onClose]);

  return (
    <>
      <button
        type="button"
        aria-label={labels.panel.close}
        onClick={onClose}
        className="fixed inset-0 z-40 bg-ink/30 md:bg-ink/15 transition-opacity"
      />

      <aside
        role="dialog"
        aria-label={countryName}
        aria-modal="true"
        className="
          fixed z-50 bg-bone border border-ink/10 shadow-2xl overflow-y-auto
          inset-x-0 bottom-0 max-h-[80vh] rounded-t-2xl
          md:inset-y-0 md:right-0 md:left-auto md:bottom-auto
          md:w-[420px] md:max-h-none md:rounded-none md:border-l
        "
      >
        <header className="sticky top-0 bg-bone/95 backdrop-blur border-b border-ink/10 px-6 py-4 flex items-center justify-between">
          <h2 className="font-display text-2xl font-semibold text-ink tracking-tight">
            {countryName}
          </h2>
          <button
            ref={closeButtonRef}
            type="button"
            aria-label={labels.panel.close}
            onClick={onClose}
            className="rounded-full p-2 -mr-2 text-ink/60 hover:text-oxblood hover:bg-ink/5 transition-colors"
          >
            <svg
              width="20"
              height="20"
              viewBox="0 0 24 24"
              fill="none"
              stroke="currentColor"
              strokeWidth="2"
              strokeLinecap="round"
              strokeLinejoin="round"
              aria-hidden="true"
            >
              <line x1="18" y1="6" x2="6" y2="18" />
              <line x1="6" y1="6" x2="18" y2="18" />
            </svg>
          </button>
        </header>

        <div className="px-6 py-5 space-y-6">
          {authors.length === 0 ? (
            <p className="text-sm text-ink/70 font-body italic">
              {labels.panel.empty}
            </p>
          ) : (
            authors.map((author) => (
              <article
                key={author.id}
                className="space-y-2 border-b border-ink/5 pb-5 last:border-none last:pb-0"
              >
                <div className="flex items-baseline justify-between gap-3">
                  <h3 className="font-display text-lg font-semibold text-ink leading-snug">
                    {author.name}
                  </h3>
                  <StatusBadge status={author.status} labels={labels.status} />
                </div>

                {(author.birth_year || author.death_year) && (
                  <p className="text-xs text-ink/55 font-body">
                    {author.birth_year ?? "?"}
                    {" – "}
                    {author.death_year ?? ""}
                  </p>
                )}

                {author.books.length > 0 && (
                  <ul className="mt-2 space-y-1 text-sm text-ink/80 font-body">
                    {author.books.map((book, i) => (
                      <li key={i} className="flex items-baseline gap-2">
                        <span className="text-ochre">·</span>
                        <span>
                          <em className="not-italic font-medium">
                            {book.title}
                          </em>
                          {book.year && (
                            <span className="text-ink/50"> · {book.year}</span>
                          )}
                        </span>
                      </li>
                    ))}
                  </ul>
                )}
              </article>
            ))
          )}
        </div>
      </aside>
    </>
  );
}

function StatusBadge({
  status,
  labels,
}: {
  status: Author["status"];
  labels: MapLabels["status"];
}) {
  // Mirrors the map encoding: read = penguin, currently_reading = sage,
  // discovery = oxblood. Keeps the panel visually in sync with the country
  // fill the user just clicked.
  const palette =
    status === "read"
      ? "bg-penguin/15 text-penguin"
      : status === "currently_reading"
        ? "bg-sage/15 text-sage"
        : "bg-oxblood/10 text-oxblood";
  const label =
    status === "read"
      ? labels.read
      : status === "currently_reading"
        ? labels.currently_reading
        : labels.discovery;
  return (
    <span
      className={
        "inline-flex items-center rounded-full px-2 py-0.5 text-[10px] uppercase tracking-wider font-medium font-body shrink-0 " +
        palette
      }
    >
      {label}
    </span>
  );
}
