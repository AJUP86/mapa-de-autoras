import { describe, it, expect } from "vitest";
import { geoBounds } from "d3-geo";
import { WORLD_FEATURES, mainShape } from "./world-geo";

describe("WORLD_FEATURES", () => {
  it("keys countries by ISO alpha-3", () => {
    const isos = WORLD_FEATURES.map((f) => f.properties.iso);
    expect(isos).toContain("ESP");
    expect(isos).toContain("NLD");
  });
  it("drops Antarctica but keeps shapes without an ISO code (e.g. Kosovo)", () => {
    expect(WORLD_FEATURES.some((f) => f.properties.iso === "ATA")).toBe(false);
    expect(WORLD_FEATURES.some((f) => f.properties.name === "Kosovo")).toBe(true);
  });
  it("gives every feature a unique string id", () => {
    const ids = WORLD_FEATURES.map((f) => f.id);
    expect(new Set(ids).size).toBe(ids.length);
  });
});

describe("mainShape", () => {
  it("frames the USA on the contiguous states, not Alaska", () => {
    const usa = WORLD_FEATURES.find((f) => f.properties.iso === "USA")!;
    const [[west], [east]] = geoBounds(mainShape(usa));
    expect(west).toBeGreaterThan(-130);
    expect(east).toBeLessThan(-60);
  });
});
