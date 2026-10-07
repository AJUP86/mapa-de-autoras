// WorldMap.tsx — Stage 11
//
// Full-bleed world map drawn with d3-geo and driven by d3-zoom (replaces the
// react19-simple-maps wrapper, which hid d3-zoom). React renders the country
// paths and dots; the zoom transform is written straight to the DOM through a
// ref so panning never re-renders ~175 paths per frame.

import {
  useEffect,
  useImperativeHandle,
  useLayoutEffect,
  useMemo,
  useRef,
  useState,
  type Ref,
} from "react";
import { geoEqualEarth, geoPath } from "d3-geo";
import { select } from "d3-selection";
import { zoom as d3zoom, zoomIdentity, type ZoomBehavior, type ZoomTransform } from "d3-zoom";
import "d3-transition";
import { WORLD, WORLD_FEATURES, mainShape } from "~/lib/world-geo";
import { COUNTRY_FRAMES, REGION_BOXES, type RegionKey } from "~/lib/map-region";
import { showDot } from "~/lib/map-markers";
import type { BookStatus } from "~/lib/map-state";
import { isDesktopWidth } from "./layout";

export interface Insets {
  top: number;
  right: number;
  bottom: number;
  left: number;
}

export interface WorldMapHandle {
  flyToCountry(iso: string): void;
  flyToRegion(key: RegionKey): void;
  /** Back to the starting view: phones the visitor's region (Atlantic if unknown), landscape the whole world. */
  showStart(): void;
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
  /**
   * Screen edges the floating UI covers on a map of `width` x `height`; fly-to
   * frames the free area and panning keeps it on the world.
   */
  getInsets: (width: number, height: number) => Insets;
  onSelectCountry: (iso: string) => void;
  onBackgroundClick: () => void;
}

type Bounds = [[number, number], [number, number]];
type LonLatBox = [[number, number], [number, number]];
/** x0, y0, x1, y1 */
type Rect = [number, number, number, number];

/** Projection fit of a layout, to carry the view over to the next one. */
interface Layout {
  w: number;
  h: number;
  scale: number;
  translate: [number, number];
}

const PAD = 16;
const MAX_ZOOM = 16;
/** Below this many free pixels an inset is ignored (same floor as the fly-to framing). */
const MIN_FREE = 40;

function reducedMotion(): boolean {
  return window.matchMedia("(prefers-reduced-motion: reduce)").matches;
}

/** Phones are narrower than DESKTOP_MIN_WIDTH (layout.ts); everything wider gets the gentler desktop zoom. */
const isDesktop = () => isDesktopWidth(window.innerWidth);

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

/** The part of a w x h map the floating UI leaves free; an axis with under MIN_FREE px left ignores its insets. */
function freeRect(w: number, h: number, i: Insets): Rect {
  const wide = w - i.left - i.right >= MIN_FREE;
  const tall = h - i.top - i.bottom >= MIN_FREE;
  return [wide ? i.left : 0, tall ? i.top : 0, wide ? w - i.right : w, tall ? h - i.bottom : h];
}

/**
 * d3-zoom's default pan limit, applied to the part of the screen the floating
 * UI leaves free (`insets`) instead of the whole viewport: the free area must
 * stay on the world. A country near the map's edge (Argentina, New Zealand)
 * can then still be framed above the sheet / left of the side panel, and the
 * next gesture does not snap.
 */
function constrainToFreeArea(
  t: ZoomTransform,
  extent: Bounds,
  translateExtent: Bounds,
  getInsets: (width: number, height: number) => Insets,
): ZoomTransform {
  const [[ox, oy], [ex, ey]] = extent;
  const [fx0, fy0, fx1, fy1] = freeRect(ex - ox, ey - oy, getInsets(ex - ox, ey - oy));
  const [x0, y0, x1, y1] = [ox + fx0, oy + fy0, ox + fx1, oy + fy1];
  const dx0 = t.invertX(x0) - translateExtent[0][0];
  const dx1 = t.invertX(x1) - translateExtent[1][0];
  const dy0 = t.invertY(y0) - translateExtent[0][1];
  const dy1 = t.invertY(y1) - translateExtent[1][1];
  return t.translate(
    dx1 > dx0 ? (dx0 + dx1) / 2 : Math.min(0, dx0) || Math.max(0, dx1),
    dy1 > dy0 ? (dy0 + dy1) / 2 : Math.min(0, dy0) || Math.max(0, dy1),
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
  const transformRef = useRef<ZoomTransform>(zoomIdentity);
  const layoutRef = useRef<Layout | null>(null);
  // Set once the view leaves the initial one (gesture, fly-to, buttons). Until
  // then a rebuild re-fits the initial view, so a transient first layout (the
  // page measured before it settles, a rotation before any touch) does not stick.
  const movedRef = useRef(false);
  // Where the running programmatic transition is heading (null when none).
  const targetRef = useRef<ZoomTransform | null>(null);
  const [size, setSize] = useState<{ w: number; h: number } | null>(null);
  // The pan limit reads the insets on every gesture event.
  const insetsRef = useRef(getInsets);
  useLayoutEffect(() => {
    insetsRef.current = getInsets;
  });

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
    return {
      w: size.w,
      h: size.h,
      projection,
      path,
      shapes,
      dots,
      worldBounds: path.bounds(WORLD) as Bounds,
    };
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

  /** Center of the free area of a w x h map. */
  const freeCenter = (w: number, h: number): [number, number] => {
    const [x0, y0, x1, y1] = freeRect(w, h, getInsets(w, h));
    return [(x0 + x1) / 2, (y0 + y1) / 2];
  };

  /** `fill` = share of the free area the bounds should take (lower = more context around it). */
  const boundsTransform = (b: Bounds, maxK: number, fill = 0.8): ZoomTransform => {
    const { w, h } = size!;
    const [x0, y0, x1, y1] = freeRect(w, h, getInsets(w, h));
    const fw = x1 - x0;
    const fh = y1 - y0;
    const bw = Math.max(b[1][0] - b[0][0], 3);
    const bh = Math.max(b[1][1] - b[0][1], 3);
    const k = Math.max(1, Math.min(maxK, fill * Math.min(fw / bw, fh / bh)));
    const mx = (b[0][0] + b[1][0]) / 2;
    const my = (b[0][1] + b[1][1]) / 2;
    return zoomIdentity.translate(x0 + fw / 2 - k * mx, y0 + fh / 2 - k * my).scale(k);
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

  /**
   * zoom.transform skips the pan limit, so every programmatic target goes
   * through it first — otherwise the next gesture would snap.
   */
  const constrain = (t: ZoomTransform): ZoomTransform => {
    const z = zoomRef.current;
    if (!z || !geo) return t;
    return z.constrain()(
      t,
      [
        [0, 0],
        [geo.w, geo.h],
      ],
      z.translateExtent(),
    );
  };

  /**
   * The previous layout's view on the new one: the same geographic point at
   * the center of the free area (so a country framed beside an open panel
   * stays in view) and the same zoom factor k. Equal Earth (no rotation)
   * projects as translate + scale × raw(lon, lat), so the old point maps to
   * the new layout affinely — the same point as inverting it to lon/lat and
   * projecting it again, but also correct off the globe's outline, where
   * projection.invert() would wrap the longitude.
   */
  const keepView = (prev: Layout): ZoomTransform => {
    const t = transformRef.current;
    const [cx, cy] = t.invert(freeCenter(prev.w, prev.h));
    const s = geo!.projection.scale() / prev.scale;
    const [tx, ty] = geo!.projection.translate();
    const px = tx + (cx - prev.translate[0]) * s;
    const py = ty + (cy - prev.translate[1]) * s;
    const [nx, ny] = freeCenter(geo!.w, geo!.h);
    return zoomIdentity.translate(nx - t.k * px, ny - t.k * py).scale(t.k);
  };

  /** `point` stays fixed on screen while zooming (default: the viewport center). */
  const animateTo = (t: ZoomTransform, ms = 700, point?: [number, number]) => {
    const svg = svgRef.current;
    const z = zoomRef.current;
    if (!svg || !z) return;
    movedRef.current = true;
    const target = constrain(t);
    targetRef.current = target;
    select(svg)
      .transition()
      .duration(reducedMotion() ? 0 : ms)
      .call(z.transform, target, point)
      .on("end.target interrupt.target", () => {
        if (targetRef.current === target) targetRef.current = null;
      });
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
      .constrain((t, extent, te) => constrainToFreeArea(t, extent, te, insetsRef.current))
      .clickDistance(8)
      .wheelDelta(wheelDelta)
      .on("zoom", (event: { transform: ZoomTransform; sourceEvent: unknown }) => {
        if (event.sourceEvent) movedRef.current = true; // a reader's gesture
        transformRef.current = event.transform;
        layer.setAttribute("transform", event.transform.toString());
        placeDots(event.transform.k);
      });
    zoomRef.current = z;
    const sel = select(svg).call(z);
    // Desktop: a double-click on a country would add d3's 2x jump on top of the fly-to.
    // Not on phones: d3 also routes its double-tap zoom through "dblclick.zoom".
    if (isDesktop()) sel.on("dblclick.zoom", null);
    // First layout: the initial view. Later rebuilds (rotation, window resize,
    // on-screen keyboard) keep what the reader was looking at — or re-fit the
    // initial view if nothing has moved it yet.
    const prev = layoutRef.current;
    layoutRef.current = {
      w: geo.w,
      h: geo.h,
      scale: geo.projection.scale(),
      translate: geo.projection.translate(),
    };
    sel.call(
      z.transform,
      constrain(prev && movedRef.current ? keepView(prev) : initialTransform()),
    );
    return () => {
      // Stop an in-flight fly-to: it would keep tweening on the old layout.
      sel.interrupt();
      sel.on(".zoom", null);
    };
    // initialTransform/keepView/placeDots read refs and `geo`; rebuilding on geo is intended.
  }, [geo]);

  // Newly colored countries render new dot elements: place them for the current zoom.
  useEffect(() => {
    placeDots(transformRef.current.k);
  }, [colors, geo]);

  // Closing the panel grows the free area, so the view may now break the pan
  // limit (e.g. a southern country framed above the sheet): glide back inside
  // it now instead of snapping on the next gesture. A fly-to still running was
  // framed for the panel, so judge (and re-target) where it is heading.
  const prevSelectedRef = useRef(selectedIso);
  useEffect(() => {
    const wasOpen = prevSelectedRef.current !== null;
    prevSelectedRef.current = selectedIso;
    if (!wasOpen || selectedIso !== null) return;
    const from = targetRef.current ?? transformRef.current;
    const c = constrain(from);
    if (Math.abs(c.x - from.x) > 0.5 || Math.abs(c.y - from.y) > 0.5) animateTo(c, 350);
    // constrain/animateTo read refs and `geo` when they run.
  }, [selectedIso]);

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
      showStart() {
        if (!geo) return;
        animateTo(initialTransform());
        // Back at the start: a later rotation re-fits the start view for the new shape.
        movedRef.current = false;
      },
      zoomBy(factor) {
        if (!geo) return;
        // From where a running zoom is heading, so quick clicks compound.
        const t = targetRef.current ?? transformRef.current;
        const k = Math.max(1, Math.min(MAX_ZOOM, t.k * factor));
        // About the center of the free area (left of the side panel when it is open).
        const p = freeCenter(geo.w, geo.h);
        const [lx, ly] = t.invert(p);
        animateTo(zoomIdentity.translate(p[0] - k * lx, p[1] - k * ly).scale(k), 250, p);
      },
    }),
    [geo, size, getInsets, initialRegion],
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
              // No ISO code (Kosovo, N. Cyprus, ...): drawn but not tappable.
              const cls =
                "map-country" +
                (s.iso ? "" : " is-inert") +
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
