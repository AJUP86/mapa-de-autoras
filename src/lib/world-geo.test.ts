import { describe, it, expect } from "vitest";
import { geoBounds } from "d3-geo";
import world110 from "world-atlas/countries-110m.json";
import { WORLD_FEATURES, mainShape, worldFeatures } from "./world-geo";

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

describe("worldFeatures (110m, the home picture)", () => {
  const features = worldFeatures(world110);
  it("applies the same ISO and Antarctica rules to the coarser data", () => {
    const isos = features.map((f) => f.properties.iso);
    expect(isos).toContain("ESP");
    expect(isos).toContain("JPN");
    expect(isos).not.toContain("ATA");
    expect(new Set(features.map((f) => f.id)).size).toBe(features.length);
  });
  it("has fewer shapes than the 50m data", () => {
    expect(features.length).toBeLessThan(WORLD_FEATURES.length);
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
