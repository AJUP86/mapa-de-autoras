import { describe, it, expect } from "vitest";
import { parseMapOpen } from "./site-config";

describe("parseMapOpen", () => {
  it('opens the map only for the exact string "true"', () => {
    expect(parseMapOpen("true")).toBe(true);
  });
  it("keeps the map closed for anything else, including unset", () => {
    expect(parseMapOpen(undefined)).toBe(false);
    expect(parseMapOpen("")).toBe(false);
    expect(parseMapOpen("false")).toBe(false);
    expect(parseMapOpen("TRUE")).toBe(false);
    expect(parseMapOpen("1")).toBe(false);
    expect(parseMapOpen(" true")).toBe(false);
  });
});
