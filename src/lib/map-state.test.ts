import { describe, it, expect } from "vitest";
import { computeCountryStates, fillFor, type BookStatus, type CountryEntry } from "./map-state";

function book(
  status: BookStatus,
  id: string = status,
): { id: string; title: string; status: BookStatus } {
  return { id, title: id, status };
}
function author(books: ReturnType<typeof book>[], id = "a") {
  return { id, name: id, books };
}

describe("computeCountryStates (book-status driven)", () => {
  it("is empty for no entries", () => {
    expect(computeCountryStates([])).toEqual({});
  });
  it("omits countries whose authors have no books", () => {
    const e: CountryEntry[] = [{ iso_a3: "AUS", authors: [author([])] }];
    expect(computeCountryStates(e)).toEqual({});
  });
  it("labels a country by its single distinct book status", () => {
    expect(computeCountryStates([{ iso_a3: "ESP", authors: [author([book("to_read")])] }])).toEqual(
      { ESP: "to_read" },
    );
    expect(computeCountryStates([{ iso_a3: "ARG", authors: [author([book("reading")])] }])).toEqual(
      { ARG: "reading" },
    );
  });
  it("aggregates across books of multiple authors", () => {
    const e: CountryEntry[] = [
      {
        iso_a3: "AUS",
        authors: [author([book("read", "r")], "a1"), author([book("to_read", "t")], "a2")],
      },
    ];
    expect(computeCountryStates(e)).toEqual({ AUS: "mixed" });
  });
  it("mixed when one author has books in two statuses", () => {
    const e: CountryEntry[] = [
      { iso_a3: "AUS", authors: [author([book("read", "r"), book("reading", "g")])] },
    ];
    expect(computeCountryStates(e)).toEqual({ AUS: "mixed" });
  });
  it("collapses repeated identical statuses to one", () => {
    const e: CountryEntry[] = [
      { iso_a3: "AUS", authors: [author([book("read", "r1"), book("read", "r2")])] },
    ];
    expect(computeCountryStates(e)).toEqual({ AUS: "read" });
  });
});

describe("fillFor", () => {
  it("empty → empty style regardless of filter", () => {
    expect(fillFor("empty", "all").fill).toContain("parchment");
  });
  it("filter read shows read + mixed, hides others", () => {
    expect(fillFor("read", "read").fill).toContain("state-read");
    expect(fillFor("mixed", "read").fill).toContain("state-read");
    expect(fillFor("to_read", "read").fill).toContain("parchment");
  });
  it("filter all: mixed surfaces by priority read > reading > to_read", () => {
    expect(fillFor("mixed", "all").fill).toContain("state-read");
    expect(fillFor("reading", "all").fill).toContain("state-reading");
    expect(fillFor("to_read", "all").fill).toContain("state-to-read");
  });
});
