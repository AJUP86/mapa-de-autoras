// map-view.ts — Stage 11
//
// The /map page has two views: the map and the list (?view=list, shareable).
// These rules read and write that one query parameter; everything else in the
// URL (path, other parameters, hash) is left alone.

export type MapView = "map" | "list";

const VIEW_PARAM = "view";
/** Only to resolve relative hrefs; never part of the result. */
const BASE = "http://localhost";

/** The view a query string asks for ("?view=list" → list); anything else is the map. */
export function viewFromSearch(search: string): MapView {
  return new URLSearchParams(search).get(VIEW_PARAM) === "list" ? "list" : "map";
}

/**
 * `href` showing `view`: sets ?view=list, or removes the parameter for the map.
 * An absolute href stays absolute; a relative one comes back as path + query + hash.
 */
export function withView(href: string, view: MapView): string {
  const absolute = /^[a-z][a-z\d+.-]*:/i.test(href);
  const url = new URL(href, BASE);
  if (view === "list") url.searchParams.set(VIEW_PARAM, "list");
  else url.searchParams.delete(VIEW_PARAM);
  return absolute ? url.href : url.pathname + url.search + url.hash;
}
