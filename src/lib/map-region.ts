// map-region.ts — Stage 11
//
// Pick the visitor's world region from the browser time zone so the map can
// open there on phones. No permission prompt and nothing leaves the device:
// Intl already knows the zone (e.g. "Europe/Amsterdam").

export type RegionKey = "europe" | "americas" | "africa" | "asia" | "oceania";

/** [[west, south], [east, north]] in degrees — framing boxes, not borders. */
export const REGION_BOXES: Record<RegionKey, [[number, number], [number, number]]> = {
  europe: [
    [-11, 36],
    [38, 70],
  ],
  americas: [
    [-124, -55],
    [-35, 60],
  ],
  africa: [
    [-17, -35],
    [51, 37],
  ],
  asia: [
    [45, -8],
    [146, 55],
  ],
  oceania: [
    [113, -46],
    [178, -8],
  ],
};

/**
 * Countries whose shape frames badly (it spans the antimeridian or most of the
 * map, so the fly-to would zoom out to the whole world) get an explicit
 * framing box, same format as REGION_BOXES. Keyed by ISO alpha-3.
 */
export const COUNTRY_FRAMES: Readonly<Record<string, [[number, number], [number, number]]>> = {
  // European Russia: St Petersburg and Moscow to the Urals.
  RUS: [
    [27, 43],
    [62, 69],
  ],
};

export const REGION_ORDER: RegionKey[] = ["europe", "americas", "africa", "asia", "oceania"];

const ATLANTIC_EUROPE = ["Canary", "Madeira", "Azores", "Faroe", "Reykjavik"];
const PACIFIC_OCEANIA = [
  "Auckland",
  "Chatham",
  "Fiji",
  "Port_Moresby",
  "Noumea",
  "Guadalcanal",
  "Efate",
  "Tongatapu",
  "Apia",
];

export function regionFromTimeZone(tz: string | null | undefined): RegionKey | null {
  if (!tz) return null;
  const [area, place = ""] = tz.split("/");
  if (area === "Europe") return "europe";
  if (area === "Atlantic" && ATLANTIC_EUROPE.includes(place)) return "europe";
  if (area === "America") return "americas";
  if (area === "Africa") return "africa";
  if (area === "Asia") return "asia";
  if (area === "Australia") return "oceania";
  if (area === "Pacific" && PACIFIC_OCEANIA.includes(place)) return "oceania";
  return null;
}

/** The current browser's region, or null when the zone is unknown. */
export function browserRegion(): RegionKey | null {
  try {
    return regionFromTimeZone(Intl.DateTimeFormat().resolvedOptions().timeZone);
  } catch {
    return null;
  }
}
