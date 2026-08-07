import { describe, it, expect } from "vitest";
import {
  computeCountryStates,
  fillFor,
  type AuthorStatus,
  type CountryEntry,
  type Filter,
} from "./map-state";

function author(status: AuthorStatus, id: string = status) {
  return { id, name: id, status, books: [] };
}

describe("computeCountryStates", () => {
  it("returns an empty map for no entries", () => {
    expect(computeCountryStates([])).toEqual({});
  });

  it("omits countries that have no authors", () => {
    const entries: CountryEntry[] = [{ iso_a3: "AUS", authors: [] }];
    expect(computeCountryStates(entries)).toEqual({});
  });

  it("labels a single-status country by that status", () => {
    expect(computeCountryStates([{ iso_a3: "AUS", authors: [author("read")] }])).toEqual({
      AUS: "read",
    });
    expect(
      computeCountryStates([{ iso_a3: "ARG", authors: [author("currently_reading")] }]),
    ).toEqual({ ARG: "currently_reading" });
    expect(computeCountryStates([{ iso_a3: "ESP", authors: [author("discovery")] }])).toEqual({
      ESP: "discovery",
    });
  });

  it("labels a country with two distinct statuses as mixed", () => {
    expect(
      computeCountryStates([
        {
          iso_a3: "AUS",
          authors: [author("read", "a"), author("discovery", "b")],
        },
      ]),
    ).toEqual({ AUS: "mixed" });
  });

  it("labels a country with all three statuses as mixed", () => {
    expect(
      computeCountryStates([
        {
          iso_a3: "AUS",
          authors: [
            author("read", "a"),
            author("currently_reading", "b"),
            author("discovery", "c"),
          ],
        },
      ]),
    ).toEqual({ AUS: "mixed" });
  });

  it("treats repeated identical statuses as a single status (not mixed)", () => {
    expect(
      computeCountryStates([
        {
          iso_a3: "AUS",
          authors: [author("read", "a"), author("read", "b")],
        },
      ]),
    ).toEqual({ AUS: "read" });
  });

  it("handles multiple countries independently", () => {
    expect(
      computeCountryStates([
        { iso_a3: "AUS", authors: [author("read")] },
        { iso_a3: "ESP", authors: [author("discovery")] },
      ]),
    ).toEqual({ AUS: "read", ESP: "discovery" });
  });
});

describe("fillFor", () => {
  const READ = "var(--c-state-read)";
  const CURRENT = "var(--c-state-currently-reading)";
  const DISCOVERY = "var(--c-state-discovery)";
  const EMPTY = "var(--c-parchment)";
  const FILTERS: Filter[] = ["all", "read", "currently_reading", "discoveries"];

  it("empty state is always the empty style, under every filter", () => {
    for (const f of FILTERS) expect(fillFor("empty", f).fill).toBe(EMPTY);
  });

  it("filter=all colors each state; mixed surfaces as read (priority)", () => {
    expect(fillFor("read", "all").fill).toBe(READ);
    expect(fillFor("currently_reading", "all").fill).toBe(CURRENT);
    expect(fillFor("discovery", "all").fill).toBe(DISCOVERY);
    expect(fillFor("mixed", "all").fill).toBe(READ);
  });

  it("filter=read shows read + mixed, hides the rest", () => {
    expect(fillFor("read", "read").fill).toBe(READ);
    expect(fillFor("mixed", "read").fill).toBe(READ);
    expect(fillFor("currently_reading", "read").fill).toBe(EMPTY);
    expect(fillFor("discovery", "read").fill).toBe(EMPTY);
  });

  it("filter=currently_reading shows current + mixed, hides the rest", () => {
    expect(fillFor("currently_reading", "currently_reading").fill).toBe(CURRENT);
    expect(fillFor("mixed", "currently_reading").fill).toBe(CURRENT);
    expect(fillFor("read", "currently_reading").fill).toBe(EMPTY);
    expect(fillFor("discovery", "currently_reading").fill).toBe(EMPTY);
  });

  it("filter=discoveries shows discovery + mixed, hides the rest", () => {
    expect(fillFor("discovery", "discoveries").fill).toBe(DISCOVERY);
    expect(fillFor("mixed", "discoveries").fill).toBe(DISCOVERY);
    expect(fillFor("read", "discoveries").fill).toBe(EMPTY);
    expect(fillFor("currently_reading", "discoveries").fill).toBe(EMPTY);
  });

  it("pairs each fill with its matching stroke", () => {
    expect(fillFor("read", "all").stroke).toBe("var(--c-state-read-line)");
    expect(fillFor("currently_reading", "all").stroke).toBe(
      "var(--c-state-currently-reading-line)",
    );
    expect(fillFor("discovery", "all").stroke).toBe("var(--c-state-discovery-line)");
  });
});
