import { describe, it, expect } from "vitest";
import { regionFromTimeZone } from "./map-region";

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
