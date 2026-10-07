// site-config.ts — Stage 11. Build-time switches for the public site.
//
// PUBLIC_MAP_OPEN decides the release phase: "true" = the map is open (home
// shows "Abrir el mapa"); anything else = coming-soon mode (home shows the
// waitlist card). Read at build time, so flipping it needs a redeploy.

/** Only the exact string "true" opens the map; unset or anything else keeps it closed. */
export function parseMapOpen(value: string | undefined): boolean {
  return value === "true";
}

export const MAP_OPEN = parseMapOpen(import.meta.env.PUBLIC_MAP_OPEN);
