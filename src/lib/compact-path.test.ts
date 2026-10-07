import { describe, it, expect } from "vitest";
import { geoIdentity, geoPath } from "d3-geo";
import type { Polygon } from "geojson";
import { CompactPath } from "./compact-path";

function draw(step: number, ...rings: [number, number][][]): string {
  const p = new CompactPath(step);
  for (const ring of rings) {
    ring.forEach(([x, y], i) => (i === 0 ? p.moveTo(x, y) : p.lineTo(x, y)));
    p.closePath();
  }
  return p.toString();
}

describe("CompactPath", () => {
  it("writes the first point absolute and the rest relative, with implicit line-tos", () => {
    expect(
      draw(1, [
        [10, 20],
        [15, 20],
        [15, 25],
      ]),
    ).toBe("m10 20 5 0 0 5z");
  });
  it("starts the next ring relative to the previous ring's start", () => {
    expect(
      draw(
        1,
        [
          [10, 20],
          [15, 20],
          [15, 25],
        ],
        [
          [12, 18],
          [13, 18],
          [13, 19],
        ],
      ),
    ).toBe("m10 20 5 0 0 5zm2-2 1 0 0 1z");
  });
  it("snaps absolute coordinates to the grid, so rounding never accumulates", () => {
    expect(
      draw(1, [
        [0.4, 0.4],
        [1.4, 0.4],
        [2.4, 0.4],
        [2.4, 1.6],
      ]),
    ).toBe("m0 0 1 0 1 0 0 2z");
  });
  it("supports a half-unit grid with short decimals", () => {
    expect(
      draw(0.5, [
        [0, 0],
        [0.5, 0],
        [0.5, -1.5],
      ]),
    ).toBe("m0 0 .5 0 0-1.5z");
  });
  it("drops repeated points and rings that collapse below three points", () => {
    expect(
      draw(
        1,
        [
          [10, 10],
          [10.2, 10.1],
          [10.3, 9.9],
        ],
        [
          [0, 0],
          [4, 0],
          [4, 0.2],
          [4, 4],
          [0.1, 0.1],
        ],
      ),
    ).toBe("m0 0 4 0 0 4z");
    expect(draw(1, [[1, 1]])).toBe("");
  });
  it("works as a d3-geo path context", () => {
    const square: Polygon = {
      type: "Polygon",
      coordinates: [
        [
          [0, 0],
          [0, 10],
          [10, 10],
          [10, 0],
          [0, 0],
        ],
      ],
    };
    const ctx = new CompactPath(1);
    geoPath(geoIdentity(), ctx)(square);
    expect(ctx.toString()).toBe("m0 0 0 10 10 0 0-10z");
  });
});
