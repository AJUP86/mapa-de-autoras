import { useMemo, useState } from "react";
import AuthorsMap from "./AuthorsMap";
import type { MapView } from "./AuthorsMap";
import MapFilter from "./MapFilter";
import CountryPanel from "./CountryPanel";
import ContinentNav, { CONTINENT_VIEWS } from "./ContinentNav";
import type { ContinentKey } from "./ContinentNav";
import { computeCountryStates } from "~/lib/map-state";
import type { CountryEntry, Filter, MapLabels } from "~/lib/map-state";

interface MapSectionLabels extends MapLabels {
  view: Record<ContinentKey, string>;
  zoom: { in: string; out: string; reset: string };
}

interface Props {
  labels: MapSectionLabels;
  catalog: CountryEntry[];
}

export default function MapSection({ labels, catalog }: Props) {
  const [filter, setFilter] = useState<Filter>("all");
  const [view, setView] = useState<MapView>(CONTINENT_VIEWS.world);
  const [selected, setSelected] = useState<
    { iso_a3: string; name: string } | null
  >(null);

  const countryStates = useMemo(
    () => computeCountryStates(catalog),
    [catalog],
  );

  const selectedAuthors = useMemo(() => {
    if (!selected) return [];
    return (
      catalog.find((entry) => entry.iso_a3 === selected.iso_a3)?.authors ?? []
    );
  }, [selected, catalog]);

  return (
    <div className="relative">
      <div className="mb-5 flex flex-col items-center gap-4">
        <MapFilter
          value={filter}
          onChange={setFilter}
          labels={labels.filter}
        />
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
