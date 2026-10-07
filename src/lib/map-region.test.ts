import { describe, it, expect } from "vitest";
import { COUNTRY_FRAMES, REGION_BOXES, regionFromTimeZone } from "./map-region";

describe("REGION_BOXES", () => {
  it.each([
    ["Jerusalem", 35.2, 31.8],
    ["Beirut", 35.5, 33.9],
    ["Amman", 35.9, 31.9],
  ])("asia frames the Levant (%s)", (_city, lon, lat) => {
    const [[west, south], [east, north]] = REGION_BOXES.asia;
    expect(lon).toBeGreaterThanOrEqual(west);
    expect(lon).toBeLessThanOrEqual(east);
    expect(lat).toBeGreaterThanOrEqual(south);
    expect(lat).toBeLessThanOrEqual(north);
  });
});

describe("COUNTRY_FRAMES", () => {
  it("frames Russia on its European part", () => {
    const frame = COUNTRY_FRAMES.RUS;
    expect(frame).toBeDefined();
    const [[west, south], [east, north]] = frame;
    expect(west).toBeGreaterThanOrEqual(20);
    expect(east).toBeLessThanOrEqual(65);
    expect(west).toBeLessThan(east);
    expect(south).toBeLessThan(north);
  });
});

describe("regionFromTimeZone", () => {
  it.each([
    ["Europe/Amsterdam", "europe"],
    ["Europe/Madrid", "europe"],
    ["Atlantic/Canary", "europe"],
    ["America/Mexico_City", "americas"],
    ["America/Argentina/Buenos_Aires", "americas"],
    ["Africa/Lagos", "africa"],
    ["Asia/Tokyo", "asia"],
    ["Australia/Sydney", "oceania"],
    ["Pacific/Auckland", "oceania"],
  ])("%s → %s", (tz, region) => {
    expect(regionFromTimeZone(tz)).toBe(region);
  });

  it.each(["UTC", "Etc/GMT+3", "Pacific/Honolulu", "Atlantic/Bermuda", "", null, undefined])(
    "unknown or ambiguous zone %s → null",
    (tz) => {
      expect(regionFromTimeZone(tz)).toBeNull();
    },
  );
});
