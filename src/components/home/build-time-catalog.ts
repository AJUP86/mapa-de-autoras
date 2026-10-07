// build-time-catalog.ts — Stage 11. The catalog as MapPicture draws it: fetched
// once per build and shared by every locale's home (one call, at most one
// warning), or null when the fetch fails — the picture must never fail the
// build. The dev server fetches per request so the picture follows the DB.

import { fetchCatalog } from "~/lib/authors";
import type { CountryEntry } from "~/lib/map-state";

let shared: Promise<CountryEntry[] | null> | undefined;

async function load(): Promise<CountryEntry[] | null> {
  try {
    return await fetchCatalog();
  } catch (e) {
    console.warn(
      "[MapPicture] catalog fetch failed, drawing the map uncolored:",
      (e as Error).message,
    );
    return null;
  }
}

export function buildTimeCatalog(): Promise<CountryEntry[] | null> {
  if (import.meta.env.DEV) return load();
  shared ??= load();
  return shared;
}
