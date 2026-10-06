// MapApp.tsx — Stage 11. State + composition for /[lang]/map.

import { useCallback, useMemo, useRef, useState } from "react";
import WorldMap, { type Insets, type WorldMapHandle } from "./WorldMap";
import type { MapPageLabels } from "./labels";
import { useCatalog } from "~/lib/use-catalog";
import { browserRegion } from "~/lib/map-region";
import {
  countryColor,
  countryStatuses,
  type BookStatus,
  type CountryEntry,
  type Filter,
} from "~/lib/map-state";

interface Props {
  labels: MapPageLabels;
}

const EMPTY: CountryEntry[] = [];

export default function MapApp({ labels }: Props) {
  const { state } = useCatalog();
  const [filter] = useState<Filter>("all");
  const [selected, setSelected] = useState<string | null>(null);
  const [region] = useState(browserRegion);
  const mapRef = useRef<WorldMapHandle>(null);

  const catalog = state.kind === "loaded" ? state.catalog : EMPTY;
  const statuses = useMemo(() => countryStatuses(catalog), [catalog]);
  const colors = useMemo(() => {
    const out: Record<string, BookStatus | null> = {};
    for (const iso of Object.keys(statuses)) out[iso] = countryColor(statuses[iso], filter);
    return out;
  }, [statuses, filter]);

  const getInsets = useCallback((): Insets => ({ top: 0, right: 0, bottom: 0, left: 0 }), []);

  return (
    <WorldMap
      ref={mapRef}
      colors={colors}
      selectedIso={selected}
      ariaLabel={labels.ariaMap}
      initialRegion={region}
      getInsets={getInsets}
      onSelectCountry={(iso) => {
        setSelected(iso);
        mapRef.current?.flyToCountry(iso);
      }}
      onBackgroundClick={() => setSelected(null)}
    />
  );
}
