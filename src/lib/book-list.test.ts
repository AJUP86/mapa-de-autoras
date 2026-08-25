import { describe, it, expect } from "vitest";
import {
  deriveCountryOptions,
  deriveYearOptions,
  filterBooks,
  type BookListRow,
} from "./book-list";

function row(partial: Partial<BookListRow>): BookListRow {
  return {
    id: "1",
    title: "Untitled",
    year: 2000,
    status: "to_read",
    authorName: "Anon",
    country: "ESP",
    countryName: "España",
    ...partial,
  };
}

describe("deriveCountryOptions", () => {
  it("dedups by code, preserves code, and sorts by name", () => {
    const rows = [
      row({ country: "ARG", countryName: "Argentina" }),
      row({ country: "ESP", countryName: "España" }),
      row({ country: "ARG", countryName: "Argentina" }),
    ];
    expect(deriveCountryOptions(rows, "es")).toEqual([
      { code: "ARG", name: "Argentina" },
      { code: "ESP", name: "España" },
    ]);
  });
});

describe("deriveYearOptions", () => {
  it("dedups, drops nulls, and sorts descending", () => {
    const rows = [
      row({ year: 1999 }),
      row({ year: null }),
      row({ year: 2020 }),
      row({ year: 1999 }),
    ];
    expect(deriveYearOptions(rows)).toEqual([2020, 1999]);
  });
});

describe("filterBooks", () => {
  const rows = [
    row({ id: "1", authorName: "Isabel Allende", country: "CHL", year: 1982 }),
    row({ id: "2", authorName: "Gabriela Mistral", country: "CHL", year: 1922 }),
    row({ id: "3", authorName: "Clarice Lispector", country: "BRA", year: 1943 }),
  ];

  it("returns all rows when every filter is empty", () => {
    expect(filterBooks(rows, { author: "", country: "", year: "" })).toHaveLength(3);
  });

  it("matches author as a case-insensitive substring", () => {
    const out = filterBooks(rows, { author: "allende", country: "", year: "" });
    expect(out.map((r) => r.id)).toEqual(["1"]);
  });

  it("matches country by exact code", () => {
    const out = filterBooks(rows, { author: "", country: "CHL", year: "" });
    expect(out.map((r) => r.id)).toEqual(["1", "2"]);
  });

  it("matches year via String(year)", () => {
    const out = filterBooks(rows, { author: "", country: "", year: "1943" });
    expect(out.map((r) => r.id)).toEqual(["3"]);
  });

  it("combines the three filters with AND", () => {
    const out = filterBooks(rows, { author: "gabriela", country: "CHL", year: "1922" });
    expect(out.map((r) => r.id)).toEqual(["2"]);
    expect(filterBooks(rows, { author: "gabriela", country: "BRA", year: "" })).toHaveLength(0);
  });
});
