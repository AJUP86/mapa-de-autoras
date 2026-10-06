// WorldMap.tsx — Stage 11
//
// Full-bleed world map drawn with d3-geo and driven by d3-zoom (replaces the
// react19-simple-maps wrapper, which hid d3-zoom). React renders the country
// paths and dots; the zoom transform is written straight to the DOM through a
// ref so panning never re-renders ~175 paths per frame.

import { useEffect, useImperativeHandle, useMemo, useRef, useState, type Ref } from "react";
import { geoEqualEarth, geoPath } from "d3-geo";
import { select } from "d3-selection";
import { zoom as d3zoom, zoomIdentity, type ZoomBehavior, type ZoomTransform } from "d3-zoom";
import "d3-transition";
import { WORLD, WORLD_FEATURES, mainShape } from "~/lib/world-geo";
import { COUNTRY_FRAMES, REGION_BOXES, type RegionKey } from "~/lib/map-region";
import { showDot } from "~/lib/map-markers";
import type { BookStatus } from "~/lib/map-state";

export interface Insets {
  top: number;
  right: number;
  bottom: number;
  left: number;
}

export interface WorldMapHandle {
  flyToCountry(iso: string): void;
  flyToRegion(key: RegionKey): void;
  showWorld(): void;
  zoomBy(factor: number): void;
}

interface Props {
  ref?: Ref<WorldMapHandle>;
  /** Color per ISO code under the current filter; missing or null = uncolored. */
  colors: Readonly<Record<string, BookStatus | null>>;
  selectedIso: string | null;
  ariaLabel: string;
  /** Region to open on when the screen is portrait (phones). null = Atlantic view. */
  initialRegion: RegionKey | null;
  /** Screen edges covered by floating UI; fly-to frames the free area. */
  getInsets: () => Insets;
  onSelectCountry: (iso: string) => void;
  onBackgroundClick: () => void;
}

type Bounds = [[number, number], [number, number]];
type LonLatBox = [[number, number], [number, number]];

const PAD = 16;
const MAX_ZOOM = 16;

function reducedMotion(): boolean {
  return window.matchMedia("(prefers-reduced-motion: reduce)").matches;
}

/** Phones are < 768 px (global constraint); everything wider gets the gentler desktop zoom. */
const isDesktop = () => window.innerWidth >= 768;

/**
 * Half of d3's mouse-wheel zoom speed and ~5x gentler trackpad pinch (ctrlKey):
 * the stock values jump too far on laptops. Touch fires no wheel events, so phones are unaffected.
 */
function wheelDelta(event: WheelEvent): number {
  return (
    -event.deltaY *
    (event.deltaMode === 1 ? 0.025 : event.deltaMode ? 0.5 : 0.001) *
    (event.ctrlKey ? 4 : 1)
  );
}

export default function WorldMap({
  ref,
  colors,
  selectedIso,
  ariaLabel,
  initialRegion,
  getInsets,
  onSelectCountry,
  onBackgroundClick,
}: Props) {
  const wrapRef = useRef<HTMLDivElement>(null);
  const svgRef = useRef<SVGSVGElement>(null);
  const layerRef = useRef<SVGGElement>(null);
  const zoomRef = useRef<ZoomBehavior<SVGSVGElement, unknown> | null>(null);
  const kRef = useRef(1);
  const [size, setSize] = useState<{ w: number; h: number } | null>(null);

  // Track the container size; a real change re-fits the projection.
  useEffect(() => {
    const el = wrapRef.current;
    if (!el) return;
    const ro = new ResizeObserver(([entry]) => {
      const w = Math.round(entry.contentRect.width);
      const h = Math.round(entry.contentRect.height);
      if (w > 0 && h > 0)
        setSize((prev) => (prev && prev.w === w && prev.h === h ? prev : { w, h }));
    });
    ro.observe(el);
    return () => ro.disconnect();
  }, []);

  const geo = useMemo(() => {
    if (!size) return null;
    const projection = geoEqualEarth().fitExtent(
      [
        [PAD, PAD],
        [size.w - PAD, size.h - PAD],
      ],
      WORLD,
    );
    const path = geoPath(projection);
    const shapes = WORLD_FEATURES.map((f) => ({
      id: f.id,
      iso: f.properties.iso,
      d: path(f) ?? "",
    }));
    const dots = WORLD_FEATURES.flatMap((f) => {
      const iso = f.properties.iso;
      const area = path.area(f);
      if (!iso || !showDot(area, 1, true)) return [];
      const [x, y] = path.centroid(mainShape(f));
      return [{ iso, x, y, area }];
    });
    return { projection, path, shapes, dots, worldBounds: path.bounds(WORLD) as Bounds };
  }, [size]);

  /** Keep dots the same size on screen and hide them once the country is big enough. */
  const placeDots = (k: number) => {
    layerRef.current?.querySelectorAll<SVGGElement>("g[data-dot]").forEach((g) => {
      const x = Number(g.dataset.x);
      const y = Number(g.dataset.y);
      g.setAttribute("transform", `translate(${x},${y}) scale(${1 / k})`);
      g.style.display = showDot(Number(g.dataset.area), k, true) ? "" : "none";
    });
  };

  /** `fill` = share of the free area the bounds should take (lower = more context around it). */
  const boundsTransform = (b: Bounds, maxK: number, fill = 0.8): ZoomTransform => {
    const { w, h } = size!;
    const i = getInsets();
    const fw = Math.max(w - i.left - i.right, 40);
    const fh = Math.max(h - i.top - i.bottom, 40);
    const bw = Math.max(b[1][0] - b[0][0], 3);
    const bh = Math.max(b[1][1] - b[0][1], 3);
    const k = Math.max(1, Math.min(maxK, fill * Math.min(fw / bw, fh / bh)));
    const mx = (b[0][0] + b[1][0]) / 2;
    const my = (b[0][1] + b[1][1]) / 2;
    return zoomIdentity.translate(i.left + fw / 2 - k * mx, i.top + fh / 2 - k * my).scale(k);
  };

  /** Screen bounds of a [[west, south], [east, north]] lon/lat box (regions, country frames). */
  const boxBounds = ([[west, south], [east, north]]: LonLatBox): Bounds => {
    let x0 = Infinity,
      y0 = Infinity,
      x1 = -Infinity,
      y1 = -Infinity;
    // Sample a grid: Equal Earth curves meridians, so corners alone are not enough.
    for (let i = 0; i <= 6; i++)
      for (let j = 0; j <= 6; j++) {
        const p = geo!.projection([
          west + ((east - west) * i) / 6,
          south + ((north - south) * j) / 6,
        ]);
        if (!p) continue;
        x0 = Math.min(x0, p[0]);
        y0 = Math.min(y0, p[1]);
        x1 = Math.max(x1, p[0]);
        y1 = Math.max(y1, p[1]);
      }
    return [
      [x0, y0],
      [x1, y1],
    ];
  };

  const initialTransform = (): ZoomTransform => {
    const { w, h } = size!;
    if (h < w * 1.1) return zoomIdentity; // landscape: the whole world fits
    if (initialRegion) return boundsTransform(boxBounds(REGION_BOXES[initialRegion]), 8);
    // Portrait, unknown region: Americas + Europe + Africa around the Atlantic.
    const b = geo!.worldBounds;
    const k = Math.max(1, Math.min(3.4, (h * 0.5) / (b[1][1] - b[0][1])));
    const [px, py] = geo!.projection([-38, 14])!;
    return zoomIdentity.translate(w / 2 - k * px, h / 2 - k * py).scale(k);
  };

  const animateTo = (t: ZoomTransform, ms = 700) => {
    const svg = svgRef.current;
    const z = zoomRef.current;
    if (!svg || !z) return;
    select(svg)
      .transition()
      .duration(reducedMotion() ? 0 : ms)
      .call(z.transform, t);
  };

  // (Re)build the zoom behavior whenever the projection changes.
  useEffect(() => {
    const svg = svgRef.current;
    const layer = layerRef.current;
    if (!svg || !layer || !geo) return;
    const b = geo.worldBounds;
    const z = d3zoom<SVGSVGElement, unknown>()
      .scaleExtent([1, MAX_ZOOM])
      .translateExtent([
        [b[0][0] - 24, b[0][1] - 24],
        [b[1][0] + 24, b[1][1] + 24],
      ])
      .clickDistance(8)
      .wheelDelta(wheelDelta)
      .on("zoom", (event: { transform: ZoomTransform }) => {
        kRef.current = event.transform.k;
        layer.setAttribute("transform", event.transform.toString());
        placeDots(event.transform.k);
      });
    zoomRef.current = z;
    const sel = select(svg).call(z);
    // Desktop: a double-click on a country would add d3's 2x jump on top of the fly-to.
    // Not on phones: d3 also routes its double-tap zoom through "dblclick.zoom".
    if (isDesktop()) sel.on("dblclick.zoom", null);
    sel.call(z.transform, initialTransform());
    return () => {
      sel.on(".zoom", null);
    };
    // initialTransform/placeDots read refs and `geo`; rebuilding on geo is intended.
  }, [geo]);

  // Newly colored countries render new dot elements: place them for the current zoom.
  useEffect(() => {
    placeDots(kRef.current);
  }, [colors, geo]);

  useImperativeHandle(
    ref,
    () => ({
      flyToCountry(iso) {
        const f = WORLD_FEATURES.find((x) => x.properties.iso === iso);
        if (!f || !geo) return;
        // Countries that frame badly on their own shape (Russia) use an explicit lon/lat box.
        const frame = COUNTRY_FRAMES[iso];
        const b = frame ? boxBounds(frame) : (geo.path.bounds(mainShape(f)) as Bounds);
        // Desktop: stop sooner and leave neighbors in view; phones keep the tight framing.
        if (isDesktop()) animateTo(boundsTransform(b, 4, 0.6), 900);
        else animateTo(boundsTransform(b, 7));
      },
      flyToRegion(key) {
        if (geo) animateTo(boundsTransform(boxBounds(REGION_BOXES[key]), isDesktop() ? 5 : 8));
      },
      showWorld() {
        animateTo(zoomIdentity);
      },
      zoomBy(factor) {
        const svg = svgRef.current;
        const z = zoomRef.current;
        if (svg && z)
          select(svg)
            .transition()
            .duration(reducedMotion() ? 0 : 250)
            .call(z.scaleBy, factor);
      },
    }),
    [geo, size, getInsets],
  );

  // Draw the selected country last so its outline sits on top of its neighbors.
  const shapes = geo
    ? selectedIso
      ? [
          ...geo.shapes.filter((s) => s.iso !== selectedIso),
          ...geo.shapes.filter((s) => s.iso === selectedIso),
        ]
      : geo.shapes
    : [];

  return (
    <div ref={wrapRef} className="absolute inset-0 bg-water">
      {geo && size && (
        <svg
          ref={svgRef}
          width={size.w}
          height={size.h}
          role="img"
          aria-label={ariaLabel}
          className="world-map block touch-none select-none"
          onClick={(e) => {
            if (e.target === svgRef.current) onBackgroundClick();
          }}
        >
          <g ref={layerRef}>
            {shapes.map((s) => {
              const c = s.iso ? colors[s.iso] : null;
              const cls =
                "map-country" +
                (c ? ` is-${c}` : "") +
                (s.iso && s.iso === selectedIso ? " is-selected" : "");
              const iso = s.iso;
              return (
                <path
                  key={s.id}
                  d={s.d}
                  className={cls}
                  onClick={iso ? () => onSelectCountry(iso) : undefined}
                />
              );
            })}
            {geo.dots
              .filter((d) => colors[d.iso])
              .map((d) => (
                <g
                  key={d.iso}
                  data-dot=""
                  data-x={d.x}
                  data-y={d.y}
                  data-area={d.area}
                  className={`map-dot is-${colors[d.iso]}`}
                  style={{ display: "none" }}
                  onClick={() => onSelectCountry(d.iso)}
                >
                  <circle className="map-dot-hit" r={20} />
                  <circle className="map-dot-pin" r={7} />
                </g>
              ))}
          </g>
        </svg>
      )}
    </div>
  );
}
