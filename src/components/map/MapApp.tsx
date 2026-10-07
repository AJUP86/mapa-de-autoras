// MapApp.tsx — Stage 11. State + composition for /[lang]/map: the map, the
// floating top bar and controls, the country panel and the region hint.

import { useCallback, useEffect, useLayoutEffect, useMemo, useRef, useState } from "react";
import WorldMap, { type Insets, type WorldMapHandle } from "./WorldMap";
import MapTopBar from "./MapTopBar";
import MapControls from "./MapControls";
import CountrySheet from "./CountrySheet";
import CountryContent from "./CountryContent";
import Toast from "./Toast";
import type { MapPageLabels } from "./labels";
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
import { browserRegion } from "~/lib/map-region";
import {
  countryColor,
  countryStatuses,
  type Author,
  type BookStatus,
  type CountryEntry,
  type Filter,
} from "~/lib/map-state";

interface Props {
  lang: Locale;
  labels: MapPageLabels;
  /** Localized country names (build time), keyed by iso_a3 — never the atlas names. */
  countries: CountryOption[];
}

const EMPTY: CountryEntry[] = [];
const NO_AUTHORS: Author[] = [];

export default function MapApp({ lang, labels, countries }: Props) {
  const { state, retry } = useCatalog();
  const [filter, setFilter] = useState<Filter>("all");
  const [selected, setSelected] = useState<string | null>(null);
  const [region] = useState(browserRegion);
  const [hint, setHint] = useState<string | null>(null);
  const mapRef = useRef<WorldMapHandle>(null);
  const topBarRef = useRef<HTMLDivElement>(null);
  const topBarHeight = useRef(0);
  // Mirrors `selected` synchronously, so the first fly-to already frames the
  // country around the panel (state would only update after the render).
  const selectedRef = useRef<string | null>(null);

  const catalog = state.kind === "loaded" ? state.catalog : EMPTY;
  const statuses = useMemo(() => countryStatuses(catalog), [catalog]);
  const colors = useMemo(() => {
    const out: Record<string, BookStatus | null> = {};
    for (const iso of Object.keys(statuses)) out[iso] = countryColor(statuses[iso], filter);
    return out;
  }, [statuses, filter]);
  const names = useMemo(() => new Map(countries.map((c) => [c.iso_a3, c.name])), [countries]);

  // Cached: getInsets also runs on every pan/zoom event (pan limits), so it
  // must not force a layout read each time.
  useLayoutEffect(() => {
    const el = topBarRef.current;
    if (!el) return;
    const measure = () => {
      topBarHeight.current = el.offsetHeight;
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

  const selectCountry = useCallback((iso: string) => {
    selectedRef.current = iso;
    setSelected(iso);
    setHint(null); // the hint would sit on top of the sheet
    mapRef.current?.flyToCountry(iso);
  }, []);

  const closePanel = useCallback(() => {
    selectedRef.current = null;
    setSelected(null);
  }, []);

  // Until Task 5 (book view + suggest sheet in the panel): go to the full pages.
  const openBook = useCallback(
    (id: string) => window.location.assign(`/${lang}/book?id=${encodeURIComponent(id)}`),
    [lang],
  );
  const suggest = useCallback(() => window.location.assign(`/${lang}/suggest`), [lang]);

  // Esc closes the topmost layer (for now the panel is the only one).
  useEffect(() => {
    if (!selected) return;
    const onKey = (e: KeyboardEvent) => {
      if (e.key === "Escape") closePanel();
    };
    document.addEventListener("keydown", onKey);
    return () => document.removeEventListener("keydown", onKey);
  }, [selected, closePanel]);

  // Once per page load: phones in portrait open on the visitor's region
  // (same condition as WorldMap's first view), so say so.
  useEffect(() => {
    if (region && window.innerHeight > window.innerWidth * 1.1)
      setHint(fmt(labels.regionHint, { region: labels.regions[region] }));
  }, [region, labels]);

  const notice =
    state.kind === "loading" ? labels.loading : state.kind === "error" ? labels.error : null;
  const authors = selected
    ? (catalog.find((e) => e.iso_a3 === selected)?.authors ?? NO_AUTHORS)
    : NO_AUTHORS;
  const name = selected ? (names.get(selected) ?? selected) : "";

  return (
    <div className="map-ui absolute inset-0">
      <WorldMap
        ref={mapRef}
        colors={colors}
        selectedIso={selected}
        ariaLabel={labels.ariaMap}
        initialRegion={region}
        getInsets={getInsets}
        onSelectCountry={selectCountry}
        onBackgroundClick={closePanel}
      />

      <MapTopBar
        ref={topBarRef}
        lang={lang}
        labels={labels}
        filter={filter}
        onFilterChange={setFilter}
        panelOpen={selected !== null}
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

      <MapControls
        labels={labels.zoom}
        panelOpen={selected !== null}
        onZoomIn={() => mapRef.current?.zoomBy(1.6)}
        onZoomOut={() => mapRef.current?.zoomBy(1 / 1.6)}
        onStart={() => mapRef.current?.showStart()}
      />

      <CountrySheet
        open={selected !== null}
        label={name}
        resetKey={selected}
        expandLabel={labels.panel.expand}
        collapseLabel={labels.panel.collapse}
      >
        {selected && (
          <CountryContent
            iso={selected}
            name={name}
            authors={authors}
            labels={labels}
            notice={notice}
            onClose={closePanel}
            onOpenBook={openBook}
            onSuggest={suggest}
          />
        )}
      </CountrySheet>

      <Toast message={hint} onDone={() => setHint(null)} />
    </div>
  );
}
