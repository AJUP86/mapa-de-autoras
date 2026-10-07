// MapApp.tsx — Stage 11. State + composition for /[lang]/map: the map, the
// top bar (search + chips), the controls, the Map | List switch, the list
// view, the country panel (a country, or one of its books), the suggest button
// and sheet, and the region hint. The view is kept in the URL (?view=list) so
// the list can be shared.

import { useCallback, useEffect, useId, useLayoutEffect, useMemo, useRef, useState } from "react";
import WorldMap, { type Insets, type WorldMapHandle } from "./WorldMap";
import MapTopBar, { type SearchFieldProps } from "./MapTopBar";
import SearchResults from "./SearchResults";
import MapControls from "./MapControls";
import ViewSwitch from "./ViewSwitch";
import MapList from "./MapList";
import CountrySheet from "./CountrySheet";
import CountryContent from "./CountryContent";
import BookPanel from "./BookPanel";
import SuggestButton from "./SuggestButton";
import SuggestSheet from "./SuggestSheet";
import Toast from "./Toast";
import { focusElement, useLastPointer } from "./input-modality";
import type { MapPageLabels } from "./labels";
import type { BookDetailLabels } from "../book-labels";
import type { SuggestionFormLabels } from "../SuggestionForm";
import {
  BOTTOM_UI_HEIGHT,
  PANEL_INSET,
  SHEET_HEIGHT_RATIO,
  SHEET_MAX_HEIGHT,
  isDesktopWidth,
} from "./layout";
import type { Locale } from "~/i18n/locales";
import { fmt } from "~/i18n/format";
import type { CountryOption } from "~/lib/countries";
import { useCatalog } from "~/lib/use-catalog";
import { browserRegion, type RegionKey } from "~/lib/map-region";
import { bookCountry, searchCatalog, type SearchResults as Hits } from "~/lib/map-search";
import { viewFromSearch, withView, type MapView } from "~/lib/map-view";
import {
  countryColor,
  countryStatuses,
  type Author,
  type BookStatus,
  type CountryEntry,
  type Filter,
} from "~/lib/map-state";

export interface MapAppProps {
  lang: Locale;
  labels: MapPageLabels;
  /** Localized country names (build time), keyed by iso_a3 — never the atlas names. */
  countries: CountryOption[];
  /** The panel's book view (same strings as the full book page). */
  bookLabels: BookDetailLabels;
  /** The suggest sheet's form (same strings as /[lang]/suggest). */
  suggestLabels: SuggestionFormLabels;
  turnstileSiteKey: string;
  /** The submit_suggestion Edge Function. */
  submitUrl: string;
}

const EMPTY: CountryEntry[] = [];
const NO_AUTHORS: Author[] = [];
const NO_HITS: Hits = { countries: [], authors: [], books: [] };

export default function MapApp({
  lang,
  labels,
  countries,
  bookLabels,
  suggestLabels,
  turnstileSiteKey,
  submitUrl,
}: MapAppProps) {
  const { state, retry } = useCatalog();
  const [filter, setFilter] = useState<Filter>("all");
  const [selected, setSelected] = useState<string | null>(null);
  // The panel shows this book of the selected country instead of the country.
  const [book, setBook] = useState<string | null>(null);
  // Back from a book opened from the panel's own row: that row gets the focus.
  const [backFocus, setBackFocus] = useState<string | null>(null);
  const bookFromPanel = useRef(false);
  // The suggest sheet, when open: the country to preselect (if any).
  const [suggestFor, setSuggestFor] = useState<{ iso?: string } | null>(null);
  // Where focus was when the sheet opened; it goes back there on close.
  const sheetReturnRef = useRef<Element | null>(null);
  const [view, setView] = useState<MapView>(() => viewFromSearch(window.location.search));
  const [query, setQuery] = useState("");
  // Wanted open by the reader; the dropdown only exists in the map view.
  const [searchOpen, setSearchOpen] = useState(false);
  const [region] = useState(browserRegion);
  const [hint, setHint] = useState<string | null>(null);
  const firstView = useRef(view).current;
  const rootRef = useRef<HTMLDivElement>(null);
  const mapRef = useRef<WorldMapHandle>(null);
  const topBarRef = useRef<HTMLDivElement>(null);
  const topBarHeight = useRef(0);
  const searchInputRef = useRef<HTMLInputElement>(null);
  const searchBoxRef = useRef<HTMLFormElement>(null);
  // Mirrors `selected` synchronously, so the first fly-to already frames the
  // country around the panel (state would only update after the render).
  const selectedRef = useRef<string | null>(null);
  // Where focus was before the panel opened; it goes back there on close.
  const returnFocusRef = useRef<Element | null>(null);
  // True while script focuses the search field: that must not open the dropdown.
  const scriptFocus = useRef(false);
  const lastPointer = useLastPointer();
  const resultsId = useId();
  const listId = useId();

  const ready = state.kind === "loaded";
  const catalog = ready ? state.catalog : EMPTY;
  const statuses = useMemo(() => countryStatuses(catalog), [catalog]);
  const colors = useMemo(() => {
    const out: Record<string, BookStatus | null> = {};
    for (const iso of Object.keys(statuses)) out[iso] = countryColor(statuses[iso], filter);
    return out;
  }, [statuses, filter]);
  const names = useMemo(() => new Map(countries.map((c) => [c.iso_a3, c.name])), [countries]);
  const dropdownOpen = view === "map" && searchOpen;
  const hits = useMemo(
    () => (view === "map" ? searchCatalog(query, catalog, countries) : NO_HITS),
    [view, query, catalog, countries],
  );

  // Cached: getInsets also runs on every pan/zoom event (pan limits), so it
  // must not force a layout read each time. The list view pads by the same
  // height through a CSS variable (no re-render).
  useLayoutEffect(() => {
    const el = topBarRef.current;
    if (!el) return;
    const measure = () => {
      topBarHeight.current = el.offsetHeight;
      rootRef.current?.style.setProperty("--map-top-h", `${el.offsetHeight}px`);
    };
    measure();
    const ro = new ResizeObserver(measure);
    ro.observe(el);
    return () => ro.disconnect();
  }, []);

  // Screen edges the floating UI covers on a map of `width` × `height` (the
  // map fills the viewport). Sizes come from layout.ts, the same numbers
  // CountrySheet / MapControls use as Tailwind literals.
  const getInsets = useCallback((width: number, height: number): Insets => {
    const insets = { top: topBarHeight.current + 8, right: 0, bottom: BOTTOM_UI_HEIGHT, left: 0 };
    if (selectedRef.current) {
      if (isDesktopWidth(width)) insets.right = PANEL_INSET;
      else insets.bottom = Math.min(SHEET_HEIGHT_RATIO * height, SHEET_MAX_HEIGHT);
    }
    return insets;
  }, []);

  /** Focus the search field without opening the dropdown. */
  const focusSearch = useCallback((quiet: boolean) => {
    const field = searchInputRef.current;
    if (!field) return;
    scriptFocus.current = true;
    focusElement(field, quiet);
    scriptFocus.current = false;
  }, []);

  /** Opens the panel on `iso` (no fly-to); remembers where focus was before it opened. */
  const showPanel = useCallback((iso: string) => {
    if (!selectedRef.current) returnFocusRef.current = document.activeElement;
    selectedRef.current = iso;
    setSelected(iso);
    setHint(null); // the hint would sit on top of the sheet
  }, []);

  const selectCountry = useCallback(
    (iso: string) => {
      showPanel(iso);
      setBook(null);
      setBackFocus(null);
      mapRef.current?.flyToCountry(iso);
    },
    [showPanel],
  );

  /**
   * A book from a panel row, a search result or a list row: the panel opens on
   * the book's country and shows the book. On the map that country is selected
   * and framed like any other; over the list the hidden map does not move.
   */
  const openBook = useCallback(
    (id: string, fromPanel = false) => {
      const iso = bookCountry(catalog, id);
      if (!iso) return;
      const fly = view === "map" && iso !== selectedRef.current;
      showPanel(iso);
      setBook(id);
      setBackFocus(null);
      bookFromPanel.current = fromPanel;
      if (fly) mapRef.current?.flyToCountry(iso);
    },
    [catalog, view, showPanel],
  );
  const openBookFromPanel = useCallback((id: string) => openBook(id, true), [openBook]);

  /** Back to the book's country; its row takes the focus when the book was opened from it. */
  const backToCountry = useCallback(() => {
    setBackFocus(bookFromPanel.current ? book : null);
    setBook(null);
  }, [book]);

  /**
   * Focus goes back to `before` (where it was before a layer opened), or to
   * the search field if that element is gone. Not after a tap, though:
   * focusing the field would pop up the on-screen keyboard.
   */
  const restoreFocus = useCallback(
    (before: Element | null) => {
      const pointer = lastPointer.current;
      const field = searchInputRef.current;
      if (
        before instanceof HTMLElement &&
        before !== field &&
        before !== document.body &&
        before.isConnected
      ) {
        focusElement(before, pointer !== null);
      } else if (pointer !== "touch" && pointer !== "pen") {
        focusSearch(pointer !== null);
      }
    },
    [lastPointer, focusSearch],
  );

  /** Closes the whole panel (book view included); `restore` for ✕, Esc and a sea tap. */
  const closePanel = useCallback(
    (restore: boolean) => {
      if (!selectedRef.current) return; // e.g. a sea tap with no panel open
      selectedRef.current = null;
      setSelected(null);
      setBook(null);
      setBackFocus(null);
      const before = returnFocusRef.current;
      returnFocusRef.current = null;
      if (restore) restoreFocus(before);
    },
    [restoreFocus],
  );
  const dismissPanel = useCallback(() => closePanel(true), [closePanel]);

  // ── Suggest sheet ──
  const sheetOpen = suggestFor !== null;
  /** `iso`: the country to preselect (the panel's country). */
  const openSuggest = useCallback((iso?: string) => {
    sheetReturnRef.current = document.activeElement;
    setSearchOpen(false);
    setSuggestFor({ iso });
  }, []);
  // For onClick props: never pass the click event on as a country.
  const suggestAny = useCallback(() => openSuggest(), [openSuggest]);
  const closeSuggest = useCallback(() => setSuggestFor(null), []);

  // Once the sheet has closed — after the commit, when the map UI is no longer
  // inert and can take focus again — focus goes back to its opener.
  const sheetWasOpen = useRef(false);
  useEffect(() => {
    if (sheetOpen) {
      sheetWasOpen.current = true;
      return;
    }
    if (!sheetWasOpen.current) return;
    sheetWasOpen.current = false;
    const before = sheetReturnRef.current;
    sheetReturnRef.current = null;
    restoreFocus(before);
  }, [sheetOpen, restoreFocus]);

  // ── Search ──
  /** After a pick: close the dropdown and drop the keyboard; the text stays. */
  const endSearch = () => {
    setSearchOpen(false);
    searchInputRef.current?.blur();
  };
  const pickCountry = (iso: string) => {
    endSearch();
    selectCountry(iso);
  };
  const pickBook = (id: string) => {
    endSearch();
    openBook(id);
  };
  const suggestFromSearch = () => {
    endSearch();
    openSuggest();
  };
  const pickRegion = (key: RegionKey) => {
    endSearch();
    setHint(null);
    mapRef.current?.flyToRegion(key);
  };
  const search: SearchFieldProps = {
    inputRef: searchInputRef,
    boxRef: searchBoxRef,
    query,
    placeholder: view === "list" ? labels.search.listPlaceholder : labels.search.placeholder,
    expanded: view === "map" ? dropdownOpen : null,
    controls: view === "list" ? listId : dropdownOpen ? resultsId : undefined,
    // Typing opens the dropdown; emptying the field (e.g. the browser's own
    // clear on Esc) leaves it as it is.
    onChange: (q) => {
      setQuery(q);
      if (q) setSearchOpen(true);
    },
    onOpen: () => {
      if (!scriptFocus.current) setSearchOpen(true);
    },
    // Enter: the first result on the map; in the list just drop the keyboard.
    onSubmit: () => {
      if (view === "list") {
        searchInputRef.current?.blur();
        return;
      }
      const iso = hits.countries[0]?.iso_a3 ?? hits.authors[0]?.iso_a3;
      if (iso) pickCountry(iso);
      else if (hits.books[0]) pickBook(hits.books[0].book.id);
    },
    onClear: () => {
      setQuery("");
      setSearchOpen(true);
      searchInputRef.current?.focus();
    },
    onLeave: () => setSearchOpen(false),
  };

  // A pointerdown outside the field and its dropdown closes the dropdown.
  useEffect(() => {
    if (!dropdownOpen) return;
    const onDown = (e: PointerEvent) => {
      if (!searchBoxRef.current?.contains(e.target as Node)) setSearchOpen(false);
    };
    document.addEventListener("pointerdown", onDown, true);
    return () => document.removeEventListener("pointerdown", onDown, true);
  }, [dropdownOpen]);

  // Esc closes the topmost layer: the suggest sheet, the dropdown, then the
  // panel. Only then is the browser's own Esc (clearing a search field) prevented.
  useEffect(() => {
    if (!sheetOpen && !dropdownOpen && !selected) return;
    const onKey = (e: KeyboardEvent) => {
      if (e.key !== "Escape") return;
      e.preventDefault();
      if (sheetOpen) closeSuggest();
      else if (dropdownOpen) {
        // From a result row (about to unmount): back to the field.
        const active = document.activeElement;
        if (active !== searchInputRef.current && searchBoxRef.current?.contains(active))
          focusSearch(false);
        setSearchOpen(false);
      } else closePanel(true);
    };
    document.addEventListener("keydown", onKey);
    return () => document.removeEventListener("keydown", onKey);
  }, [sheetOpen, dropdownOpen, selected, closePanel, closeSuggest, focusSearch]);

  // ── View ──
  /** Switching closes the panel (book view included) and the dropdown; filter and query stay. */
  const changeView = useCallback(
    (next: MapView) => {
      if (next === view) return;
      setSearchOpen(false);
      closePanel(false);
      setHint(null);
      setView(next);
    },
    [view, closePanel],
  );
  const showOnMap = useCallback(
    (iso: string) => {
      changeView("map");
      selectCountry(iso);
    },
    [changeView, selectCountry],
  );

  // Keep ?view=list in the URL (path, other params and hash untouched), and
  // name the page after the view.
  useEffect(() => {
    const href = withView(window.location.href, view);
    if (href !== window.location.href) history.replaceState(history.state, "", href);
    document.title = labels.pageTitle[view];
  }, [view, labels]);

  // Once per page load: phones in portrait open the map on the visitor's
  // region (same condition as WorldMap's first view), so say so — unless the
  // page opened on the list.
  useEffect(() => {
    if (region && firstView === "map" && window.innerHeight > window.innerWidth * 1.1)
      setHint(fmt(labels.regionHint, { region: labels.regions[region] }));
  }, [region, labels, firstView]);

  const notice =
    state.kind === "loading" ? labels.loading : state.kind === "error" ? labels.error : null;
  const authors = selected
    ? (catalog.find((e) => e.iso_a3 === selected)?.authors ?? NO_AUTHORS)
    : NO_AUTHORS;
  const name = selected ? (names.get(selected) ?? selected) : "";

  return (
    <>
      {/* Inert under the suggest sheet: focus cannot leave the dialog. */}
      <div ref={rootRef} className="map-ui absolute inset-0" inert={sheetOpen}>
        {/* Stays mounted under the list (keeps its view), out of reach while covered. */}
        <div className="absolute inset-0" inert={view === "list"}>
          <WorldMap
            ref={mapRef}
            colors={colors}
            selectedIso={selected}
            ariaLabel={labels.ariaMap}
            initialRegion={region}
            getInsets={getInsets}
            onSelectCountry={selectCountry}
            onBackgroundClick={dismissPanel}
          />
        </div>

        <MapTopBar
          ref={topBarRef}
          lang={lang}
          labels={labels}
          view={view}
          filter={filter}
          onFilterChange={setFilter}
          panelOpen={selected !== null}
          search={search}
          results={
            dropdownOpen && (
              <SearchResults
                id={resultsId}
                query={query}
                hits={hits}
                names={names}
                statuses={statuses}
                notice={notice}
                onRetry={state.kind === "error" ? retry : undefined}
                labels={labels}
                onRegion={pickRegion}
                onCountry={pickCountry}
                onBook={pickBook}
                onSuggest={suggestFromSearch}
              />
            )
          }
        >
          <div role="status" className="flex justify-center">
            {notice && (
              <p
                className={`pointer-events-auto mt-1 flex items-center rounded-full bg-bone pl-4 text-[0.85rem] text-ink/75 shadow-float ${
                  state.kind === "error" ? "pr-1" : "py-2 pr-4"
                }`}
              >
                {notice}
                {state.kind === "error" && (
                  <button
                    type="button"
                    onClick={retry}
                    className="min-h-11 rounded-full px-3 font-semibold text-oxblood underline underline-offset-[3px] hover:text-oxblood-2"
                  >
                    {labels.retry}
                  </button>
                )}
              </p>
            )}
          </div>
        </MapTopBar>

        {/* After the top bar in the DOM (tab order), under it on screen (z-10 < z-20). */}
        {view === "list" && (
          <MapList
            id={listId}
            catalog={catalog}
            names={names}
            filter={filter}
            query={query}
            lang={lang}
            labels={labels}
            ready={ready}
            onOpenBook={openBook}
            onShowOnMap={showOnMap}
            onSuggest={suggestAny}
          />
        )}

        {view === "map" && (
          <MapControls
            labels={labels.zoom}
            panelOpen={selected !== null}
            onZoomIn={() => mapRef.current?.zoomBy(1.6)}
            onZoomOut={() => mapRef.current?.zoomBy(1 / 1.6)}
            onStart={() => mapRef.current?.showStart()}
          />
        )}

        <ViewSwitch
          view={view}
          labels={labels.viewSwitch}
          panelOpen={selected !== null}
          onChange={changeView}
        />

        <SuggestButton
          label={labels.suggest.button}
          ariaLabel={labels.suggest.buttonAria}
          panelOpen={selected !== null}
          onClick={suggestAny}
        />

        <CountrySheet
          open={selected !== null}
          label={name}
          resetKey={selected}
          contentKey={book}
          expandLabel={labels.panel.expand}
          collapseLabel={labels.panel.collapse}
          lastPointer={lastPointer}
        >
          {selected &&
            (book ? (
              <BookPanel
                bookId={book}
                lang={lang}
                labels={bookLabels}
                countryName={name}
                backLabel={fmt(labels.panel.backToCountry, { country: name })}
                closeLabel={labels.panel.close}
                onBack={backToCountry}
                onClose={dismissPanel}
              />
            ) : (
              <CountryContent
                iso={selected}
                name={name}
                authors={authors}
                labels={labels}
                notice={notice}
                focusBookId={backFocus}
                onClose={dismissPanel}
                onOpenBook={openBookFromPanel}
                onSuggest={openSuggest}
              />
            ))}
        </CountrySheet>

        <Toast message={hint} onDone={() => setHint(null)} />
      </div>

      <SuggestSheet
        open={sheetOpen}
        initialCountry={suggestFor?.iso}
        onClose={closeSuggest}
        lang={lang}
        labels={labels.suggest}
        closeLabel={labels.panel.close}
        formLabels={suggestLabels}
        countries={countries}
        turnstileSiteKey={turnstileSiteKey}
        submitUrl={submitUrl}
        lastPointer={lastPointer}
      />
    </>
  );
}
