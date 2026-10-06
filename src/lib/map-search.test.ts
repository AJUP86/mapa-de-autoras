import { describe, it, expect } from "vitest";
import { fold, listGroups, searchCatalog } from "./map-search";
import type { CountryEntry } from "./map-state";

const catalog: CountryEntry[] = [
  {
    iso_a3: "MEX",
    authors: [
      {
        id: "a1",
        name: "Elena Garro",
        books: [{ id: "b1", title: "Los recuerdos del porvenir", year: 1963, status: "read" }],
      },
      {
        id: "a2",
        name: "Fernanda Melchor",
        books: [{ id: "b2", title: "Temporada de huracanes", year: 2017, status: "to_read" }],
      },
    ],
  },
  {
    iso_a3: "JPN",
    authors: [
      {
        id: "a3",
        name: "Sayaka Murata",
        books: [{ id: "b3", title: "La dependienta", year: 2016, status: "reading" }],
      },
    ],
  },
];
const countries = [
  { iso_a3: "JPN", name: "Japón" },
  { iso_a3: "MAR", name: "Marruecos" },
  { iso_a3: "MEX", name: "México" },
];
const names = new Map(countries.map((c) => [c.iso_a3, c.name]));

describe("fold", () => {
  it("strips accents and case", () => {
    expect(fold("México")).toBe("mexico");
    expect(fold("ÁFRICA")).toBe("africa");
  });
});

describe("searchCatalog", () => {
  it("returns nothing for a blank query", () => {
    expect(searchCatalog("  ", catalog, countries)).toEqual({
      countries: [],
      authors: [],
      books: [],
    });
  });
  it("matches countries accent-insensitively, countries with authors first", () => {
    const r = searchCatalog("m", catalog, countries);
    expect(r.countries.map((c) => c.iso_a3)).toEqual(["MEX", "MAR"]);
    expect(r.countries[0].authorCount).toBe(2);
    expect(searchCatalog("mexico", catalog, countries).countries[0].name).toBe("México");
  });
  it("finds authors and books", () => {
    expect(searchCatalog("murata", catalog, countries).authors.map((h) => h.author.id)).toEqual([
      "a3",
    ]);
    expect(searchCatalog("huracanes", catalog, countries).books.map((h) => h.book.id)).toEqual([
      "b2",
    ]);
  });
  it("caps each group at the limit", () => {
    expect(searchCatalog("e", catalog, countries, 1).authors).toHaveLength(1);
  });
});

describe("listGroups", () => {
  it("groups books by country name, alphabetically, authors sorted inside", () => {
    const groups = listGroups(catalog, names, "all", "", "es");
    expect(groups.map((g) => g.name)).toEqual(["Japón", "México"]);
    expect(groups[1].books.map((h) => h.book.id)).toEqual(["b1", "b2"]);
  });
  it("applies the status filter", () => {
    const groups = listGroups(catalog, names, "to_read", "", "es");
    expect(groups.map((g) => g.iso_a3)).toEqual(["MEX"]);
    expect(groups[0].books.map((h) => h.book.id)).toEqual(["b2"]);
  });
  it("matches the query against title, author and country name", () => {
    expect(listGroups(catalog, names, "all", "dependienta", "es")[0].books[0].book.id).toBe("b3");
    expect(listGroups(catalog, names, "all", "garro", "es")[0].books.map((h) => h.book.id)).toEqual(
      ["b1"],
    );
    expect(listGroups(catalog, names, "all", "japon", "es").map((g) => g.iso_a3)).toEqual(["JPN"]);
  });
});
