// MapTopBar.tsx — Stage 11. Floating top bar of /map: home button + (Task 4)
// search field at the top left, the language switch pinned to the top-right
// corner, and the filter chips below. The wrappers let pointer events through
// so the map stays draggable around the controls.

import type { ReactNode, Ref } from "react";
import { LOCALES, type Locale } from "~/i18n/locales";
import type { Filter } from "~/lib/map-state";
import FilterChips from "./FilterChips";
import type { MapPageLabels } from "./labels";

interface Props {
  ref?: Ref<HTMLDivElement>;
  lang: Locale;
  labels: MapPageLabels;
  filter: Filter;
  onFilterChange: (filter: Filter) => void;
  /**
   * Desktop: the side panel covers the top-right corner, so the language button
   * moves left of it (`md:mr-[416px]` = PANEL_WIDTH + PANEL_GAP in layout.ts).
   */
  panelOpen: boolean;
  /** Floating notice centered just below the bar (loading / error pill). */
  children?: ReactNode;
}

const ROUND_BUTTON =
  "pointer-events-auto grid size-11 flex-none place-items-center rounded-full shadow-float";

export default function MapTopBar({
  ref,
  lang,
  labels,
  filter,
  onFilterChange,
  panelOpen,
  children,
}: Props) {
  const other = LOCALES.find((l) => l !== lang) ?? lang;
  // Keep the query (e.g. ?view=list) when switching language.
  const languageHref = `/${other}/map${window.location.search}`;

  return (
    // One explicit column: an auto track would grow to the chips' max-content
    // width and push the language button off its corner instead of scrolling the chips.
    <div
      ref={ref}
      className="pointer-events-none absolute inset-x-0 top-0 z-20 grid grid-cols-[minmax(0,1fr)] gap-2.5 px-4 pb-2.5 pt-[calc(env(safe-area-inset-top,0px)_+_12px)]"
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
          {/* Task 4: the search field goes in this slot. */}
          <div className="min-w-0 flex-1" />
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
      />
      {children && (
        <div className="pointer-events-none absolute inset-x-0 top-full flex justify-center px-4">
          {children}
        </div>
      )}
    </div>
  );
}
