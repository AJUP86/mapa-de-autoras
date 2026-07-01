import { useEffect, useMemo, useRef, useState } from "react";
import AuthorsMap from "./AuthorsMap";
import type { MapView } from "./AuthorsMap";
import MapFilter from "./MapFilter";
import CountryPanel from "./CountryPanel";
import ContinentNav, { CONTINENT_VIEWS } from "./ContinentNav";
import type { ContinentKey } from "./ContinentNav";
import { supabase } from "~/lib/supabase";
import { getCatalog } from "~/lib/authors";
import { computeCountryStates } from "~/lib/map-state";
import type { CountryEntry, Filter, MapLabels } from "~/lib/map-state";
import {
  addAuthor,
  addBook,
  removeAuthor,
  removeBook,
  updateAuthor,
  updateBook,
  type AuthorRow,
  type BookRow,
} from "~/lib/realtime-reducers";

interface MapSectionLabels extends MapLabels {
  view: Record<ContinentKey, string>;
  zoom: { in: string; out: string; reset: string };
}

interface Props {
  labels: MapSectionLabels;
}

export default function MapSection({ labels }: Props) {
  // null = loading, [] = loaded but empty, CountryEntry[] = loaded with data.
  const [catalog, setCatalog] = useState<CountryEntry[] | null>(null);
  const [filter, setFilter] = useState<Filter>("all");
  const [view, setView] = useState<MapView>(CONTINENT_VIEWS.world);
  const [selected, setSelected] = useState<
    { iso_a3: string; name: string } | null
  >(null);

  // Tracks whether we've completed an initial subscribe — used to detect
  // reconnects in the subscription useEffect's status callback.
  const hasSubscribedOnce = useRef(false);

  // Initial fetch on mount. getCatalog() returns [] on error (see authors.ts),
  // so a failure renders the empty-map baseline rather than blocking the page.
  useEffect(() => {
    let cancelled = false;
    getCatalog().then((data) => {
      if (!cancelled) setCatalog(data);
    });
    return () => {
      cancelled = true;
    };
  }, []);

  // Realtime subscription — runs once after the catalog first loads. Granular
  // patching: each event updates local state by row id, no refetch per event.
  useEffect(() => {
    if (catalog === null) return;

    const channel = supabase
      .channel("public-map-realtime")
      .on(
        "postgres_changes",
        { event: "INSERT", schema: "public", table: "authors" },
        (payload) => {
          setCatalog((prev) =>
            prev ? addAuthor(prev, payload.new as AuthorRow) : prev,
          );
        },
      )
      .on(
        "postgres_changes",
        { event: "UPDATE", schema: "public", table: "authors" },
        (payload) => {
          setCatalog((prev) =>
            prev ? updateAuthor(prev, payload.new as AuthorRow) : prev,
          );
        },
      )
      .on(
        "postgres_changes",
        { event: "DELETE", schema: "public", table: "authors" },
        (payload) => {
          const old = payload.old as { id?: string };
          if (!old.id) return;
          setCatalog((prev) => (prev ? removeAuthor(prev, old.id!) : prev));
        },
      )
      .on(
        "postgres_changes",
        { event: "INSERT", schema: "public", table: "books" },
        (payload) => {
          setCatalog((prev) =>
            prev ? addBook(prev, payload.new as BookRow) : prev,
          );
        },
      )
      .on(
        "postgres_changes",
        { event: "UPDATE", schema: "public", table: "books" },
        (payload) => {
          setCatalog((prev) =>
            prev ? updateBook(prev, payload.new as BookRow) : prev,
          );
        },
      )
      .on(
        "postgres_changes",
        { event: "DELETE", schema: "public", table: "books" },
        (payload) => {
          setCatalog((prev) =>
            prev ? removeBook(prev, payload.old as BookRow) : prev,
          );
        },
      )
      .subscribe((status) => {
        // First SUBSCRIBED after mount = initial subscribe; mark and skip resync.
        // Subsequent SUBSCRIBED transitions (after CHANNEL_ERROR / CLOSED) =
        // reconnect; refetch to resync any events missed during the disconnect.
        if (status === "SUBSCRIBED") {
          if (hasSubscribedOnce.current) {
            getCatalog().then((data) => setCatalog(data));
          } else {
            hasSubscribedOnce.current = true;
          }
        }
      });

    return () => {
      supabase.removeChannel(channel);
    };
    // Subscribe only when catalog transitions null → loaded. Keying on the
    // boolean keeps the channel stable across content patches (it must not tear
    // down and rejoin on every setCatalog).
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [catalog === null]);

  const countryStates = useMemo(
    () => (catalog ? computeCountryStates(catalog) : {}),
    [catalog],
  );

  const selectedAuthors = useMemo(() => {
    if (!selected || !catalog) return [];
    return (
      catalog.find((entry) => entry.iso_a3 === selected.iso_a3)?.authors ?? []
    );
  }, [selected, catalog]);

  return (
    <div className="relative">
      <div className="mb-5 flex flex-col items-center gap-4">
        <MapFilter value={filter} onChange={setFilter} labels={labels.filter} />
        <ContinentNav
          view={view}
          onSetView={setView}
          labels={{ view: labels.view, zoom: labels.zoom }}
        />
      </div>

      <div className="mx-auto max-w-5xl rounded-2xl overflow-hidden border border-ink/10 shadow-[0_1px_2px_var(--c-shadow)]">
        <AuthorsMap
          countryStates={countryStates}
          filter={filter}
          selectedIso={selected?.iso_a3 ?? null}
          view={view}
          onViewChange={setView}
          onSelectCountry={(iso_a3, name) => setSelected({ iso_a3, name })}
        />
      </div>

      {selected && (
        <CountryPanel
          countryName={selected.name}
          authors={selectedAuthors}
          labels={labels}
          onClose={() => setSelected(null)}
        />
      )}
    </div>
  );
}
