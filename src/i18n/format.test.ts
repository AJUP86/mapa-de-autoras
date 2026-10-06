import { describe, it, expect } from "vitest";
import { fmt, plural } from "./format";

describe("fmt", () => {
  it("fills placeholders", () => {
    expect(fmt("Te muestro {region}.", { region: "Europa" })).toBe("Te muestro Europa.");
  });
  it("leaves unknown placeholders untouched", () => {
    expect(fmt("{a} {b}", { a: 1 })).toBe("1 {b}");
  });
});

describe("plural", () => {
  it("picks the singular only for exactly one", () => {
    expect(plural(1, "{n} autora", "{n} autoras")).toBe("1 autora");
    expect(plural(3, "{n} autora", "{n} autoras")).toBe("3 autoras");
    expect(plural(0, "{n} autora", "{n} autoras")).toBe("0 autoras");
  });
});
