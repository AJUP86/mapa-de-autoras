import { describe, it, expect } from "vitest";
import { countryColor, countryStatuses, type BookStatus, type CountryEntry } from "./map-state";

function book(
  status: BookStatus,
  id: string = status,
): { id: string; title: string; status: BookStatus } {
  return { id, title: id, status };
}
function author(books: ReturnType<typeof book>[], id = "a") {
  return { id, name: id, books };
}

describe("countryStatuses", () => {
  it("lists each country's distinct statuses in read > reading > to_read order", () => {
    const e: CountryEntry[] = [
      {
        iso_a3: "ARG",
        authors: [
          author([book("to_read", "t"), book("read", "r")], "a1"),
          author([book("to_read", "t2")], "a2"),
        ],
      },
    ];
    expect(countryStatuses(e)).toEqual({ ARG: ["read", "to_read"] });
  });
  it("omits countries whose authors have no books", () => {
    expect(countryStatuses([{ iso_a3: "AUS", authors: [author([])] }])).toEqual({});
  });
});

describe("countryColor", () => {
  it("is null for a country without books", () => {
    expect(countryColor(undefined, "all")).toBeNull();
    expect(countryColor([], "read")).toBeNull();
  });
  it("all: priority read > reading > to_read", () => {
    expect(countryColor(["read", "to_read"], "all")).toBe("read");
    expect(countryColor(["reading", "to_read"], "all")).toBe("reading");
    expect(countryColor(["to_read"], "all")).toBe("to_read");
  });
  it("a specific filter colors a country only if it has that status", () => {
    // Regression: a reading + to_read country used to light up under "read".
    expect(countryColor(["reading", "to_read"], "read")).toBeNull();
    expect(countryColor(["reading", "to_read"], "reading")).toBe("reading");
    expect(countryColor(["read"], "to_read")).toBeNull();
  });
});
