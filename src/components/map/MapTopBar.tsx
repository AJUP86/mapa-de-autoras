// MapTopBar.tsx — Stage 11. Top bar of /map: home button + search field at
// the top left, the language switch pinned to the top-right corner, and the
// filter chips below. Over the map it floats (the wrappers let pointer events
// through so the map stays draggable around the controls); over the list view
// it gets a solid background.

import { useId, type ReactNode, type Ref } from "react";
import { LOCALES, type Locale } from "~/i18n/locales";
import type { Filter } from "~/lib/map-state";
import { withView, type MapView } from "~/lib/map-view";
import FilterChips from "./FilterChips";
import { IconClose, IconSearch } from "./icons";
import type { MapPageLabels } from "./labels";

/** The search field; MapApp owns its state. */
export interface SearchFieldProps {
  inputRef: Ref<HTMLInputElement>;
  /** Field + dropdown: a pointerdown outside it closes the dropdown. */
  boxRef: Ref<HTMLFormElement>;
  query: string;
  placeholder: string;
  /** Map view: whether the dropdown is open (the field is a combobox). null in the list view. */
  expanded: boolean | null;
  /** id of the open dropdown, or of the list the field filters. */
  controls: string | undefined;
  onChange: (query: string) => void;
  /** The reader focused or clicked the field. */
  onOpen: () => void;
  onSubmit: () => void;
  onClear: () => void;
  /** Keyboard focus left the field and its dropdown. */
  onLeave: () => void;
}

interface Props {
  ref?: Ref<HTMLDivElement>;
  lang: Locale;
  labels: MapPageLabels;
  view: MapView;
  filter: Filter;
  onFilterChange: (filter: Filter) => void;
  /**
   * Desktop: the side panel covers the top-right corner, so the language button
   * moves left of it (`md:mr-[416px]` = PANEL_WIDTH + PANEL_GAP in layout.ts).
   */
  panelOpen: boolean;
  search: SearchFieldProps;
  /** The results dropdown, positioned under the field. */
  results?: ReactNode;
  /** Floating notice centered just below the bar (loading / error pill). */
  children?: ReactNode;
}

const ROUND_BUTTON =
  "pointer-events-auto grid size-11 flex-none place-items-center rounded-full shadow-float";

export default function MapTopBar({
  ref,
  lang,
  labels,
  view,
  filter,
  onFilterChange,
  panelOpen,
  search,
  results,
  children,
}: Props) {
  const inputId = useId();
  const other = LOCALES.find((l) => l !== lang) ?? lang;
  // From state, not location.search: the URL is updated after the render.
  const languageHref = withView(`/${other}/map`, view);
  const list = view === "list";
  const combobox = search.expanded !== null;

  return (
    // One explicit column: an auto track would grow to the chips' max-content
    // width and push the language button off its corner instead of scrolling the chips.
    // Raised above the country sheet (z-30) while the dropdown is open.
    <div
      ref={ref}
      className={`pointer-events-none absolute inset-x-0 top-0 grid grid-cols-[minmax(0,1fr)] gap-2.5 px-4 pb-2.5 pt-[calc(env(safe-area-inset-top,0px)_+_12px)] ${
        search.expanded ? "z-40" : "z-20"
      } ${list ? "bg-parchment shadow-[0_1px_0_var(--c-shadow)]" : ""}`}
    >
      <div className="flex w-full items-center gap-2">
        {/* Home + search stay grouped at the top left (capped on desktop). */}
        <div className="flex min-w-0 max-w-[460px] flex-1 items-center gap-2">
          <a
            href={`/${lang}/`}
            aria-label={labels.home}
            className={`${ROUND_BUTTON} bg-oxblood font-display text-[1.15rem] font-semibold leading-none text-bone no-underline hover:bg-oxblood-2`}
          >
            <span aria-hidden="true">m</span>
          </a>
          <form
            ref={search.boxRef}
            role="search"
            className="pointer-events-auto relative min-w-0 flex-1"
            onSubmit={(e) => {
              e.preventDefault();
              search.onSubmit();
            }}
            onBlur={(e) => {
              // Only keyboard moves (Tab): a tap's blur has no relatedTarget and
              // must not unmount the result it is about to click.
              const next = e.relatedTarget;
              if (next && !e.currentTarget.contains(next)) search.onLeave();
            }}
          >
            <label htmlFor={inputId} className="sr-only">
              {labels.search.label}
            </label>
            <span className="pointer-events-none absolute top-[13px] left-[14px] text-ink/60">
              <IconSearch />
            </span>
            <input
              ref={search.inputRef}
              id={inputId}
              type="search"
              value={search.query}
              placeholder={search.placeholder}
              autoComplete="off"
              autoCorrect="off"
              spellCheck={false}
              enterKeyHint="search"
              role={combobox ? "combobox" : undefined}
              aria-haspopup={combobox ? "dialog" : undefined}
              aria-expanded={combobox ? search.expanded === true : undefined}
              aria-controls={search.controls}
              onChange={(e) => search.onChange(e.target.value)}
              onFocus={search.onOpen}
              onClick={search.onOpen}
              // Room for ✕ only while it shows; on phones the placeholder still
              // may not fit next to the language button, so it ends in "…".
              className={`h-11 w-full appearance-none text-ellipsis rounded-full bg-bone pl-[42px] text-base text-ink shadow-float placeholder:text-ink/60 [&::-webkit-search-cancel-button]:appearance-none [&::-webkit-search-decoration]:appearance-none ${
                search.query ? "pr-11" : "pr-4"
              }`}
            />
            {search.query && (
              <button
                type="button"
                aria-label={labels.search.clear}
                onClick={search.onClear}
                className="absolute top-0 right-0 grid size-11 place-items-center rounded-full text-ink/70 hover:text-ink"
              >
                <IconClose />
              </button>
            )}
            {results}
          </form>
        </div>
        {/* Pinned to the top-right corner (16 px from the edge) on every width. */}
        <a
          href={languageHref}
          hrefLang={other}
          lang={other}
          aria-label={labels.language.aria}
          className={`${ROUND_BUTTON} ml-auto bg-bone text-[0.82rem] font-semibold tracking-wide text-ink no-underline hover:bg-parchment ${
            panelOpen ? "md:mr-[416px]" : ""
          }`}
        >
          <span aria-hidden="true">{labels.language.label}</span>
        </a>
      </div>
      <FilterChips
        value={filter}
        onChange={onFilterChange}
        labels={labels.filter}
        groupLabel={labels.filterGroup}
        flat={list}
      />
      {children && (
        <div className="pointer-events-none absolute inset-x-0 top-full flex justify-center px-4">
          {children}
        </div>
      )}
    </div>
  );
}
