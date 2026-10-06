// world-geo.ts — Stage 11
//
// The world as GeoJSON, built once from world-atlas' 50m TopoJSON (the middle
// resolution: small countries and coastlines hold up when zoomed in). Each
// feature carries its ISO alpha-3 code (our domain key) or null for the few
// shapes without one (Kosovo, N. Cyprus, Somaliland, ...): those still draw so
// the map has no holes, but they are not tappable. Antarctica is dropped — no
// authors, and it wastes a third of a phone screen.

import { feature } from "topojson-client";
import { geoArea } from "d3-geo";
import type { Feature, FeatureCollection, MultiPolygon, Polygon } from "geojson";
import worldData from "world-atlas/countries-50m.json";
import { isoNumericToA3 } from "../data/iso-numeric-to-a3";

export interface CountryProps {
  name: string;
  iso: string | null;
}

export type CountryFeature = Feature<Polygon | MultiPolygon, CountryProps> & { id: string };

// TopoJSON typing is loose; cast once at the boundary (same as the old AuthorsMap).
const topology = worldData as unknown as Parameters<typeof feature>[0];
const collection = feature(
  topology,
  (topology as unknown as { objects: { countries: Parameters<typeof feature>[1] } }).objects
    .countries,
) as unknown as FeatureCollection<Polygon | MultiPolygon, { name: string }>;

function toA3(id: unknown): string | null {
  const n = typeof id === "string" ? parseInt(id, 10) : typeof id === "number" ? id : NaN;
  return Number.isFinite(n) ? (isoNumericToA3[n] ?? null) : null;
}

function polygons(g: Polygon | MultiPolygon): Polygon["coordinates"][] {
  return g.type === "Polygon" ? [g.coordinates] : g.coordinates;
}

// The 50m data lists a few dependencies under their parent's numeric code
// (Ashmore and Cartier Is. shares 036 with Australia). One feature per ISO code
// keeps ids and React keys unique and makes the islands part of their country,
// so they color and select with it: merge repeated codes into one MultiPolygon.
const byId = new Map<string, CountryFeature>();
collection.features.forEach((f, i) => {
  const iso = toA3(f.id);
  if (iso === "ATA") return;
  const id = iso ?? `x-${i}`;
  const prev = byId.get(id);
  if (prev) {
    prev.geometry = {
      type: "MultiPolygon",
      coordinates: [...polygons(prev.geometry), ...polygons(f.geometry)],
    };
    return;
  }
  byId.set(id, {
    type: "Feature",
    id,
    geometry: f.geometry,
    properties: { name: f.properties?.name ?? "", iso },
  });
});

export const WORLD_FEATURES: CountryFeature[] = [...byId.values()];

export const WORLD: FeatureCollection<Polygon | MultiPolygon, CountryProps> = {
  type: "FeatureCollection",
  features: WORLD_FEATURES,
};

/**
 * The country's largest polygon by spherical area. Framing a country on its
 * main landmass keeps e.g. the USA from zooming out to include Alaska.
 */
export function mainShape(f: CountryFeature): Feature<Polygon> {
  if (f.geometry.type === "Polygon") {
    return { type: "Feature", properties: {}, geometry: f.geometry };
  }
  let best: Polygon = { type: "Polygon", coordinates: f.geometry.coordinates[0] };
  let bestArea = -1;
  for (const coordinates of f.geometry.coordinates) {
    const poly: Polygon = { type: "Polygon", coordinates };
    const area = geoArea(poly);
    if (area > bestArea) {
      bestArea = area;
      best = poly;
    }
  }
  return { type: "Feature", properties: {}, geometry: best };
}
