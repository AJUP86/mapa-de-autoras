// map-markers.ts — Stage 11
//
// Small countries get a dot so they can be tapped. A dot shows while the
// country's on-screen area is under about a fingertip (30 × 30 px) and the
// country has a color under the current filter.

/** On-screen area (px²) below which a colored country gets a dot. */
export const DOT_MAX_AREA_PX = 900;

/**
 * @param baseAreaPx the country's projected area at zoom 1
 * @param zoom       current zoom factor (area grows with zoom²)
 * @param hasColor   whether the country is colored under the current filter
 */
export function showDot(baseAreaPx: number, zoom: number, hasColor: boolean): boolean {
  return hasColor && baseAreaPx * zoom * zoom < DOT_MAX_AREA_PX;
}
