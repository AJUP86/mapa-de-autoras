import { describe, it, expect, vi } from "vitest";
import { requireCountries } from "./build-countries";

// Keeps the Supabase client out of the test.
vi.mock("./countries", () => ({ getCountries: vi.fn() }));

const list = [{ iso_a3: "MEX", name: "México" }];

describe("requireCountries", () => {
  it("passes a non-empty list through, hosted or not", () => {
    expect(requireCountries(list, true)).toBe(list);
    expect(requireCountries(list, false)).toBe(list);
  });
  it("tolerates an empty list outside the hosted build (CI, local)", () => {
    expect(requireCountries([], false)).toEqual([]);
  });
  it("fails the hosted build on an empty list", () => {
    expect(() => requireCountries([], true)).toThrow(/getCountries\(\) returned no countries/);
  });
});
