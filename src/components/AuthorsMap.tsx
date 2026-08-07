import {
  ComposableMap,
  Geographies,
  Geography,
  ZoomableGroup,
} from "@vnedyalk0v/react19-simple-maps";
import { feature } from "topojson-client";
import worldData from "world-atlas/countries-110m.json";
import { isoNumericToA3 } from "~/data/iso-numeric-to-a3";
import { fillFor } from "~/lib/map-state";
import type { CountryState, Filter } from "~/lib/map-state";

export interface MapView {
  center: [number, number];
  zoom: number;
}

interface Props {
  countryStates: Readonly<Record<string, CountryState>>;
  filter: Filter;
  selectedIso?: string | null;
  view: MapView;
  onViewChange: (next: MapView) => void;
  onSelectCountry: (iso_a3: string, name: string) => void;
}

// TopoJSON typing is loose; cast once at the boundary.
const worldTopology = worldData as unknown as Parameters<typeof feature>[0];
const worldGeoJson = feature(
  worldTopology,
  (worldTopology as unknown as { objects: { countries: unknown } }).objects.countries as Parameters<
    typeof feature
  >[1],
) as unknown as Parameters<typeof Geographies>[0]["geography"];

export default function AuthorsMap({
  countryStates,
  filter,
  selectedIso,
  view,
  onViewChange,
  onSelectCountry,
}: Props) {
  return (
    <div className="w-full bg-water">
      <ComposableMap
        projection="geoEqualEarth"
        projectionConfig={{ scale: 165 }}
        width={1000}
        height={500}
        style={{ width: "100%", height: "auto" }}
        aria-label="World map of women writers"
        role="img"
      >
        <defs>
          <filter id="land-shadow" x="-2%" y="-2%" width="104%" height="104%">
            <feDropShadow
              dx="0"
              dy="0.6"
              stdDeviation="0.6"
              floodColor="#1B2A41"
              floodOpacity="0.35"
            />
          </filter>
        </defs>

        <ZoomableGroup
          center={view.center as unknown as Parameters<typeof ZoomableGroup>[0]["center"]}
          zoom={view.zoom}
          minZoom={1}
          maxZoom={8}
          onMoveEnd={({ coordinates, zoom }) =>
            onViewChange({
              center: coordinates as unknown as [number, number],
              zoom,
            })
          }
        >
          <g filter="url(#land-shadow)">
            <Geographies geography={worldGeoJson}>
              {({ geographies }) =>
                (
                  geographies as Array<
                    (typeof geographies)[number] & { rsmKey: string; id?: string | number }
                  >
                ).map((geo) => {
                  const numericRaw = typeof geo.id === "string" ? parseInt(geo.id, 10) : geo.id;
                  const iso_a3 =
                    typeof numericRaw === "number" ? isoNumericToA3[numericRaw] : undefined;
                  const state: CountryState =
                    iso_a3 && countryStates[iso_a3] ? countryStates[iso_a3] : "empty";
                  const isSelected = iso_a3 && iso_a3 === selectedIso;
                  const { fill, stroke } = fillFor(state, filter);
                  const name =
                    (geo.properties as { name?: string } | undefined)?.name ?? iso_a3 ?? "";

                  return (
                    <Geography
                      key={geo.rsmKey}
                      geography={geo}
                      onClick={() => iso_a3 && onSelectCountry(iso_a3, name)}
                      fill={fill}
                      stroke={isSelected ? "var(--c-ink)" : stroke}
                      strokeWidth={isSelected ? 1 : 0.6}
                      tabIndex={-1}
                      style={
                        {
                          default: {
                            outline: "none",
                            transition: "fill 200ms ease-out",
                          },
                          hover: {
                            fill: "var(--c-ochre)",
                            outline: "none",
                            cursor: "pointer",
                          },
                          pressed: { outline: "none" },
                          // The focus state isn't a default style key in
                          // react-simple-maps, but a few of its forks (including
                          // the React-19 fork) read it. Belt-and-suspenders with
                          // tabIndex={-1} and the CSS rule below.
                          focus: { outline: "none" },
                        } as Parameters<typeof Geography>[0]["style"]
                      }
                    />
                  );
                })
              }
            </Geographies>
          </g>
        </ZoomableGroup>
      </ComposableMap>
    </div>
  );
}
