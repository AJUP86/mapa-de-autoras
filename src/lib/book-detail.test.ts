import { describe, it, expect } from "vitest";
import { localizeQuotes, visibleLinks, type BookQuoteRow, type BookLinkRow } from "./book-detail";

const quote = (
  id: string,
  display_order: number,
  location: string | null = null,
): BookQuoteRow => ({
  id,
  quote_es: `es-${id}`,
  quote_en: `en-${id}`,
  location,
  display_order,
});

describe("localizeQuotes", () => {
  it("sorts by display_order and picks the Spanish passage", () => {
    const out = localizeQuotes([quote("b", 1), quote("a", 0)], "es");
    expect(out.map((q) => q.id)).toEqual(["a", "b"]);
    expect(out[0].text).toBe("es-a");
  });

  it("picks the English passage for en", () => {
    expect(localizeQuotes([quote("a", 0)], "en")[0].text).toBe("en-a");
  });

  it("keeps the location as-is", () => {
    expect(localizeQuotes([quote("a", 0, "p. 42")], "es")[0].location).toBe("p. 42");
  });

  it("does not mutate the input array", () => {
    const rows = [quote("b", 1), quote("a", 0)];
    localizeQuotes(rows, "es");
    expect(rows.map((q) => q.id)).toEqual(["b", "a"]);
  });
});

describe("visibleLinks", () => {
  const es: BookLinkRow = { retailer: "amazon", url: "https://a.es", locale: "es" };
  const en: BookLinkRow = { retailer: "bookshop", url: "https://b.com", locale: "en" };

  it("keeps only the links matching the reader's locale", () => {
    expect(visibleLinks([es, en], "es")).toEqual([es]);
  });

  it("falls back to every link when none match the locale", () => {
    expect(visibleLinks([es], "en")).toEqual([es]);
  });

  it("returns an empty array when there are no links", () => {
    expect(visibleLinks([], "es")).toEqual([]);
  });
});
