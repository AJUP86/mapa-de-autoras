import { describe, it, expect } from "vitest";
import { showDot } from "./map-markers";

describe("showDot", () => {
  it("shows a dot for a small colored country", () => {
    expect(showDot(20, 1, true)).toBe(true);
  });
  it("hides the dot once zoom makes the country fingertip-sized", () => {
    expect(showDot(20, 6, true)).toBe(true); // 720 px²
    expect(showDot(20, 7, true)).toBe(false); // 980 px²
  });
  it("never shows a dot for an uncolored or large country", () => {
    expect(showDot(20, 1, false)).toBe(false);
    expect(showDot(5000, 1, true)).toBe(false);
  });
});
