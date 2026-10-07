// compact-path.ts — Stage 11. Small SVG path data for the home's static map
// picture. A d3-geo path context: points are snapped to a grid in absolute
// coordinates (so rounding never adds up), then written relative to the
// previous point with implicit line-tos ("m12 3 4-1 2 5z"). Repeated points
// and rings that collapse to fewer than three points are dropped.

import type { GeoContext } from "d3-geo";

type Point = [number, number];

/** Shortest form SVG accepts: "0.5" → ".5", "-0.5" → "-.5"; float noise removed. */
function num(n: number): string {
  const s = String(Number(n.toFixed(6)));
  if (s.startsWith("0.")) return s.slice(1);
  if (s.startsWith("-0.")) return `-${s.slice(2)}`;
  return s;
}

export class CompactPath implements GeoContext {
  private readonly rings: Point[][] = [];
  private ring: Point[] | null = null;

  /** @param step grid size in projected units (1 = whole numbers). */
  constructor(private readonly step = 1) {}

  beginPath(): void {}

  moveTo(x: number, y: number): void {
    this.ring = [];
    this.rings.push(this.ring);
    this.lineTo(x, y);
  }

  lineTo(x: number, y: number): void {
    if (!this.ring) return;
    const p: Point = [Math.round(x / this.step), Math.round(y / this.step)];
    const last = this.ring[this.ring.length - 1];
    if (!last || last[0] !== p[0] || last[1] !== p[1]) this.ring.push(p);
  }

  closePath(): void {
    this.ring = null;
  }

  /** d3 draws points as circles; the picture has none. */
  arc(): void {}

  /** The path data, or "" when every ring collapsed. */
  toString(): string {
    let out = "";
    // No separator after a command letter or before a minus sign.
    const push = (s: string) => {
      out += /[a-z]$/.test(out) || s.startsWith("-") ? s : ` ${s}`;
    };
    let pen: Point = [0, 0];
    for (const raw of this.rings) {
      const ring = raw.slice();
      const first = ring[0];
      const tail = ring[ring.length - 1];
      if (ring.length > 1 && first[0] === tail[0] && first[1] === tail[1]) ring.pop();
      if (ring.length < 3) continue;
      // The first "m" of a path is absolute; after "z" the pen is back on the ring's start.
      out += "m";
      let prev = pen;
      for (const p of ring) {
        push(num((p[0] - prev[0]) * this.step));
        push(num((p[1] - prev[1]) * this.step));
        prev = p;
      }
      out += "z";
      pen = ring[0];
    }
    return out;
  }
}
