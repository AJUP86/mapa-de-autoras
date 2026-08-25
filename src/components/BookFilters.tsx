// BookFilters.tsx — Stage 8.5 task 14
//
// Shared filter bar for the book tables (admin editor + public catalog).
// Presentational only: it owns no state, just renders the three controls
// and calls back on change. The single filter-bar implementation both the
// admin BookStatusEditor and the public BookList render.

interface BookFiltersLabels {
  filter_author_placeholder: string;
  filter_country_all: string;
  filter_year_all: string;
}

interface Props {
  author: string;
  country: string;
  year: string;
  onAuthor: (v: string) => void;
  onCountry: (v: string) => void;
  onYear: (v: string) => void;
  countryOptions: { code: string; name: string }[];
  yearOptions: number[];
  labels: BookFiltersLabels;
}

export default function BookFilters({
  author,
  country,
  year,
  onAuthor,
  onCountry,
  onYear,
  countryOptions,
  yearOptions,
  labels,
}: Props) {
  return (
    <div className="mb-4 flex flex-wrap items-center gap-3 text-sm">
      <input
        type="text"
        value={author}
        onChange={(e) => onAuthor(e.target.value)}
        placeholder={labels.filter_author_placeholder}
        className="rounded border border-ink/20 bg-parchment px-3 py-1.5"
      />
      <select
        value={country}
        onChange={(e) => onCountry(e.target.value)}
        className="rounded border border-ink/20 bg-parchment px-2 py-1.5 text-ink"
      >
        <option value="">{labels.filter_country_all}</option>
        {countryOptions.map((c) => (
          <option key={c.code} value={c.code}>
            {c.name}
          </option>
        ))}
      </select>
      <select
        value={year}
        onChange={(e) => onYear(e.target.value)}
        className="rounded border border-ink/20 bg-parchment px-2 py-1.5 text-ink"
      >
        <option value="">{labels.filter_year_all}</option>
        {yearOptions.map((y) => (
          <option key={y} value={String(y)}>
            {y}
          </option>
        ))}
      </select>
    </div>
  );
}
